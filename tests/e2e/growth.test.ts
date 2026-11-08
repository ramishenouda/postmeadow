/** Landing and pricing pages, welcome emails, open/click stats, RSS and social previews. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  BASE,
  Client,
  createDraft,
  createOwner,
  linkIn,
  mail,
  resetDatabase,
  scalar,
  seedSubscribers,
  sendResendEvent,
  sql,
  waitForStatus,
} from "./helpers";

const SLUG = "growth-pub";
let owner: Client;
let publicationId: string;
let postId: string;

before(async () => {
  await resetDatabase();
  ({ owner, publicationId } = await createOwner("grow@example.com", SLUG, "Growth Notes"));
});
after(() => sql.end());

const subscribeAndConfirm = async (email: string) => {
  await new Client().formAction(
    `/${SLUG}`,
    "[slug]/actions",
    "subscribe",
    { email, website: "" },
    { leadingArgs: [SLUG], prev: { status: "idle" } },
  );
  const message = await mail.waitFor(email, "Confirm");
  await new Client().fetch(linkIn(message, "/api/subscriptions/confirm"));
};

describe("marketing pages", () => {
  test("the landing page explains the product and shows prices", async () => {
    const html = await new Client().page("/");
    assert.match(html, /A calm home for your newsletter/);
    assert.match(html, /\$9/);
    assert.match(html, /\$29/);
    assert.match(html, /500 MB/);
  });

  test("the pricing page lists every plan", async () => {
    const html = (await new Client().page("/pricing")).replaceAll("<!-- -->", "");
    for (const text of ["Free", "Pro", "Business", "10 GB image storage", "50 GB image storage"]) {
      assert.ok(html.includes(text), `missing: ${text}`);
    }
    assert.match(html, /<title>Pricing · Postmeadow<\/title>/);
  });
});

describe("welcome email", () => {
  test("confirming sends the default welcome, branded, with unsubscribe headers", async () => {
    await mail.clear();
    await subscribeAndConfirm("new-reader@example.com");
    const welcome = await mail.waitFor("new-reader@example.com", "Welcome to Growth Notes");
    assert.match(welcome.Text, /Thanks for subscribing/);
    assert.equal(welcome.From.Name, "Growth Notes");
    const headers = await (
      await fetch(`${process.env.E2E_MAILPIT}/api/v1/message/${welcome.ID}/headers`)
    ).json();
    assert.match(headers["List-Unsubscribe"][0], /\/api\/unsubscribe\//);
  });

  test("a custom message is used; switching it off stops the email", async () => {
    const save = (fields: Record<string, string>) =>
      owner.formAction("/dashboard/settings", "settings/actions", "updateSettings", {
        name: "Growth Notes",
        description: "",
        fromName: "Growth Notes",
        replyTo: "",
        logoUrl: "",
        accentColor: "",
        fontStyle: "sans",
        welcomeMessage: "",
        ...fields,
      });

    assert.equal(
      (await save({ welcomeEnabled: "on", welcomeMessage: "Hi! **Glad** you're here." })).result.ok,
      true,
    );
    await mail.clear();
    await subscribeAndConfirm("custom@example.com");
    const welcome = await mail.waitFor("custom@example.com", "Welcome to");
    assert.match(welcome.HTML, /<strong>Glad<\/strong>/);

    assert.equal((await save({})).result.ok, true); // checkbox unticked
    await mail.clear();
    await subscribeAndConfirm("no-welcome@example.com");
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(await mail.countTo("no-welcome@example.com"), 1, "only the confirmation email");
  });
});

describe("open and click stats", () => {
  before(async () => {
    await seedSubscribers(publicationId, ["a@example.com", "b@example.com", "c@example.com"]);
    postId = await createDraft(
      owner,
      "Stats issue",
      "stats-issue",
      "Read [the guide](https://example.com/guide) and [the FAQ](https://example.com/faq).",
    );
    await owner.action(`/dashboard/posts/${postId}`, "posts/actions", "sendPost", [postId]);
    await waitForStatus(postId, "sent");
  });

  const messageId = (email: string) =>
    scalar(sql`select d.provider_message_id from deliveries d join subscribers s on s.id = d.subscriber_id
      where d.post_id = ${postId} and s.email = ${email}`);

  test("opens and clicks are recorded per reader and per link", async () => {
    const open = async (email: string) =>
      sendResendEvent({
        type: "email.opened",
        data: { email_id: await messageId(email), to: [email] },
      });
    const click = async (email: string, link: string) =>
      sendResendEvent({
        type: "email.clicked",
        data: { email_id: await messageId(email), to: [email], click: { link } },
      });

    await open("a@example.com");
    await open("a@example.com"); // a second open is counted, but it's still one reader
    await open("b@example.com");
    await click("a@example.com", "https://example.com/guide");
    await click("a@example.com", "https://example.com/guide");
    await click("c@example.com", "https://example.com/guide"); // click without a tracked open
    await click("c@example.com", "https://example.com/faq");
    await click("c@example.com", "javascript:alert(1)"); // never stored

    const [row] =
      await sql`select count(opened_at)::int as opened, count(clicked_at)::int as clicked,
      sum(opens)::int as opens from deliveries where post_id = ${postId}`;
    assert.deepEqual({ ...row }, { opened: 3, clicked: 2, opens: 3 });
    assert.equal(
      await scalar(sql`select count(*) from delivery_link_clicks where url like 'javascript%'`),
      "0",
    );
  });

  // Everyone active got the post, including readers who confirmed in the welcome tests.
  const delivered = async () =>
    Number(
      await scalar(
        sql`select count(*) from deliveries where post_id = ${postId} and status = 'sent'`,
      ),
    );
  const pct = (n: number, d: number) => `${Math.round((n / d) * 1000) / 10}%`;

  test("the post page shows rates and top links", async () => {
    const d = await delivered();
    assert.ok(d >= 3);
    const html = (await owner.page(`/dashboard/posts/${postId}`)).replaceAll("<!-- -->", "");
    assert.match(html, /Engagement/);
    assert.ok(html.includes(`>${pct(3, d)}<`), `open rate ${pct(3, d)} missing`); // a, b, and c via its click
    assert.ok(html.includes(`>${pct(2, d)}<`), `click rate ${pct(2, d)} missing`); // a and c
    assert.ok(html.includes(`3 of ${d} readers`));
    assert.match(html, /example\.com\/guide/);
    assert.match(html, /2 readers · 3 clicks/);
  });

  test("the posts list shows delivered count and open rate", async () => {
    const d = await delivered();
    const html = (await owner.page("/dashboard/posts")).replaceAll("<!-- -->", "");
    assert.ok(
      html.includes(`${d} delivered · ${Math.round((3 / d) * 100)}% opened`),
      "list stats missing",
    );
  });
});

describe("RSS and social previews", () => {
  test("the feed lists sent posts with full content, and is discoverable", async () => {
    const res = await fetch(`${BASE}/${SLUG}/feed.xml`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/rss\+xml/);
    const xml = await res.text();
    assert.match(xml, /^<\?xml version="1.0"/);
    assert.match(xml, /<title>Growth Notes<\/title>/);
    assert.match(xml, /<title>Stats issue<\/title>/);
    assert.match(xml, new RegExp(`<link>${BASE}/${SLUG}/p/stats-issue</link>`));
    assert.match(xml, /<content:encoded><!\[CDATA\[<p>Read <a href="https:\/\/example.com\/guide"/);
    assert.doesNotMatch(xml, /DOCTYPE/);

    const page = await new Client().page(`/${SLUG}`);
    assert.match(page, /type="application\/rss\+xml"[^>]*href="[^"]*\/growth-pub\/feed.xml"/);
  });

  test("drafts never appear in the feed; unknown publications are 404", async () => {
    await createDraft(owner, "Secret draft", "secret-draft");
    assert.doesNotMatch(await (await fetch(`${BASE}/${SLUG}/feed.xml`)).text(), /Secret draft/);
    assert.equal((await fetch(`${BASE}/nope-nope/feed.xml`)).status, 404);
  });

  test("publication and post pages have social preview images", async () => {
    for (const path of [`/${SLUG}/opengraph-image`, `/${SLUG}/p/stats-issue/opengraph-image`]) {
      const res = await fetch(BASE + path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get("content-type"), "image/png");
      assert.ok((await res.arrayBuffer()).byteLength > 5000, `${path} looks empty`);
    }
    const post = await new Client().page(`/${SLUG}/p/stats-issue`);
    assert.match(post, /<meta property="og:image"[^>]*opengraph-image/);
    assert.match(post, /<meta name="twitter:card" content="summary_large_image"/);
  });
});
