/** Email designs, starter templates and saved templates. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { Client, createDraft, createOwner, mail, resetDatabase, scalar, sql } from "./helpers";

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
    assert.match(html, /role="radio" aria-checked="true"[^>]*>[\s\S]*?Magazine/);
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
