/** A/B subject tests, resending to people who didn't open, and sponsor placements. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  Client,
  createDraft,
  createOwner,
  mail,
  resetDatabase,
  scalar,
  seedSubscribers,
  sendResendEvent,
  sql,
  waitForStatus,
} from "./helpers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const AB = { subjectB: "Subject B wins", metric: "opens", percent: 20, waitHours: 1 };

before(async () => {
  await resetDatabase();
  await mail.clear();
});
after(() => sql.end());

const send = (owner: Client, postId: string, ab: unknown = null) =>
  owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [postId, ab]);

async function waitFor(check: () => Promise<boolean>, what: string, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

describe("A/B subject tests", () => {
  let owner: Client;
  let publicationId: string;

  before(async () => {
    ({ owner, publicationId } = await createOwner("ab@example.com", "ab-pub"));
    await seedSubscribers(
      publicationId,
      Array.from({ length: 200 }, (_, i) => `ab${i}@example.com`),
    );
  });

  test("a sample gets A or B, the winner by opens goes to everyone else", async () => {
    const postId = await createDraft(owner, "Subject A", "ab-one");
    await mail.clear();
    const { result } = await send(owner, postId, AB);
    assert.equal(result.ok, true, JSON.stringify(result));

    // 20% of 200: 20 get A, 20 get B; 160 wait.
    await waitFor(async () => (await mail.total()) === 40, "the test sample");
    await sleep(500);
    const subjects = (await mail.list()).map((m) => m.Subject);
    assert.equal(subjects.filter((s) => s === "Subject A").length, 20);
    assert.equal(subjects.filter((s) => s === "Subject B wins").length, 20);
    assert.equal(
      await scalar(
        sql`select count(*) from deliveries where post_id = ${postId} and status = 'held'`,
      ),
      "160",
    );
    assert.equal(await scalar(sql`select status from posts where id = ${postId}`), "sending");
    const page = await owner.page(`/dashboard/posts/${postId}`);
    assert.match(page, /A\/B subject test/);
    assert.match(page, /Waiting for the A\/B winner/);

    // B gets more opens; the wait is over.
    await sql`update deliveries set opened_at = now()
      where id in (select id from deliveries where post_id = ${postId} and variant = 'b' limit 6)`;
    await sql`update deliveries set opened_at = now()
      where id in (select id from deliveries where post_id = ${postId} and variant = 'a' limit 2)`;
    await sql`update posts set ab_decide_at = now() - interval '1 minute' where id = ${postId}`;

    await waitForStatus(postId, "sent");
    assert.equal(await scalar(sql`select ab_winner from posts where id = ${postId}`), "b");
    await waitFor(async () => (await mail.total()) === 200, "everyone else");
    const all = (await mail.list()).map((m) => m.Subject);
    assert.equal(all.filter((s) => s === "Subject B wins").length, 180);
    // The plan's monthly counter counted everyone once.
    assert.equal(
      await scalar(sql`select emails from email_usage eu join publications p on p.owner_id = eu.user_id
        where p.id = ${publicationId}`),
      "200",
    );
  });

  test("the writer can pick the winner early", async () => {
    const postId = await createDraft(owner, "Pick me", "ab-two");
    await mail.clear();
    assert.equal(
      (await send(owner, postId, { ...AB, subjectB: "Or me", waitHours: 24 })).result.ok,
      true,
    );
    await waitFor(async () => (await mail.total()) === 40, "the test sample");
    const { result } = await owner.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "pickAbWinner",
      [postId, "a"],
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    await waitForStatus(postId, "sent");
    const all = (await mail.list()).map((m) => m.Subject);
    assert.equal(all.filter((s) => s === "Pick me").length, 180);
    // Deciding twice does nothing.
    const again = await owner.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "pickAbWinner",
      [postId, "b"],
    );
    assert.equal(again.result.ok, false);
  });

  test("small lists can't run a test, and nothing is sent", async () => {
    const { owner: small, publicationId: smallId } = await createOwner(
      "ab-small@example.com",
      "ab-small",
    );
    await seedSubscribers(smallId, ["s1@example.com", "s2@example.com"]);
    const postId = await createDraft(small, "Tiny", "tiny");
    const { result } = await send(small, postId, AB);
    assert.equal(result.ok, false);
    assert.match(result.error, /at least 100/);
    assert.equal(await scalar(sql`select status from posts where id = ${postId}`), "draft");
    // Turning the test off sends normally.
    assert.equal((await send(small, postId, null)).result.ok, true);
    await waitForStatus(postId, "sent");
  });

  test("an empty B subject is refused", async () => {
    const postId = await createDraft(owner, "No B", "ab-three");
    const { result } = await send(owner, postId, { ...AB, subjectB: "  " });
    assert.equal(result.ok, false);
    assert.equal(await scalar(sql`select status from posts where id = ${postId}`), "draft");
  });
});

describe("resending to people who didn't open", () => {
  let owner: Client;
  let publicationId: string;
  let postId: string;

  before(async () => {
    ({ owner, publicationId } = await createOwner("resend@example.com", "resend-pub"));
    await seedSubscribers(
      publicationId,
      Array.from({ length: 10 }, (_, i) => `r${i}@example.com`),
    );
    postId = await createDraft(owner, "Big news", "big-news", "Read **this**.");
    await send(owner, postId);
    await waitForStatus(postId, "sent");
    // 4 opened (one only clicked), 1 unsubscribed since.
    await sql`update deliveries set opened_at = now() where post_id = ${postId}
      and subscriber_id in (select id from subscribers where email in ('r0@example.com','r1@example.com','r2@example.com'))`;
    await sql`update deliveries set clicked_at = now() where post_id = ${postId}
      and subscriber_id in (select id from subscribers where email = 'r3@example.com')`;
    await sql`update subscribers set status = 'unsubscribed' where email = 'r4@example.com'`;
  });

  test("the post page offers it with the count", async () => {
    const page = await owner.page(`/dashboard/posts/${postId}`);
    assert.match(page, /Resend to people who didn/);
    assert.match(page, /Resend to <!-- -->5|Resend to 5/);
  });

  test("goes once, only to non-openers, with the new subject", async () => {
    await mail.clear();
    const { result } = await owner.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "resendToNonOpeners",
      [postId, "Did you see this?"],
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    const copyId = await scalar(sql`select id from posts where resend_of = ${postId}`);
    await waitForStatus(copyId, "sent");
    const sent = await mail.list();
    assert.equal(sent.length, 5);
    assert.ok(sent.every((m) => m.Subject === "Did you see this?"));
    const to = sent.map((m) => m.To[0].Address).sort();
    assert.deepEqual(to, [
      "r5@example.com",
      "r6@example.com",
      "r7@example.com",
      "r8@example.com",
      "r9@example.com",
    ]);
    // "View in browser" opens the original post.
    const message = await mail.waitFor("r5@example.com", "Did you see this?");
    assert.match(message.Text, /\/resend-pub\/p\/big-news/);

    // Not twice.
    const again = await owner.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "resendToNonOpeners",
      [postId, "Again?"],
    );
    assert.equal(again.result.ok, false);
  });

  test("the resend stays off the posts list, the web and the post count", async () => {
    const list = await owner.page("/dashboard/posts");
    assert.doesNotMatch(list, /Did you see this\?/);
    const archive = await new Client().page("/resend-pub");
    assert.doesNotMatch(archive, /Did you see this/);
    const page = await owner.page(`/dashboard/posts/${postId}`);
    assert.match(page, /Resent to 5 people/);
  });
});

describe("sponsors", () => {
  let owner: Client;
  let publicationId: string;
  let postId: string;
  const SPONSOR = {
    name: "Acme Coffee",
    text: "Fresh beans roasted every Monday.",
    url: "https://acme.example/beans",
    cta: "Get 20% off",
    imageUrl: "",
    position: "top",
  };

  before(async () => {
    ({ owner, publicationId } = await createOwner("sponsor@example.com", "sponsor-pub"));
    await seedSubscribers(publicationId, ["reader1@example.com", "reader2@example.com"]);
    postId = await createDraft(owner, "Sponsored issue", "sponsored-issue", "Hello readers.");
  });

  test("bad sponsor details are refused", async () => {
    const { result } = await owner.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "setPostSponsor",
      [postId, { ...SPONSOR, url: "javascript:alert(1)" }],
    );
    assert.equal(result.ok, false);
  });

  test("appears, labelled, in the email and on the web; the sponsor gets a results page", async () => {
    const set = await owner.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "setPostSponsor",
      [postId, SPONSOR],
    );
    assert.equal(set.result.ok, true, JSON.stringify(set.result));
    await mail.clear();
    await send(owner, postId);
    await waitForStatus(postId, "sent");
    const email = await mail.waitFor("reader1@example.com", "Sponsored issue");
    assert.match(email.HTML, /Sponsored by Acme Coffee/);
    assert.match(email.HTML, /https:\/\/acme\.example\/beans/);
    // Top: before the body text.
    assert.ok(email.HTML.indexOf("Sponsored by Acme") < email.HTML.lastIndexOf("Hello readers."));

    const web = await new Client().page("/sponsor-pub/p/sponsored-issue");
    assert.match(web, /Sponsored by Acme Coffee/);
    assert.match(web, /rel="sponsored noopener"/);

    // One reader clicks the sponsor link.
    const messageId = await scalar(sql`select d.provider_message_id from deliveries d
      join subscribers s on s.id = d.subscriber_id where d.post_id = ${postId} and s.email = 'reader1@example.com'`);
    const res = await sendResendEvent({
      type: "email.clicked",
      data: { email_id: messageId, to: ["reader1@example.com"], click: { link: SPONSOR.url } },
    });
    assert.equal(res.status, 200);

    const token = await scalar(sql`select sponsor_report_token from posts where id = ${postId}`);
    const dashboard = await owner.page(`/dashboard/posts/${postId}`);
    assert.match(dashboard, new RegExp(`/sponsor/${token}`));
    const report = await new Client().page(`/sponsor/${token}`);
    assert.match(report, /Sponsor results/);
    assert.match(report, /Acme Coffee/);
    assert.match(report, /50%/); // 1 of 2 clicked
    assert.equal((await new Client().get("/sponsor/not-a-real-token-at-all-xx")).res.status, 200);
    assert.match(await new Client().page("/sponsor/not-a-real-token-at-all-xx"), /not found|404/i);
  });

  test("can't change the sponsor after sending", async () => {
    const { result } = await owner.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "setPostSponsor",
      [postId, null],
    );
    assert.equal(result.ok, false);
  });
});
