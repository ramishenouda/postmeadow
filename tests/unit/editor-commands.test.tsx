/**
 * Runs the real Tiptap editor headlessly (happy-dom) through the same commands
 * the toolbar uses, and checks the Markdown it saves renders correctly in emails.
 */
import "./setup-dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Editor } from "@tiptap/core";
import { renderToStaticMarkup } from "react-dom/server";
import { contentExtensions, editorExtensions } from "../../src/components/editor/extensions";
import { filterSlashItems, slashItems } from "../../src/components/editor/slash-command";
import { normalizeUrl } from "../../src/components/editor/link-popover";
import { emailMarkdownComponents } from "../../src/emails/components/markdown-email";
import { parseMarkdown } from "../../src/lib/markdown/parse";
import { renderMarkdownTree } from "../../src/lib/markdown/render";

const emailHtml = (md: string) =>
  renderToStaticMarkup(<>{renderMarkdownTree(parseMarkdown(md), emailMarkdownComponents)}</>);

const make = (markdown = "") =>
  new Editor({ extensions: contentExtensions(), content: markdown, contentType: "markdown" });

const check = (name: string, ok: boolean, detail = "") => {
  test(name, () => assert.ok(ok, detail));
};

// Headings
{
  const e2 = make("");
  e2.chain().focus().setHeading({ level: 2 }).insertContent("Hello").run();
  check("heading", e2.getMarkdown().trim() === "## Hello", e2.getMarkdown());
  e2.destroy();
}

// Marks
{
  const e = make("make this bold");
  e.chain().focus().setTextSelection({ from: 6, to: 10 }).toggleBold().run();
  check("bold selection", e.getMarkdown().trim() === "make **this** bold", e.getMarkdown());
  e.chain().setTextSelection({ from: 1, to: 5 }).toggleItalic().run();
  check("italic", /^[*_]make[*_] \*\*this\*\* bold$/.test(e.getMarkdown().trim()), e.getMarkdown());
  e.destroy();
}

// Links: toolbar flow with selection, without selection, and unsafe URLs
{
  const e = make("read the docs");
  e.chain()
    .focus()
    .setTextSelection({ from: 10, to: 14 })
    .extendMarkRange("link")
    .setLink({ href: normalizeUrl("example.com/docs")! })
    .run();
  const md = e.getMarkdown().trim();
  check("link on selection", md === "read the [docs](https://example.com/docs)", md);
  check(
    "link renders in email",
    emailHtml(md).includes('href="https://example.com/docs"'),
    emailHtml(md),
  );
  e.chain().focus().setTextSelection(12).extendMarkRange("link").unsetLink().run();
  check("remove link", e.getMarkdown().trim() === "read the docs", e.getMarkdown());
  e.destroy();

  check("normalizeUrl: email → mailto", normalizeUrl("a@b.co") === "mailto:a@b.co");
  check("normalizeUrl: rejects javascript:", normalizeUrl("javascript:alert(1)") === null);
  check("normalizeUrl: rejects data:", normalizeUrl("data:text/html,x") === null);

  const bad = make("x");
  const applied = bad.chain().selectAll().setLink({ href: "javascript:alert(1)" }).run();
  check(
    "editor refuses javascript: links",
    !bad.getMarkdown().includes("javascript:"),
    `applied=${applied} md=${bad.getMarkdown()}`,
  );
  bad.destroy();
}

// Lists, quote, code block, divider
{
  const e = make("one");
  e.chain().focus().toggleBulletList().run();
  check("bullet list", e.getMarkdown().trim() === "- one", e.getMarkdown());
  e.chain().toggleBulletList().toggleOrderedList().run();
  check("numbered list", e.getMarkdown().trim() === "1. one", e.getMarkdown());
  e.chain().toggleOrderedList().toggleBlockquote().run();
  check("quote", e.getMarkdown().trim() === "> one", e.getMarkdown());
  e.destroy();

  const c = make("const x = 1;");
  c.chain().focus().toggleCodeBlock().run();
  check("code block", c.getMarkdown().trim() === "```\nconst x = 1;\n```", c.getMarkdown());
  c.destroy();

  const d = make("above");
  d.chain().focus("end").setHorizontalRule().run();
  const md = d.getMarkdown();
  check("divider", /above\n\n---/.test(md) && emailHtml(md).includes("<hr"), md);
  d.destroy();
}

// Image
{
  const e = make("");
  e.chain().focus().setImage({ src: "https://example.com/a.png", alt: "A chart" }).run();
  const md = e.getMarkdown().trim();
  check("image", md === "![A chart](https://example.com/a.png)", md);
  check(
    "image renders in email",
    /<img[^>]+src="https:\/\/example.com\/a.png"/.test(emailHtml(md)),
  );
  e.destroy();
}

// Table: insert, add row/column, fill, render
{
  const e = make("");
  e.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
  e.chain().addColumnAfter().addRowAfter().run();
  const md = e.getMarkdown();
  const html = emailHtml(md);
  const rows = (html.match(/<tr/g) ?? []).length;
  const cells = (html.match(/<t[hd]/g) ?? []).length;
  check(
    "table renders 3 rows × 3 columns",
    rows === 3 && cells === 9,
    `${rows} rows, ${cells} cells\n${md}`,
  );
  e.destroy();
}

// Loading an existing post and saving it without edits must not change it
{
  const original =
    "## What's new\n\nHello **readers**! Here's a [link](https://example.com).\n\n- one\n- two\n\n> a quote\n\n---\n\n1. a\n2. b";
  const e = make(original);
  check(
    "existing post survives load + save",
    emailHtml(e.getMarkdown()) === emailHtml(original),
    e.getMarkdown(),
  );
  e.destroy();
}

// Unsupported Markdown in old posts: raw HTML is ignored by the renderer either way
{
  const e = make("Hi <b>there</b>\n\n<script>alert(1)</script>");
  check("no <script> reaches the email", !emailHtml(e.getMarkdown()).includes("<script"));
  e.destroy();
}

// ─── Slash menu ─────────────────────────────────────────────────────────────

{
  const expected: Record<string, RegExp> = {
    Heading: /^## Title$/,
    Subheading: /^### Title$/,
    "Bulleted list": /^- ?$/,
    "Numbered list": /^1\. ?$/,
    Quote: /^> ?$/,
    Divider: /^---/,
    "Code block": /^```\n?\n?```$/,
    Table: /^\|.*\|\n\| *-+ *\|/,
  };
  let picked = 0;
  const items = slashItems(() => picked++);

  for (const item of items) {
    test(`slash: ${item.title} replaces the typed "/query"`, () => {
      // The editor with the full extension set, as in the app.
      const e = new Editor({
        extensions: editorExtensions("…"),
        content: "/xyz",
        contentType: "markdown",
      });
      item.run(e, { from: 1, to: 5 }); // the "/xyz" text
      // Empty headings write no Markdown at all, so type into them like a writer would.
      if (item.title.endsWith("eading")) e.commands.insertContent("Title");
      const md = e.getMarkdown().trim();
      assert.ok(!md.includes("/xyz"), `query not removed: ${md}`);
      if (item.title === "Image") assert.equal(picked, 1, "image picker not opened");
      else assert.match(md, expected[item.title], `${item.title} produced: ${JSON.stringify(md)}`);
      e.destroy();
    });
  }

  test("slash: filtering by title and keyword", () => {
    const titles = (q: string) => filterSlashItems(items, q).map((i) => i.title);
    assert.deepEqual(titles("h2"), ["Heading"]);
    assert.deepEqual(titles("ol"), ["Numbered list"]);
    assert.ok(titles("ima").includes("Image"));
    assert.deepEqual(titles("zzz"), []);
    assert.equal(titles("").length, items.length);
  });
}
