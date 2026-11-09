/** Email designs, starter templates and saved templates. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  BASE,
  Client,
  createDraft,
  createOwner,
  mail,
  resetDatabase,
  scalar,
  sql,
} from "./helpers";

let owner: Client;
let publicationId: string;
const SLUG = "designs-pub";

before(async () => {
  await resetDatabase();
  ({ owner, publicationId } = await createOwner("design@example.com", SLUG, "Design Notes"));
});
after(() => sql.end());

const saveSettings = (fields: Record<string, string>, client = owner) =>
  client.formAction("/dashboard/settings", "settings/actions", "updateSettings", {
    name: "Design Notes",
    description: "",
    fromName: "Rami from Design Notes",
    replyTo: "",
    logoUrl: "",
    accentColor: "#b91c1c",
    fontStyle: "sans",
    welcomeEnabled: "on",
    welcomeMessage: "",
    emailDesign: "classic",
    ...fields,
  });

/** Send a test of a fresh post and return the email's HTML. */
async function testEmailHtml(title: string): Promise<string> {
  const id = await createDraft(
    owner,
    title,
    title.toLowerCase().replace(/\W+/g, "-"),
    "## A section\n\nBody text.",
  );
  await mail.clear();
  const { result } = await owner.action(`/dashboard/posts/${id}`, "posts/actions", "sendTest", [
    id,
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
  return (await mail.waitFor("design@example.com", title)).HTML;
}

describe("email designs", () => {
  test("Classic is the default", async () => {
    assert.equal(
      await scalar(sql`select email_design from publications where id = ${publicationId}`),
      "classic",
    );
    const html = await testEmailHtml("Classic issue");
    assert.match(html, /max-width:600px/);
    assert.match(html, />View in browser</);
  });

  test("Minimal is narrow, with the browser link in the footer", async () => {
    assert.equal((await saveSettings({ emailDesign: "minimal" })).result.ok, true);
    const html = await testEmailHtml("Minimal issue");
    assert.match(html, /max-width:560px/);
    assert.match(html, /text-align:center[^>]*>You(&#x27;|')re receiving this/);
  });

  test("Letter is on paper and signed by the sender", async () => {
    await saveSettings({ emailDesign: "letter" });
    const html = await testEmailHtml("Letter issue");
    assert.match(html, /background-color:#f5f5f4/);
    assert.match(html, /— <!-- -->Rami from Design Notes|— Rami from Design Notes/);
  });

  test("Magazine has an accent masthead and accent headings", async () => {
    await saveSettings({ emailDesign: "magazine" });
    const html = await testEmailHtml("Magazine issue");
    assert.match(html, /background-color:#b91c1c/);
    assert.match(html, /DESIGN NOTES/);
    assert.match(html, /<h2[^>]*color:#b91c1c/);
  });

  test("unknown designs are refused", async () => {
    const { result } = await saveSettings({ emailDesign: "comic-sans" });
    assert.match(result.errors.emailDesign, /Pick one/);
    assert.equal(
      await scalar(sql`select email_design from publications where id = ${publicationId}`),
      "magazine",
    );
  });

  test("Settings shows the picker with the current design selected", async () => {
    const html = await owner.page("/dashboard/settings");
    assert.match(html, /Email design/);
    assert.match(html, /role="radio" aria-checked="true" aria-label="Magazine"/);
    // Each design shows a live preview with the writer's name.
    assert.match(html, /src="\/previews\/mine\?design=arcade"/);
  });
});

describe("colourful designs", () => {
  test("Boutique, Launch and Arcade put the cover photo above the title", async () => {
    for (const [design, marker] of [
      ["boutique", /Didot/],
      ["launch", /background-color:#0b1120/],
      ["arcade", /background-color:#120f24/],
    ] as const) {
      await saveSettings({ emailDesign: design });
      const title = `${design} issue`;
      const id = await createDraft(
        owner,
        title,
        `${design}-issue`,
        "![Cover](https://example.com/cover.jpg)\n\nHello there.\n\n[Shop now](https://example.com/shop)",
      );
      await mail.clear();
      await owner.action(`/dashboard/posts/${id}`, "posts/actions", "sendTest", [id]);
      const html = (await mail.waitFor("design@example.com", title)).HTML;
      assert.match(html, marker, design);
      // The cover comes out of the body: above the title (Launch: under its dark title
      // header), and before the text. The lone link is a button.
      const cover = html.indexOf("cover.jpg");
      // (lastIndexOf: the text also appears in the hidden inbox preview line at the top.)
      assert.ok(cover < html.lastIndexOf("Hello there."), `${design}: cover should lead the body`);
      if (design !== "launch") {
        assert.ok(cover < html.indexOf(`>${title}<`), `${design}: cover should come first`);
      }
      assert.match(html, /<a[^>]*href="https:\/\/example.com\/shop"[^>]*padding/);
    }
    await saveSettings({ emailDesign: "classic" });
  });

  test("a post can use its own design", async () => {
    const id = await createDraft(owner, "Own design", "own-design", "Hi");
    const set = await owner.action(`/dashboard/posts/${id}`, "posts/actions", "setPostDesign", [
      id,
      "arcade",
    ]);
    assert.equal(set.result.ok, true, JSON.stringify(set.result));
    await mail.clear();
    await owner.action(`/dashboard/posts/${id}`, "posts/actions", "sendTest", [id]);
    const html = (await mail.waitFor("design@example.com", "Own design")).HTML;
    assert.match(html, /background-color:#120f24/);

    const bad = await owner.action(`/dashboard/posts/${id}`, "posts/actions", "setPostDesign", [
      id,
      "comic-sans",
    ]);
    assert.equal(bad.result.ok, false);
    const back = await owner.action(`/dashboard/posts/${id}`, "posts/actions", "setPostDesign", [
      id,
      null,
    ]);
    assert.equal(back.result.ok, true);
    const [row] = await sql`select email_design from posts where id = ${id}`;
    assert.equal(row.email_design, null);
  });
});

describe("previews", () => {
  test("example emails are public and only frameable by us", async () => {
    const res = await new Client().fetch("/previews/examples/new-collection");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
    const html = await res.text();
    assert.match(html, /Fern &amp; Field|FERN &amp; FIELD/);
    assert.match(html, new RegExp(`${BASE}/templates/fashion/hero.jpg`));
    assert.equal((await new Client().fetch("/previews/examples/nope")).status, 404);
    // Everything else still refuses to be framed.
    assert.equal((await new Client().fetch("/pricing")).headers.get("x-frame-options"), "DENY");
  });

  test("the photos the templates use are served", async () => {
    const res = await new Client().fetch("/templates/gaming/hero.jpg");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/jpeg");
  });

  test("personal previews need a session and use the writer's name", async () => {
    assert.equal((await new Client().fetch("/previews/mine?design=arcade")).status, 401);
    const res = await owner.fetch("/previews/mine?design=arcade");
    assert.equal(res.status, 200);
    assert.match(await res.text(), /DESIGN NOTES/);
    assert.equal((await owner.fetch("/previews/mine?template=game-update")).status, 200);
    assert.equal((await owner.fetch("/previews/mine?template=nope")).status, 404);
  });
});

describe("starter templates", () => {
  test("the New post page lists blank and every starter", async () => {
    const html = await owner.page("/dashboard/posts/new");
    for (const name of [
      "Blank",
      "Weekly roundup",
      "Announcement",
      "Personal letter",
      "Link digest",
      "Interview",
      "New collection",
      "Product launch",
      "Game update",
    ]) {
      assert.ok(html.includes(name), `missing: ${name}`);
    }
  });

  test("starting from a starter fills in the post", async () => {
    const { redirect } = await owner.action(
      "/dashboard/posts/new",
      "posts/actions",
      "createPostFrom",
      ["starter:weekly-roundup"],
    );
    const id = redirect?.match(/\/dashboard\/posts\/([0-9a-f-]{36})/)?.[1];
    assert.ok(id, `no redirect to the new post: ${redirect}`);
    const [post] = await sql`select title, content, status from posts where id = ${id ?? ""}`;
    assert.equal(post.status, "draft");
    assert.match(post.title, /This week/);
    assert.match(post.content, /## The big story/);
  });

  test("a template made for a design brings it, with photos at absolute addresses", async () => {
    const { redirect } = await owner.action(
      "/dashboard/posts/new",
      "posts/actions",
      "createPostFrom",
      ["starter:new-collection"],
    );
    const id = redirect?.match(/\/dashboard\/posts\/([0-9a-f-]{36})/)?.[1];
    const [post] = await sql`select content, email_design from posts where id = ${id ?? ""}`;
    assert.equal(post.email_design, "boutique");
    assert.ok(post.content.includes(`](${BASE}/templates/fashion/hero.jpg)`), post.content);
    assert.ok(!post.content.includes("{{assets}}"));
  });

  test("an unknown starter gives a blank post", async () => {
    const { redirect } = await owner.action(
      "/dashboard/posts/new",
      "posts/actions",
      "createPostFrom",
      ["starter:does-not-exist"],
    );
    const id = redirect?.match(/\/dashboard\/posts\/([0-9a-f-]{36})/)?.[1];
    assert.equal(await scalar(sql`select content from posts where id = ${id ?? ""}`), "");
  });
});

describe("saved templates", () => {
  let templateId: string;

  test("save a post as a template, then start a new post from it", async () => {
    const source = await createDraft(
      owner,
      "Monthly recap",
      "monthly-recap",
      "## Highlights\n\n- one\n- two",
    );
    const saved = await owner.action(
      `/dashboard/posts/${source}`,
      "posts/actions",
      "saveAsTemplate",
      [source, "  Monthly recap format  "],
    );
    assert.equal(saved.result.ok, true, JSON.stringify(saved.result));
    templateId = await scalar(
      sql`select id from post_templates where publication_id = ${publicationId}`,
    );
    assert.equal(
      await scalar(sql`select name from post_templates where id = ${templateId}`),
      "Monthly recap format",
    );
    assert.match(await owner.page("/dashboard/posts/new"), /Monthly recap format/);

    const { redirect } = await owner.action(
      "/dashboard/posts/new",
      "posts/actions",
      "createPostFrom",
      [`saved:${templateId}`],
    );
    const id = redirect?.match(/\/dashboard\/posts\/([0-9a-f-]{36})/)?.[1];
    const [post] = await sql`select title, content from posts where id = ${id ?? ""}`;
    assert.deepEqual(
      { ...post },
      { title: "Monthly recap", content: "## Highlights\n\n- one\n- two" },
    );
  });

  test("a template needs a name", async () => {
    const source = await createDraft(owner, "Nameless", "nameless");
    const { result } = await owner.action(
      `/dashboard/posts/${source}`,
      "posts/actions",
      "saveAsTemplate",
      [source, "   "],
    );
    assert.equal(result.ok, false);
  });

  test("other accounts can't use or delete your templates", async () => {
    const { owner: other } = await createOwner("other-designer@example.com", "other-designs");
    const { redirect } = await other.action(
      "/dashboard/posts/new",
      "posts/actions",
      "createPostFrom",
      [`saved:${templateId}`],
    );
    const id = redirect?.match(/\/dashboard\/posts\/([0-9a-f-]{36})/)?.[1];
    assert.equal(
      await scalar(sql`select content from posts where id = ${id ?? ""}`),
      "",
      "must start blank",
    );

    const del = await other.action("/dashboard/posts/new", "posts/actions", "deleteTemplate", [
      templateId,
    ]);
    assert.equal(del.result.ok, false);
    assert.equal(
      await scalar(sql`select count(*) from post_templates where id = ${templateId}`),
      "1",
    );
  });

  test("the owner can delete a template; posts made from it stay", async () => {
    const del = await owner.action("/dashboard/posts/new", "posts/actions", "deleteTemplate", [
      templateId,
    ]);
    assert.equal(del.result.ok, true);
    assert.equal(
      await scalar(sql`select count(*) from post_templates where id = ${templateId}`),
      "0",
    );
    assert.equal(await scalar(sql`select count(*) from posts where title = 'Monthly recap'`), "2");
  });
});
