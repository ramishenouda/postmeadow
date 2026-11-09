/** Importing posts from Substack, Ghost and feeds. */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { Client, createOwner, mail, resetDatabase, scalar, sql } from "./helpers";

let owner: Client;
const SLUG = "import-pub";
let feedServer: Server;
let feedUrl = "";

const FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Old blog</title><link>https://old.example.com</link>
<item><title>Feed post one</title><link>https://old.example.com/p/feed-one</link>
<guid>https://old.example.com/p/feed-one</guid><pubDate>Mon, 06 Jan 2025 10:00:00 GMT</pubDate>
<description>Short summary</description>
<content:encoded><![CDATA[<p>Full <em>content</em> here.</p><p><a class="button" href="https://old.example.com/shop">Visit the shop</a></p>]]></content:encoded></item>
<item><title>Feed post two</title><link>https://old.example.com/p/feed-two</link>
<pubDate>Tue, 07 Jan 2025 10:00:00 GMT</pubDate><description><![CDATA[<p>Second.</p>]]></description></item>
</channel></rss>`;

before(async () => {
  await resetDatabase();
  await mail.clear();
  ({ owner } = await createOwner("importer@example.com", SLUG, "Imported Times"));
  feedServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/rss+xml" });
    res.end(FEED);
  });
  await new Promise<void>((r) => feedServer.listen(0, "127.0.0.1", r));
  const address = feedServer.address();
  feedUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/feed`;
});
after(async () => {
  feedServer.close();
  await sql.end();
});

async function upload(fields: Record<string, string | Blob>, client = owner) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  const res = await client.fetch("/api/import", { method: "POST", body });
  return { status: res.status, json: await res.json() };
}

function substackZip() {
  const csv = [
    "post_id,post_date,is_published,email_sent_at,inbox_sent_at,type,audience,title,subtitle,podcast_url",
    "111.hello-world,2024-03-01T10:00:00.000Z,true,,,newsletter,everyone,Hello world,The first one,",
    "222.members-only,2024-04-01T10:00:00.000Z,true,,,newsletter,only_paid,Members only,,",
    "333.unfinished,2024-05-01T10:00:00.000Z,false,,,newsletter,everyone,Unfinished,,",
  ].join("\n");
  return new Blob([
    new Uint8Array(
      zipSync({
        "posts.csv": strToU8(csv),
        "posts/111.hello-world.html": strToU8(
          '<p>Welcome!</p><figure><img src="https://cdn.example.com/x.jpg" alt="x"><figcaption>A photo</figcaption></figure>',
        ),
        "posts/222.members-only.html": strToU8("<p>Secret</p>"),
        "posts/333.unfinished.html": strToU8("<p>WIP</p>"),
      }),
    ),
  ]);
}

describe("importing posts", () => {
  test("Substack: published posts join the archive with their dates; paid ones stay off the web", async () => {
    const { status, json } = await upload({
      source: "substack",
      mode: "archive",
      file: substackZip(),
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.deepEqual(
      { found: json.found, imported: json.imported, drafts: json.drafts, hidden: json.hidden },
      { found: 3, imported: 3, drafts: 1, hidden: 1 },
    );
    const archive = await new Client().page(`/${SLUG}`);
    assert.match(archive, /Hello world/);
    assert.doesNotMatch(archive, /Members only|Unfinished/);
    const post = await new Client().page(`/${SLUG}/p/hello-world`);
    assert.match(post, /Welcome!/);
    assert.match(post, /A photo/);
    assert.equal(
      await scalar(
        sql`select to_char(published_at at time zone 'utc', 'YYYY-MM-DD') from posts where slug = 'hello-world'`,
      ),
      "2024-03-01",
    );
    // Nothing was emailed, and nobody was counted.
    assert.equal(await scalar(sql`select count(*) from deliveries`), "0");
  });

  test("importing the same export again skips what's already there", async () => {
    const { json } = await upload({ source: "substack", mode: "archive", file: substackZip() });
    assert.equal(json.imported, 0);
    assert.equal(json.skipped, 3);
  });

  test("feeds by address, as drafts", async () => {
    const { status, json } = await upload({ source: "feed", mode: "drafts", url: feedUrl });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.imported, 2);
    const content = await scalar(sql`select content from posts where slug = 'feed-one'`);
    assert.match(content, /Full \*content\* here\./);
    assert.match(content, /\n\n\[Visit the shop\]\(https:\/\/old\.example\.com\/shop\)/);
    assert.equal(await scalar(sql`select status from posts where slug = 'feed-two'`), "draft");
  });

  test("Ghost exports, with the site address filled in", async () => {
    const ghost = JSON.stringify({
      db: [
        {
          data: {
            posts: [
              {
                uuid: "g-1",
                title: "From Ghost",
                slug: "from-ghost",
                html: '<p>Hi <a href="__GHOST_URL__/about/">about</a></p>',
                status: "published",
                type: "post",
                visibility: "public",
                published_at: "2023-01-01T00:00:00.000Z",
              },
            ],
          },
        },
      ],
    });
    const { json } = await upload({
      source: "ghost",
      mode: "archive",
      siteUrl: "https://ghost.example.com",
      file: new Blob([ghost], { type: "application/json" }),
    });
    assert.equal(json.imported, 1, JSON.stringify(json));
    assert.match(
      await scalar(sql`select content from posts where slug = 'from-ghost'`),
      /https:\/\/ghost\.example\.com\/about\//,
    );
  });

  test("bad files get a clear error; signed-out people are refused", async () => {
    const bad = await upload({ source: "substack", mode: "archive", file: new Blob(["nope"]) });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /ZIP/);
    const signedOut = await upload({ source: "feed", url: feedUrl }, new Client());
    assert.equal(signedOut.status, 401);
    assert.match(await owner.page("/dashboard/posts/import"), /Import posts/);
  });
});
