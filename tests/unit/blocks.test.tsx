/**
 * Buttons, image rows (galleries) with captions, cover photos and the designs that
 * use them: in the Markdown renderer, the editor and the email.
 */
import "./setup-dom";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Editor } from "@tiptap/core";
import { renderToStaticMarkup } from "react-dom/server";
import { isButtonParagraph } from "../../src/components/editor/blocks";
import { contentExtensions } from "../../src/components/editor/extensions";
import { filterSlashItems, slashItems } from "../../src/components/editor/slash-command";
import { createEmailMarkdownComponents } from "../../src/emails/components/markdown-email";
import NewsletterEmail from "../../src/emails/newsletter";
import { ARCADE, emailTheme } from "../../src/emails/theme";
import { accentOnDark, contrastRatio, mixColors } from "../../src/lib/color";
import { EMAIL_DESIGNS, type EmailDesign } from "../../src/lib/email-designs";
import { parseMarkdown } from "../../src/lib/markdown/parse";
import { galleryRows, renderMarkdownTree, splitHero } from "../../src/lib/markdown/render";

const email = (md: string, design: EmailDesign = "classic") =>
  renderToStaticMarkup(
    <>{renderMarkdownTree(parseMarkdown(md), createEmailMarkdownComponents({ design }))}</>,
  );

const IMG = (n: number, title?: string) =>
  `![Photo ${n}](https://x.test/${n}.jpg${title ? ` "${title}"` : ""})`;

test("a paragraph that is only a link becomes a button", () => {
  const html = email("[Shop the collection](https://shop.test)");
  // React Email's Button is a styled <a> with padding, not a plain underlined link.
  assert.match(html, /<a[^>]*href="https:\/\/shop.test"[^>]*padding/);
  assert.match(html, /Shop the collection/);
  assert.doesNotMatch(html, /text-decoration:underline/);
});

test("a link inside a sentence stays a link", () => {
  const html = email("Read [this essay](https://x.test) today.");
  assert.match(html, /text-decoration:underline/);
});

test("an unsafe link on its own is not a button", () => {
  const html = email("[Click](javascript:alert(1))");
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /padding:14px/);
});

test("images in a row are laid out side by side with captions", () => {
  const md = [IMG(1, "Linen shirt · $59"), IMG(2, "Trousers · $79"), IMG(3)].join("\n\n");
  const html = email(md);
  assert.equal((html.match(/<img/g) ?? []).length, 3);
  // Three columns with fixed widths for Outlook: (560 - 2 × 12) / 3 = 178.
  assert.equal((html.match(/width="178"/g) ?? []).length, 3);
  assert.match(html, /<strong[^>]*>Linen shirt<\/strong>/);
  assert.match(html, /\$59/);
});

test("rows are 3 wide, with 2s instead of a lonely 1", () => {
  const shape = (n: number) => galleryRows(Array.from({ length: n })).map((r) => r.length);
  assert.deepEqual(shape(1), [1]);
  assert.deepEqual(shape(2), [2]);
  assert.deepEqual(shape(3), [3]);
  assert.deepEqual(shape(4), [2, 2]);
  assert.deepEqual(shape(5), [3, 2]);
  assert.deepEqual(shape(6), [3, 3]);
  assert.deepEqual(shape(7), [3, 2, 2]);
});

test("a post that opens with one image has a cover photo", () => {
  const { hero, rest } = splitHero(parseMarkdown(`${IMG(1)}\n\nHello`));
  assert.equal(hero?.src, "https://x.test/1.jpg");
  assert.equal(rest.children.length, 1);
  // …but not when the opening images are a row.
  assert.equal(splitHero(parseMarkdown(`${IMG(1)}\n\n${IMG(2)}\n\nHi`)).hero, null);
  assert.equal(splitHero(parseMarkdown("Hello\n\n" + IMG(1))).hero, null);
});

test("every design renders a full email, with the cover photo where it has one", async () => {
  for (const design of Object.keys(EMAIL_DESIGNS) as EmailDesign[]) {
    const html = renderToStaticMarkup(
      <NewsletterEmail
        design={design}
        publicationName="Fern & Field"
        publicationUrl="https://app.test/fern"
        title="The Autumn Edit"
        preview="New in"
        webUrl="https://app.test/fern/p/autumn"
        unsubscribeUrl="https://app.test/u/x"
        brand={{ accent: "#9a3412" }}
        hero={{ src: "https://x.test/hero.jpg", alt: "Cover", title: null }}
      >
        <p>Body</p>
      </NewsletterEmail>,
    );
    assert.match(html, /The Autumn Edit/, design);
    assert.match(html, /https:\/\/app.test\/u\/x/, `${design}: unsubscribe link`);
    assert.equal(
      html.includes("https://x.test/hero.jpg"),
      EMAIL_DESIGNS[design].hero,
      `${design}: cover photo`,
    );
  }
});

test("dark designs lighten the accent until it's readable", () => {
  for (const accent of ["#15803d", "#1d4ed8", "#7c3aed", "#9a3412", "#111111"]) {
    const neon = accentOnDark(accent, ARCADE.surface, 7);
    assert.ok(contrastRatio(neon, ARCADE.surface) >= 7, `${accent} → ${neon}`);
  }
  assert.equal(mixColors("#000000", "#ffffff", 0.5), "#808080");
  // Arcade text and links are light on dark.
  const t = emailTheme("arcade", "#15803d");
  assert.ok(contrastRatio(t.text, t.surface) >= 7);
  assert.ok(contrastRatio(t.link, t.surface) >= 7);
});

test("buttons and captions survive the editor", () => {
  const md = `${IMG(1, "Linen shirt · $59")}\n\n${IMG(2)}\n\n[Shop now](https://shop.test)`;
  const editor = new Editor({
    extensions: contentExtensions(),
    content: md,
    contentType: "markdown",
  });
  const out = editor.getMarkdown();
  assert.match(out, /"Linen shirt · \$59"/);
  assert.match(out, /^\[Shop now\]\(https:\/\/shop.test\)$/m);
  const paragraphs: boolean[] = [];
  editor.state.doc.forEach((n) => {
    if (n.type.name === "paragraph") paragraphs.push(isButtonParagraph(n));
  });
  assert.deepEqual(paragraphs, [true]);
  editor.destroy();
});

test('"/button" inserts a button and selects its label', () => {
  const editor = new Editor({ extensions: contentExtensions(), content: "" });
  const [item] = filterSlashItems(
    slashItems(() => {}),
    "button",
  );
  assert.equal(item.title, "Button");
  item.run(editor, { from: 1, to: 1 });
  const { from, to } = editor.state.selection;
  assert.equal(editor.state.doc.textBetween(from, to), "Button text");
  editor.commands.insertContent("Shop the sale");
  assert.equal(editor.getMarkdown().trim(), "[Shop the sale](https://example.com)");
  editor.destroy();
});
