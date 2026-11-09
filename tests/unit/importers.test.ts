import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { htmlToMarkdown, slugFrom } from "../../src/lib/importers/html-to-markdown";
import { readGhostExport } from "../../src/lib/importers/ghost";
import { readSubstackExport } from "../../src/lib/importers/substack";

test("figures become captioned images on their own line; buttons stand alone", () => {
  const md = htmlToMarkdown(`
    <p>Hello <strong>there</strong>.</p>
    <div class="captioned-image-container"><figure><a class="image-link" href="x">
      <img src="https://cdn.example.com/a.jpg" alt="A shirt"></a>
      <figcaption>Linen shirt · $59</figcaption></figure></div>
    <p class="button-wrapper"><a class="button primary" href="https://shop.example.com"><span>Shop now</span></a></p>
    <div class="subscription-widget-wrap"><p>Subscribe!</p><form><input></form></div>
    <script>alert(1)</script>
    <img src="https://t.example.com/pixel.gif" width="1" height="1">
  `);
  assert.match(md, /Hello \*\*there\*\*\./);
  assert.match(
    md,
    /\n\n!\[A shirt\]\(https:\/\/cdn\.example\.com\/a\.jpg "Linen shirt · \$59"\)\n\n/,
  );
  assert.match(md, /\n\n\[Shop now\]\(https:\/\/shop\.example\.com\)$/m);
  assert.doesNotMatch(md, /Subscribe!|alert|pixel/);
});

test("YouTube embeds become links; relative images resolve against the base", () => {
  const md = htmlToMarkdown(
    `<iframe src="https://www.youtube.com/embed/abc123"></iframe><p><img src="/img/b.png" alt="b"></p>`,
    { base: "https://blog.example.com/post/" },
  );
  assert.match(md, /\[Watch it here\]\(https:\/\/www\.youtube\.com\/watch\?v=abc123\)/);
  assert.match(md, /!\[b\]\(https:\/\/blog\.example\.com\/img\/b\.png\)/);
});

test("slugs are tidy and long enough", () => {
  assert.equal(slugFrom("Héllo, World! 2026"), "hello-world-2026");
  assert.equal(slugFrom("a"), "post-a");
});

test("reads a Substack export ZIP", () => {
  const csv = [
    "post_id,post_date,is_published,email_sent_at,inbox_sent_at,type,audience,title,subtitle,podcast_url",
    "111.first-post,2025-01-02T10:00:00.000Z,true,,,newsletter,everyone,First post,Hello,",
    "222.paid-post,2025-02-02T10:00:00.000Z,true,,,newsletter,only_paid,Paid post,,",
    "333.draft,2025-03-02T10:00:00.000Z,false,,,newsletter,everyone,Draft,,",
  ].join("\n");
  const zip = zipSync({
    "posts.csv": strToU8(csv),
    "posts/111.first-post.html": strToU8("<p>One</p>"),
    "posts/222.paid-post.html": strToU8("<p>Two</p>"),
    "posts/333.draft.html": strToU8("<p>Three</p>"),
    "email_list.x.csv": strToU8("email\na@example.com"),
  });
  const posts = readSubstackExport(zip);
  assert.equal(posts.length, 3);
  assert.deepEqual(
    posts.map((p) => [p.key, p.slug, p.published, p.public]),
    [
      ["substack:111", "first-post", true, true],
      ["substack:222", "paid-post", true, false],
      ["substack:333", "draft", false, true],
    ],
  );
  assert.throws(() => readSubstackExport(strToU8("not a zip")));
});

test("reads a Ghost export and fixes __GHOST_URL__", () => {
  const json = JSON.stringify({
    db: [
      {
        data: {
          posts: [
            {
              id: "1",
              uuid: "u1",
              title: "Ghost post",
              slug: "ghost-post",
              html: '<p><img src="__GHOST_URL__/content/images/a.jpg"></p>',
              status: "published",
              type: "post",
              visibility: "public",
              published_at: "2024-05-01T00:00:00.000Z",
              feature_image: "__GHOST_URL__/content/images/cover.jpg",
            },
            {
              id: "2",
              title: "About",
              slug: "about",
              html: "<p>x</p>",
              type: "page",
              status: "published",
            },
          ],
        },
      },
    ],
  });
  const posts = readGhostExport(json, "https://ghost.example.com/");
  assert.equal(posts.length, 1);
  assert.match(posts[0].html, /https:\/\/ghost\.example\.com\/content\/images\/a\.jpg/);
  assert.equal(posts[0].coverImage, "https://ghost.example.com/content/images/cover.jpg");
});
