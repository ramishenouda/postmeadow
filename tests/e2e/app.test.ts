/**
 * The whole product, in the order a real writer and reader use it:
 * sign in → publication → subscribers → post → test → send → archive → unsubscribe.
 * Steps share state, so they run in order.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  BASE,
  Client,
  linkIn,
  mail,
  resetDatabase,
  scalar,
  signIn,
  sql,
  waitForStatus,
} from "./helpers";

const SLUG = "weekly-byte";
let owner: Client;
let postId: string;

before(async () => {
  await resetDatabase();
  await mail.clear();
});
after(() => sql.end());

const subscribe = (client: Client, email: string, website = "") =>
  client.formAction(
    `/${SLUG}`,
    "[slug]/actions",
    "subscribe",
    { email, website },
    { leadingArgs: [SLUG], prev: { status: "idle" } },
  );

const subscriberStatus = (email: string) =>
  scalar(sql`select status from subscribers where email = ${email}`);

describe("onboarding", () => {
  test("signed-out visitors are sent to sign-in", async () => {
    const res = await new Client().fetch("/dashboard");
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /\/sign-in$/);
  });

  test("magic link signs in; the link works once", async () => {
    owner = await signIn("owner@example.com");
    const message = await mail.waitFor("owner@example.com", "sign-in");
    const reused = await new Client().fetch(linkIn(message, "/api/auth/magic-link/verify"));
    assert.match(reused.headers.get("location") ?? "", /error=INVALID_TOKEN/);
  });

  test("onboarding validates input", async () => {
    const { result } = await owner.formAction(
      "/onboarding",
      "onboarding/actions",
      "createPublication",
      { name: "Weekly Byte", slug: "dashboard", description: "", fromName: "", replyTo: "nope" },
    );
    assert.deepEqual(Object.keys(result.errors).sort(), ["fromName", "replyTo", "slug"]);
  });

  test("creates the publication", async () => {
    const { redirect } = await owner.formAction(
      "/onboarding",
      "onboarding/actions",
      "createPublication",
      {
        name: "The Weekly Byte",
        slug: SLUG,
        description: "Small, useful things.",
        fromName: "Byte Team",
        replyTo: "replies@example.com",
      },
    );
    assert.match(redirect ?? "", /\/dashboard/);
    assert.equal(await scalar(sql`select slug from publications`), SLUG);
  });

  test("dashboard renders and onboarding now redirects to it", async () => {
    assert.match(await owner.page("/dashboard"), /The Weekly Byte/);
    // Redirects inside a streamed page arrive as a redirect instruction in the payload.
    assert.match(await owner.page("/onboarding"), /NEXT_REDIRECT;replace;\/dashboard/);
  });
});

describe("public page and double opt-in", () => {
  const reader = new Client();

  test("public page shows name, form and empty archive", async () => {
    const html = await new Client().page(`/${SLUG}`);
    assert.match(html, /The Weekly Byte/);
    assert.match(html, /name="email"/);
    assert.match(html, /No posts yet/);
  });

  test("app pages carry the Postmeadow name; publication pages carry only the writer's", async () => {
    assert.match(await owner.page("/dashboard"), /<title>Dashboard · Postmeadow<\/title>/);
    const html = await new Client().page(`/${SLUG}`);
    assert.match(html, /<title>The Weekly Byte<\/title>/);
    assert.match(html, /Published with<!-- --> <a[^>]*>Postmeadow<\/a>/);
  });

  test("unknown publication shows not found", async () => {
    assert.match(await new Client().page("/does-not-exist"), /Page not found/);
  });

  test("subscribing sends a confirmation; confirming activates", async () => {
    await mail.clear();
    const { result } = await subscribe(reader, "Reader1@Example.com");
    assert.equal(result.status, "success");
    assert.equal(await subscriberStatus("reader1@example.com"), "pending");

    const message = await mail.waitFor("reader1@example.com", "Confirm");
    const confirm = linkIn(message, "/api/subscriptions/confirm");
    const res = await new Client().fetch(confirm);
    assert.equal(res.status, 303);
    assert.match(res.headers.get("location") ?? "", new RegExp(`/${SLUG}/subscribed$`));
    assert.equal(await subscriberStatus("reader1@example.com"), "active");

    const reused = await new Client().fetch(confirm);
    assert.match(reused.headers.get("location") ?? "", /\/subscription-invalid$/);
  });

  test("no email for already-active; one email per cooldown; honeypot; validation", async () => {
    await mail.clear();
    await subscribe(new Client(), "reader1@example.com");
    await subscribe(new Client(), "reader2@example.com");
    await subscribe(new Client(), "reader2@example.com");
    const bot = await subscribe(new Client(), "bot@example.com", "http://spam");
    const invalid = await subscribe(new Client(), "not-an-email");
    await new Promise((r) => setTimeout(r, 500));

    assert.equal(await mail.countTo("reader1@example.com"), 0);
    assert.equal(await mail.countTo("reader2@example.com"), 1);
    assert.equal(bot.result.status, "success");
    assert.equal(
      await scalar(sql`select count(*) from subscribers where email = 'bot@example.com'`),
      "0",
    );
    assert.equal(invalid.result.status, "error");
  });
});

describe("subscriber admin", () => {
  test("manual add, and duplicates are rejected", async () => {
    const add = () =>
      owner.formAction("/dashboard/subscribers", "subscribers/actions", "addSubscriber", {
        email: "manual@example.com",
      });
    assert.equal((await add()).result.ok, true);
    assert.match((await add()).result.error, /already/);
  });

  test("CSV import counts added, existing and invalid", async () => {
    const csv =
      "Name,Email\nAda,ada@example.com\nGrace,GRACE@example.com\nDup,ada@example.com\nBad,nope\nOld,reader1@example.com\n";
    const { result } = await owner.formAction(
      "/dashboard/subscribers/import",
      "subscribers/actions",
      "importSubscribers",
      { consent: "on", pasted: "", file: new File([csv], "list.csv", { type: "text/csv" }) },
    );
    assert.deepEqual(
      {
        added: result.result.added,
        existing: result.result.existing,
        invalid: result.result.invalid,
      },
      { added: 2, existing: 1, invalid: 1 },
    );
  });

  test("import requires consent", async () => {
    const { result } = await owner.formAction(
      "/dashboard/subscribers/import",
      "subscribers/actions",
      "importSubscribers",
      { pasted: "x@example.com" },
    );
    assert.match(result.error, /agreed/);
  });

  test("export is a CSV and needs a session", async () => {
    const res = await owner.fetch("/dashboard/subscribers/export");
    assert.match(res.headers.get("content-disposition") ?? "", /attachment/);
    assert.match(await res.text(), /grace@example.com/);
    const anon = await new Client().fetch("/dashboard/subscribers/export");
    assert.ok([307, 401].includes(anon.status));
  });

  test("search filters the list", async () => {
    const html = await owner.page("/dashboard/subscribers?q=ada");
    assert.match(html, /ada@example.com/);
    assert.doesNotMatch(html, /grace@example.com/);
  });

  test("4 active subscribers in total", async () => {
    assert.equal(await scalar(sql`select count(*) from subscribers where status = 'active'`), "4");
  });
});

describe("posts", () => {
  const content = [
    "Hello **readers**! Here's a [link](https://example.com).",
    "## What's new",
    "- one\n- two",
    "> a quote",
    "| a | b |\n|---|---|\n| 1 | 2 |",
    "<script>alert('xss')</script>",
    "[bad](javascript:alert(1))",
    "```js\nconst x = 1 < 2;\n```",
  ].join("\n\n");

  test("create and save a draft; bad slugs are rejected", async () => {
    const created = await owner.action("/dashboard/posts", "posts/actions", "createPost", []);
    assert.match(created.redirect ?? "", /\/dashboard\/posts\//);
    postId = await scalar(sql`select id from posts`);

    const page = `/dashboard/posts/${postId}`;
    const saved = await owner.action(page, "posts/actions", "savePost", [
      postId,
      { title: "Issue #1", subtitle: "The first one", slug: "issue-1", content },
    ]);
    assert.equal(saved.result.ok, true);

    const bad = await owner.action(page, "posts/actions", "savePost", [
      postId,
      { title: "x", subtitle: "", slug: "Bad Slug!", content: "" },
    ]);
    assert.equal(bad.result.field, "slug");
  });

  test("editor page renders the rich-text toolbar", async () => {
    const html = await owner.page(`/dashboard/posts/${postId}`);
    assert.match(html, /role="toolbar"/);
    assert.match(html, /Email preview/);
  });

  test("preview renders Markdown and strips scripts and javascript: links", async () => {
    const res = await owner.fetch(`/api/posts/${postId}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Issue #1", subtitle: "", slug: "issue-1", content }),
    });
    const html = await res.text();
    assert.match(html, /<h2/);
    assert.match(html, /<table/);
    assert.match(html, /https:\/\/example.com/);
    assert.doesNotMatch(html, /<script/);
    assert.doesNotMatch(html, /javascript:/);

    const anon = await new Client().fetch(`/api/posts/${postId}/preview`, {
      method: "POST",
      body: "{}",
    });
    assert.equal(anon.status, 401);
  });

  test("test email goes to the owner, from the publication", async () => {
    await mail.clear();
    const { result } = await owner.action(
      `/dashboard/posts/${postId}`,
      "posts/actions",
      "sendTest",
      [postId],
    );
    assert.equal(result.ok, true);
    const message = await mail.waitFor("owner@example.com", "[Test]");
    assert.equal(message.From.Name, "Byte Team");
    assert.ok(message.ReplyTo.some((a) => a.Address === "replies@example.com"));
  });
});

describe("isolation between accounts", () => {
  let other: Client;

  before(async () => {
    other = await signIn("other@example.com");
  });

  test("a user without a publication gets 404 from the preview API", async () => {
    const res = await other.fetch(`/api/posts/${postId}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "", subtitle: "", slug: "", content: "" }),
    });
    assert.equal(res.status, 404);
  });

  test("another owner can't view, preview, edit or send the post", async () => {
    await other.formAction("/onboarding", "onboarding/actions", "createPublication", {
      name: "Other",
      slug: "other-pub",
      description: "",
      fromName: "O",
      replyTo: "",
    });
    assert.doesNotMatch(await other.page(`/dashboard/posts/${postId}`), /Issue #1/);

    const preview = await other.fetch(`/api/posts/${postId}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "", subtitle: "", slug: "", content: "" }),
    });
    assert.equal(preview.status, 404);

    const page = `/dashboard/posts/${postId}`;
    const edit = await other.action(page, "posts/actions", "savePost", [
      postId,
      { title: "pwned", subtitle: "", slug: "pwned", content: "" },
    ]);
    assert.equal(edit.result.ok, false);
    assert.equal(await scalar(sql`select title from posts where id = ${postId}`), "Issue #1");

    const send = await other.action(page, "posts/actions", "sendPost", [postId]);
    assert.equal(send.result.ok, false);
  });
});

describe("sending", () => {
  test("sends once to every active subscriber with one-click unsubscribe", async () => {
    await mail.clear();
    const page = `/dashboard/posts/${postId}`;
    const { result } = await owner.action(page, "posts/actions", "sendPost", [postId]);
    assert.equal(result.ok, true);
    await waitForStatus(postId, "sent");

    assert.equal(
      await scalar(
        sql`select count(*) from deliveries where post_id = ${postId} and status = 'sent'`,
      ),
      "4",
    );
    const again = await owner.action(page, "posts/actions", "sendPost", [postId]);
    assert.equal(again.result.ok, false);

    const recipients = (await mail.list()).flatMap((m) => m.To.map((t) => t.Address)).sort();
    assert.deepEqual(recipients, [
      "ada@example.com",
      "grace@example.com",
      "manual@example.com",
      "reader1@example.com",
    ]);

    const message = await mail.waitFor("ada@example.com", "Issue #1");
    const token = await scalar(
      sql`select unsubscribe_token from subscribers where email = 'ada@example.com'`,
    );
    const headers = await mail.headers(message.ID);
    assert.match(headers["List-Unsubscribe"][0], new RegExp(`/api/unsubscribe/${token}`));
    assert.equal(headers["List-Unsubscribe-Post"][0], "List-Unsubscribe=One-Click");
    assert.match(message.HTML, new RegExp(`/unsubscribe/${token}`));
    assert.doesNotMatch(message.HTML, /placeholder\.invalid/);
    assert.match(message.HTML, new RegExp(`/${SLUG}/p/issue-1`));
    assert.match(message.Text, /what's new/i);
  });

  test("the archive and post page show the sent post", async () => {
    assert.match(await new Client().page(`/${SLUG}`), /Issue #1/);
    const html = await new Client().page(`/${SLUG}/p/issue-1`);
    assert.match(html, /What(&#x27;|')s new/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /javascript:alert/);
  });

  test("dashboard shows delivery stats", async () => {
    const html = (await owner.page(`/dashboard/posts/${postId}`)).replaceAll("<!-- -->", "");
    assert.match(html, /4 of 4 processed/);
  });
});

describe("unsubscribe", () => {
  test("one-click POST unsubscribes", async () => {
    const token = await scalar(
      sql`select unsubscribe_token from subscribers where email = 'ada@example.com'`,
    );
    const res = await fetch(`${BASE}/api/unsubscribe/${token}`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(await subscriberStatus("ada@example.com"), "unsubscribed");
    assert.match(await new Client().page(`/unsubscribe/${token}`), /unsubscribed/);
  });

  test("opening the page doesn't unsubscribe; the button does", async () => {
    const token = await scalar(
      sql`select unsubscribe_token from subscribers where email = 'grace@example.com'`,
    );
    assert.match(await new Client().page(`/unsubscribe/${token}`), /Unsubscribe\?/);
    assert.equal(await subscriberStatus("grace@example.com"), "active");
    await new Client().action(
      `/unsubscribe/${token}`,
      "unsubscribe/[token]/actions",
      "unsubscribe",
      [token],
    );
    assert.equal(await subscriberStatus("grace@example.com"), "unsubscribed");
  });

  test("unknown token is a 404", async () => {
    assert.equal((await fetch(`${BASE}/api/unsubscribe/nope`, { method: "POST" })).status, 404);
  });

  test("an unsubscribed reader can subscribe again (with confirmation)", async () => {
    await mail.clear();
    await subscribe(new Client(), "ada@example.com");
    await mail.waitFor("ada@example.com", "Confirm");
    assert.equal(await subscriberStatus("ada@example.com"), "pending");
  });
});

describe("settings and cleanup", () => {
  test("settings update the public page; validation works", async () => {
    const ok = await owner.formAction("/dashboard/settings", "settings/actions", "updateSettings", {
      name: "The Byte",
      description: "Renamed.",
      fromName: "Byte",
      replyTo: "",
    });
    assert.equal(ok.result.ok, true);
    assert.match(await new Client().page(`/${SLUG}`), /The Byte/);

    const bad = await owner.formAction(
      "/dashboard/settings",
      "settings/actions",
      "updateSettings",
      {
        name: "",
        description: "",
        fromName: "",
        replyTo: "bad",
      },
    );
    assert.deepEqual(Object.keys(bad.result.errors).sort(), ["fromName", "name", "replyTo"]);
  });

  test("drafts can be deleted, sent posts can't", async () => {
    await owner.action("/dashboard/posts", "posts/actions", "createPost", []);
    const draft = await scalar(sql`select id from posts where status = 'draft'`);
    await owner.action(`/dashboard/posts/${draft}`, "posts/actions", "deletePost", [draft]);
    assert.equal(await scalar(sql`select count(*) from posts where status = 'draft'`), "0");

    await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "deletePost", [postId]);
    assert.equal(await scalar(sql`select count(*) from posts where id = ${postId}`), "1");
  });
});
