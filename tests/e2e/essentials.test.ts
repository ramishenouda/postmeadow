/**
 * The features every newsletter platform has: SEO basics, an embeddable signup form,
 * editing or unpublishing sent posts, a growth chart, and scheduled sends.
 */
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { after, before, describe, test } from "node:test";
import {
  BASE,
  Client,
  createDraft,
  createOwner,
  mail,
  resetDatabase,
  scalar,
  seedSubscribers,
  sql,
  waitForStatus,
} from "./helpers";

const SLUG = "essentials-pub";
let owner: Client;
let publicationId: string;

before(async () => {
  await resetDatabase();
  ({ owner, publicationId } = await createOwner("ess@example.com", SLUG, "Essentials"));
  await seedSubscribers(publicationId, ["r1@example.com", "r2@example.com"]);
});
after(() => sql.end());

async function sendNow(postId: string) {
  const { result } = await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [
    postId,
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
  await waitForStatus(postId, "sent");
}

/** Public pages refresh from the cache right after a change; allow a moment. */
async function eventually(check: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 20; i++) {
    if (await check()) return;
    await sleep(150);
  }
  assert.fail(`timed out waiting for: ${what}`);
}

describe("SEO basics", () => {
  let postId: string;
  before(async () => {
    postId = await createDraft(owner, "Visible post", "visible-post", "Hello world");
    await sendNow(postId);
    await createDraft(owner, "Draft only", "draft-only");
  });

  test("robots.txt keeps crawlers out of private areas and points at the sitemap", async () => {
    const txt = await (await fetch(`${BASE}/robots.txt`)).text();
    assert.match(txt, /Disallow: \/dashboard/);
    assert.match(txt, /Disallow: \/api\//);
    assert.match(txt, new RegExp(`Sitemap: ${BASE}/sitemap.xml`));
  });

  test("the sitemap lists publications and sent posts, never drafts", async () => {
    const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
    assert.ok(xml.includes(`<loc>${BASE}/${SLUG}</loc>`));
    assert.ok(xml.includes(`<loc>${BASE}/${SLUG}/p/visible-post</loc>`));
    assert.ok(!xml.includes("draft-only"));
    assert.ok(xml.includes(`<loc>${BASE}/pricing</loc>`));
  });

  test("pages declare canonical URLs", async () => {
    const html = await new Client().page(`/${SLUG}/p/visible-post`);
    assert.match(html, new RegExp(`<link rel="canonical" href="${BASE}/${SLUG}/p/visible-post"`));
  });
});

describe("embeddable signup form", () => {
  test("the embed page may be framed by other sites; nothing else may", async () => {
    const embed = await fetch(`${BASE}/embed/${SLUG}`);
    assert.equal(embed.status, 200);
    assert.equal(embed.headers.get("x-frame-options"), null);
    assert.match(embed.headers.get("content-security-policy") ?? "", /frame-ancestors \*/);
    assert.match(await embed.text(), /name="email"/);

    const page = await fetch(`${BASE}/${SLUG}`);
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  });

  test("a plain HTML form subscribes and lands on 'check your inbox'", async () => {
    await mail.clear();
    const res = await new Client().fetch(`/api/subscribe/${SLUG}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "Embedded@Example.com", website: "" }),
    });
    assert.equal(res.status, 303);
    assert.match(res.headers.get("location") ?? "", new RegExp(`/${SLUG}/check-inbox$`));
    assert.equal(
      await scalar(sql`select status from subscribers where email = 'embedded@example.com'`),
      "pending",
    );
    await mail.waitFor("embedded@example.com", "Confirm");
    assert.match(await new Client().page(`/${SLUG}/check-inbox`), /Check your inbox/);
  });

  test("errors come back as a message, scripts can ask for JSON, bots get nothing", async () => {
    const bad = await new Client().fetch(`/api/subscribe/${SLUG}`, {
      method: "POST",
      body: new URLSearchParams({ email: "nope" }),
    });
    assert.match(bad.headers.get("location") ?? "", /error=invalid-email/);
    assert.match(
      await new Client().page(`/${SLUG}/check-inbox?error=invalid-email`),
      /doesn(&#x27;|')t look like an email/,
    );

    const json = await new Client().fetch(`/api/subscribe/${SLUG}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: "script@example.com" }),
    });
    assert.equal(json.status, 200);
    assert.equal((await json.json()).ok, true);

    const bot = await new Client().fetch(`/api/subscribe/${SLUG}`, {
      method: "POST",
      body: new URLSearchParams({ email: "bot@example.com", website: "spam" }),
    });
    assert.equal(bot.status, 303);
    assert.equal(
      await scalar(sql`select count(*) from subscribers where email = 'bot@example.com'`),
      "0",
    );
  });

  test("settings show both snippets", async () => {
    const html = await owner.page("/dashboard/settings");
    assert.ok(html.includes(`${BASE}/embed/${SLUG}`));
    assert.ok(html.includes(`${BASE}/api/subscribe/${SLUG}`));
  });
});

describe("editing and unpublishing sent posts", () => {
  let postId: string;
  before(async () => {
    postId = await createDraft(owner, "Original title", "edit-me", "First version");
    await sendNow(postId);
  });

  test("editing a sent post updates the web version; the address stays", async () => {
    const { result } = await owner.action(
      `/dashboard/posts/${postId}/edit`,
      "posts/actions",
      "savePost",
      [
        postId,
        { title: "Fixed title", subtitle: "", slug: "a-new-slug", content: "Second version" },
      ],
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(await scalar(sql`select slug from posts where id = ${postId}`), "edit-me");
    await eventually(
      async () => (await new Client().page(`/${SLUG}/p/edit-me`)).includes("Second version"),
      "edited content on the post page",
    );
  });

  test("removing from the web hides it everywhere; publishing brings it back", async () => {
    const page = `/dashboard/posts/${postId}`;
    await owner.action(page, "posts/actions", "setWebHidden", [postId, true]);
    await eventually(
      async () => (await new Client().page(`/${SLUG}/p/edit-me`)).includes("Page not found"),
      "post page gone",
    );
    assert.doesNotMatch(await new Client().page(`/${SLUG}`), /Fixed title/);
    assert.doesNotMatch(await (await fetch(`${BASE}/${SLUG}/feed.xml`)).text(), /Fixed title/);
    assert.doesNotMatch(await (await fetch(`${BASE}/sitemap.xml`)).text(), /edit-me/);
    assert.match(await owner.page(page), /off the web/);

    await owner.action(page, "posts/actions", "setWebHidden", [postId, false]);
    await eventually(
      async () => (await new Client().page(`/${SLUG}`)).includes("Fixed title"),
      "post back in the archive",
    );
  });

  test("drafts can't be taken off the web", async () => {
    const draft = await createDraft(owner, "Not sent", "not-sent");
    const { result } = await owner.action(
      `/dashboard/posts/${draft}`,
      "posts/actions",
      "setWebHidden",
      [draft, true],
    );
    assert.equal(result.ok, false);
  });
});

describe("growth chart", () => {
  test("the dashboard shows subscribers over the last 30 days", async () => {
    // r1 and r2 were added as confirmed; the embedded sign-up is still pending.
    const html = (await owner.page("/dashboard")).replaceAll("<!-- -->", "");
    assert.match(html, /Subscribers, last 30 days/);
    assert.match(html, /\+2 new · −0 left/);
    assert.match(html, /Show as table/);
    assert.match(html, /role="img"[^>]*aria-label="Subscribers over the last 30 days, from 0 to 2/);
  });

  test("unsubscribing shows up as a loss today", async () => {
    await sql`update subscribers set status = 'unsubscribed', unsubscribed_at = now()
      where email = 'r2@example.com'`;
    const html = (await owner.page("/dashboard")).replaceAll("<!-- -->", "");
    assert.match(html, /\+2 new · −1 left/);
  });
});

describe("scheduled sends", () => {
  test("times in the past or too far ahead are refused", async () => {
    const id = await createDraft(owner, "Too soon", "too-soon");
    const page = `/dashboard/posts/${id}`;
    const past = await owner.action(page, "posts/actions", "schedulePost", [
      id,
      new Date(Date.now() - 60_000).toISOString(),
    ]);
    assert.match(past.result.error, /future/);
    const far = await owner.action(page, "posts/actions", "schedulePost", [
      id,
      new Date(Date.now() + 400 * 864e5).toISOString(),
    ]);
    assert.match(far.result.error, /a year/);
  });

  test("a scheduled post stays editable, can be unscheduled, and goes out on time", async () => {
    const id = await createDraft(owner, "Scheduled issue", "scheduled-issue", "On time");
    const page = `/dashboard/posts/${id}`;
    const inAnHour = new Date(Date.now() + 3600_000).toISOString();

    const scheduled = await owner.action(page, "posts/actions", "schedulePost", [id, inAnHour]);
    assert.equal(scheduled.result.ok, true, JSON.stringify(scheduled.result));
    assert.equal(await scalar(sql`select status from posts where id = ${id}`), "scheduled");
    assert.match(await owner.page("/dashboard/posts"), /Scheduled for/);

    const edited = await owner.action(page, "posts/actions", "savePost", [
      id,
      {
        title: "Scheduled issue",
        subtitle: "",
        slug: "scheduled-issue",
        content: "Edited before sending",
      },
    ]);
    assert.equal(edited.result.ok, true);

    const off = await owner.action(page, "posts/actions", "unschedulePost", [id]);
    assert.equal(off.result.ok, true);
    assert.equal(await scalar(sql`select status from posts where id = ${id}`), "draft");

    await owner.action(page, "posts/actions", "schedulePost", [id, inAnHour]);
    // Cache the archive *before* sending, so the check below proves it gets refreshed.
    assert.doesNotMatch(await new Client().page(`/${SLUG}`), /Scheduled issue/);
    // Fast-forward: make it due now; the scheduler (1s interval in tests) sends it.
    await mail.clear();
    await sql`update posts set scheduled_at = now() - interval '1 second' where id = ${id}`;
    await waitForStatus(id, "sent", 20_000);
    const message = await mail.waitFor("r1@example.com", "Scheduled issue");
    assert.match(message.Text, /Edited before sending/);
    assert.equal(await mail.countTo("r2@example.com"), 0, "unsubscribed reader must not get it");
    // The scheduler runs outside any request; the archive must still refresh right away.
    await eventually(
      async () => (await new Client().page(`/${SLUG}`)).includes("Scheduled issue"),
      "scheduled post in the public archive",
    );
  });

  test("the internal cache-refresh endpoint refuses outsiders", async () => {
    const res = await fetch(`${BASE}/api/internal/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": "guess" },
      body: JSON.stringify({ tag: `publication:${SLUG}` }),
    });
    assert.equal(res.status, 404);
  });

  test("an interrupted send is picked up by the scheduler without anyone clicking Resume", async () => {
    const id = await createDraft(owner, "Interrupted", "interrupted");
    await sql`update posts set status = 'sending', published_at = now() where id = ${id}`;
    await sql`insert into deliveries (post_id, subscriber_id)
      select ${id}, id from subscribers where publication_id = ${publicationId} and status = 'active'`;
    await mail.clear();
    await waitForStatus(id, "sent", 20_000);
    await sleep(300);
    assert.equal(await mail.countTo("r1@example.com"), 1);
  });
});
