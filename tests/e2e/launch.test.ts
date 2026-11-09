/**
 * Launch readiness: plan limits, the postal address, legal pages, tags and segments,
 * the admin page and automatic pausing, account deletion, and email polish.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import sharp from "sharp";
import {
  Client,
  createDraft,
  createOwner,
  mail,
  resetDatabase,
  scalar,
  seedSubscribers,
  sendResendEvent,
  signIn,
  sql,
} from "./helpers";

let owner: Client;
let publicationId: string;
let ownerId: string;
const SLUG = "launch-pub";

before(async () => {
  await resetDatabase();
  ({ owner, publicationId } = await createOwner("writer@example.com", SLUG, "Launch Notes"));
  ownerId = await scalar(sql`select owner_id from publications where id = ${publicationId}`);
});
after(() => sql.end());

const send = (id: string) =>
  owner.action(`/dashboard/posts/${id}`, "posts/actions", "sendPost", [id]);
const month = () => new Date().toISOString().slice(0, 7);
const setUsage = (emails: number) =>
  sql`insert into email_usage (user_id, month, emails) values (${ownerId}, ${month()}, ${emails})
    on conflict (user_id, month) do update set emails = ${emails}`;
const clearList = () => sql`delete from subscribers where publication_id = ${publicationId}`;
let draftCount = 0;
const draft = (content = "Hello") => {
  draftCount += 1;
  return createDraft(owner, `Issue ${draftCount}`, `issue-${draftCount}`, content);
};

describe("sending limits", () => {
  test("over the plan's subscribers, sending pauses; sign-ups don't", async () => {
    await seedSubscribers(
      publicationId,
      Array.from({ length: 1001 }, (_, i) => `many${i}@example.com`),
    );
    const id = await draft();
    const { result } = await send(id);
    assert.equal(result.ok, false);
    assert.match(result.error, /1,001 subscribers, more than the 1,000 on the Free plan/);
    assert.equal(await scalar(sql`select status from posts where id = ${id}`), "draft");

    assert.match(await owner.page("/dashboard"), /reached the Free plan(&#x27;|')s limit/);
    const billing = await owner.page("/dashboard/billing");
    assert.match(billing, /Emails this month/);
    assert.match(billing, /1,001<!-- --> of <!-- -->1,000/);
    await clearList();
  });

  test("the monthly email limit counts every newsletter sent", async () => {
    await seedSubscribers(publicationId, ["a@example.com", "b@example.com", "c@example.com"]);
    await setUsage(9_999);
    const id = await draft();
    const blocked = await send(id);
    assert.match(blocked.result.error, /you have 1 of 10,000 left this month/);

    await setUsage(0);
    const ok = await send(id);
    assert.equal(ok.result.ok, true, JSON.stringify(ok.result));
    assert.equal(
      await scalar(
        sql`select emails from email_usage where user_id = ${ownerId} and month = ${month()}`,
      ),
      "3",
    );
  });

  test("a paid plan raises the limits", async () => {
    await sql`insert into account_billing (user_id, plan) values (${ownerId}, 'pro')
      on conflict (user_id) do update set plan = 'pro'`;
    await setUsage(50_000);
    const id = await draft();
    assert.equal((await send(id)).result.ok, true);
    await sql`update account_billing set plan = 'free' where user_id = ${ownerId}`;
    await setUsage(0);
  });

  test("a scheduled post that hits a limit goes back to draft, and the writer is told", async () => {
    await mail.clear();
    await setUsage(10_000);
    const id = await draft();
    await sql`update posts set status = 'scheduled', scheduled_at = now() - interval '1 minute' where id = ${id}`;
    const end = Date.now() + 15_000;
    while ((await scalar(sql`select status from posts where id = ${id}`)) === "scheduled") {
      assert.ok(Date.now() < end, "scheduler never picked it up");
      await new Promise((r) => setTimeout(r, 300));
    }
    const [post] = await sql`select status, send_error from posts where id = ${id}`;
    assert.equal(post.status, "draft");
    assert.match(post.send_error, /left this month/);
    const notice = await mail.waitFor("writer@example.com", "wasn't sent");
    assert.match(notice.HTML, /left this month/);
    assert.match(await owner.page(`/dashboard/posts/${id}`), /scheduled but not sent/);
    await setUsage(0);
  });
});

describe("postal address", () => {
  test("sending needs one, and it's in every email's footer", async () => {
    await sql`update publications set postal_address = null where id = ${publicationId}`;
    const id = await draft();
    const { result } = await send(id);
    assert.match(result.error, /postal address/);
    const scheduled = await owner.action(
      `/dashboard/posts/${id}`,
      "posts/actions",
      "schedulePost",
      [id, new Date(Date.now() + 864e5).toISOString()],
    );
    assert.match(scheduled.result.error, /postal address/);
    assert.match(await owner.page("/dashboard"), /Add your postal address/);

    await sql`update publications set postal_address = ${"Launch Notes GmbH\nMain Street 1, 10115 Berlin"} where id = ${publicationId}`;
    await mail.clear();
    await owner.action(`/dashboard/posts/${id}`, "posts/actions", "sendTest", [id]);
    const message = await mail.waitFor("writer@example.com", "Issue");
    assert.match(message.HTML, /Launch Notes GmbH/);
    assert.match(message.Text, /Main Street 1, 10115 Berlin/);
  });

  test("saving settings from a form without the field keeps the address", async () => {
    await owner.formAction("/dashboard/settings", "settings/actions", "updateSettings", {
      name: "Launch Notes",
      description: "",
      fromName: "Launch Notes",
      replyTo: "",
      logoUrl: "",
      accentColor: "",
      fontStyle: "sans",
      welcomeEnabled: "on",
      welcomeMessage: "",
      emailDesign: "classic",
    });
    assert.match(
      await scalar(sql`select postal_address from publications where id = ${publicationId}`),
      /Launch Notes GmbH/,
    );
  });
});

describe("legal pages", () => {
  test("terms and privacy exist and are linked", async () => {
    const terms = await new Client().page("/terms");
    assert.match(terms, /Terms of service/);
    assert.match(terms, /Acceptable use/);
    assert.match(terms, /1,000(<!-- -->)? subscribers/);
    // Placeholders are flagged until they're filled in (src/lib/legal.ts).
    assert.match(terms, /operator details are placeholders/);
    assert.match(await new Client().page("/privacy"), /Your rights/);
    const home = await new Client().page("/");
    assert.match(home, /href="\/terms"/);
    assert.match(home, /href="\/privacy"/);
    assert.match(await new Client().page("/sign-in"), /agree to the/);
  });
});

describe("tags and segments", () => {
  let vip: string;

  before(async () => {
    await clearList();
    await seedSubscribers(publicationId, ["ann@example.com", "bob@example.com", "cat@example.com"]);
  });

  const id = (email: string) =>
    scalar(
      sql`select id from subscribers where publication_id = ${publicationId} and email = ${email}`,
    );
  const tagsOf = async (email: string) =>
    (
      await sql`select t.name from subscriber_tags st join tags t on t.id = st.tag_id
        join subscribers s on s.id = st.subscriber_id where s.email = ${email} order by lower(t.name)`
    ).map((r) => r.name);

  test("tag one subscriber; new names become tags", async () => {
    const { result } = await owner.action(
      "/dashboard/subscribers",
      "subscribers/actions",
      "setSubscriberTags",
      [await id("ann@example.com"), "VIP, berlin, vip"],
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(await tagsOf("ann@example.com"), ["berlin", "VIP"]);
    vip = await scalar(sql`select id from tags where lower(name) = 'vip'`);

    const list = await owner.page(`/dashboard/subscribers?tag=${vip}`);
    assert.match(list, /ann@example.com/);
    assert.doesNotMatch(list, /bob@example.com/);
  });

  test("tag everyone a search shows", async () => {
    const { result } = await owner.action(
      "/dashboard/subscribers",
      "subscribers/actions",
      "tagMatching",
      [{ q: "bob" }, "beta"],
    );
    assert.equal(result.ok, true);
    assert.deepEqual(await tagsOf("bob@example.com"), ["beta"]);
    assert.deepEqual(await tagsOf("cat@example.com"), []);
  });

  test("an import can tag everyone in it, new and existing", async () => {
    const { result } = await owner.formAction(
      "/dashboard/subscribers/import",
      "subscribers/actions",
      "importSubscribers",
      { pasted: "dan@example.com\ncat@example.com", consent: "on", tags: "fair" },
    );
    assert.equal(result.result.added, 1);
    assert.deepEqual(await tagsOf("dan@example.com"), ["fair"]);
    assert.deepEqual(await tagsOf("cat@example.com"), ["fair"]);
    assert.equal(
      await scalar(sql`select source from subscribers where email = 'dan@example.com'`),
      "import",
    );
  });

  test("sign-up forms can add existing tags, but not create them", async () => {
    const form = new URLSearchParams({ email: "eve@example.com", website: "" });
    form.append("tag", "vip");
    form.append("tag", "made-up");
    await new Client().fetch(`/api/subscribe/${SLUG}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    assert.deepEqual(await tagsOf("eve@example.com"), ["VIP"]);
    assert.equal(await scalar(sql`select count(*) from tags where name = 'made-up'`), "0");
  });

  test("a post can go to a segment only", async () => {
    const post = await draft();
    const set = await owner.action(`/dashboard/posts/${post}`, "posts/actions", "setPostAudience", [
      post,
      "tags",
      [vip],
    ]);
    // Ann is the only *active* VIP (Eve hasn't confirmed).
    assert.deepEqual(set.result, { ok: true, recipients: 1 });
    const sent = await send(post);
    assert.equal(sent.result.ok, true, JSON.stringify(sent.result));
    assert.match(sent.result.message, /Sending to 1 subscribers/);
    const to =
      await sql`select s.email from deliveries d join subscribers s on s.id = d.subscriber_id where d.post_id = ${post}`;
    assert.deepEqual(
      to.map((r) => r.email),
      ["ann@example.com"],
    );
    assert.match(await owner.page(`/dashboard/posts/${post}`), /to subscribers tagged VIP/);
  });

  test("a segment nobody is in can't be sent to", async () => {
    const empty = await scalar(
      sql`insert into tags (publication_id, name) values (${publicationId}, 'nobody') returning id`,
    );
    const post = await draft();
    await owner.action(`/dashboard/posts/${post}`, "posts/actions", "setPostAudience", [
      post,
      "tags",
      [empty],
    ]);
    assert.match((await send(post)).result.error, /Nobody on your list has the tags/);
  });

  test("deleting a tag removes it from everyone", async () => {
    await owner.action("/dashboard/subscribers", "subscribers/actions", "deleteTag", [vip]);
    assert.deepEqual(await tagsOf("ann@example.com"), ["berlin"]);
  });
});

describe("admin and abuse", () => {
  let admin: Client;
  before(async () => {
    admin = await signIn("admin@example.com");
  });

  test("only admins can open /admin", async () => {
    // Not an admin: the not-found page, and nothing about the admin page itself.
    const denied = await owner.page("/admin");
    assert.match(denied, /Page not found/);
    assert.doesNotMatch(denied, /writer@example.com|>Admin</);
    const anon = await new Client().fetch("/admin");
    assert.ok([303, 307].includes(anon.status));
    const page = await admin.page("/admin");
    assert.match(page, /Launch Notes/);
    assert.match(page, /writer@example.com/);
  });

  test("pausing stops sending and invitations; the writer is told", async () => {
    await mail.clear();
    const notAdmin = await owner.action("/admin", "admin/actions", "pausePublication", [
      publicationId,
      "nope",
    ]);
    assert.notEqual(notAdmin.status, 200);
    assert.equal(
      await scalar(sql`select suspended_at is null from publications where id = ${publicationId}`),
      "true",
    );

    await admin.action("/admin", "admin/actions", "pausePublication", [
      publicationId,
      "Testing the pause switch.",
    ]);
    await mail.waitFor("writer@example.com", "Sending is paused");
    assert.match((await send(await draft())).result.error, /paused/);
    const invite = await owner.formAction(
      "/dashboard/subscribers",
      "subscribers/actions",
      "addSubscriber",
      { email: "new@example.com" },
    );
    assert.match(invite.result.error, /paused/);
    assert.match(await owner.page("/dashboard"), /Testing the pause switch/);

    await admin.action("/admin", "admin/actions", "unpausePublication", [publicationId]);
    await mail.waitFor("writer@example.com", "back on");
    assert.equal(
      await scalar(sql`select suspended_at is null from publications where id = ${publicationId}`),
      "true",
    );
  });

  test("too many spam reports pause a publication automatically", async () => {
    await mail.clear();
    await clearList();
    await seedSubscribers(
      publicationId,
      Array.from({ length: 120 }, (_, i) => `reader${i}@example.com`),
    );
    const post = await scalar(
      sql`insert into posts (publication_id, title, slug, status, published_at)
        values (${publicationId}, 'Big send', 'big-send', 'sent', now()) returning id`,
    );
    await sql`insert into deliveries (post_id, subscriber_id, status, sent_at, provider_message_id)
      select ${post}, id, 'sent', now(), 'pm_' || email from subscribers where publication_id = ${publicationId}`;

    for (const n of [0, 1]) {
      await sendResendEvent({
        type: "email.complained",
        data: { email_id: `pm_reader${n}@example.com`, to: [`reader${n}@example.com`] },
      });
    }
    assert.match(
      await scalar(sql`select suspended_reason from publications where id = ${publicationId}`),
      /Too many spam reports/,
    );
    await mail.waitFor("admin@example.com", "Paused automatically");
    assert.match(await admin.page("/admin"), /Too many spam reports/);
    await sql`update publications set suspended_at = null, suspended_reason = null where id = ${publicationId}`;
  });
});

describe("email polish", () => {
  test("the welcome email uses the publication's design and address", async () => {
    await sql`update publications set email_design = 'arcade' where id = ${publicationId}`;
    await mail.clear();
    await owner.formAction("/dashboard/subscribers", "subscribers/actions", "addSubscriber", {
      email: "welcomed@example.com",
    });
    const token = await scalar(
      sql`select confirm_token from subscribers where email = 'welcomed@example.com'`,
    );
    await new Client().action(`/invite/${token}`, "invite/[token]/actions", "respondToInvitation", [
      token,
      "accept",
    ]);
    const welcome = await mail.waitFor("welcomed@example.com", "Welcome to Launch Notes");
    assert.match(welcome.HTML, /background-color:#120f24/);
    assert.match(welcome.HTML, /Launch Notes GmbH/);
    await sql`update publications set email_design = 'classic' where id = ${publicationId}`;
  });

  test("image rows stack on phones", async () => {
    const id = await draft(
      "![One](https://example.com/1.jpg)\n\n![Two](https://example.com/2.jpg)",
    );
    await mail.clear();
    await owner.action(`/dashboard/posts/${id}`, "posts/actions", "sendTest", [id]);
    const message = await mail.waitFor("writer@example.com", "Issue");
    assert.match(message.HTML, /@media only screen and \(max-width: 480px\)/);
    assert.equal((message.HTML.match(/class="pm-col"/g) ?? []).length, 2);
  });
});

describe("account deletion", () => {
  test("needs the web address typed, then deletes everything", async () => {
    const { owner: leaver, publicationId: pubId } = await createOwner(
      "leaver@example.com",
      "leaving-pub",
      "Leaving Soon",
    );
    const userId = await scalar(sql`select owner_id from publications where id = ${pubId}`);
    await seedSubscribers(pubId, ["fan@example.com"]);
    await sql`insert into account_billing (user_id, plan, stripe_customer_id) values (${userId}, 'pro', 'cus_test_leaver')`;
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#15803d" },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "logo.png");
    const upload = await (
      await leaver.fetch("/api/uploads", { method: "POST", body: form })
    ).json();
    assert.equal((await new Client().fetch(new URL(upload.url).pathname)).status, 200);

    const wrong = await leaver.action(
      "/dashboard/settings",
      "settings/actions",
      "deleteMyAccount",
      ["nope"],
    );
    assert.match(wrong.result.error, /Type leaving-pub/);

    await mail.clear();
    const done = await leaver.action("/dashboard/settings", "settings/actions", "deleteMyAccount", [
      "leaving-pub",
    ]);
    assert.match(done.redirect ?? "", /\/account-deleted/);
    assert.equal(await scalar(sql`select count(*) from "user" where id = ${userId}`), "0");
    assert.equal(await scalar(sql`select count(*) from publications where id = ${pubId}`), "0");
    assert.equal(
      await scalar(sql`select count(*) from subscribers where publication_id = ${pubId}`),
      "0",
    );
    assert.match(await new Client().page("/leaving-pub"), /Page not found/);
    assert.equal((await new Client().fetch(new URL(upload.url).pathname)).status, 404);
    await mail.waitFor("leaver@example.com", "has been deleted");
  });
});
