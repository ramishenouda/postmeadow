/**
 * Markdown written by the rich-text editor must render the same way in our
 * email/web renderer as the original Markdown did.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveExtensions } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { renderToStaticMarkup } from "react-dom/server";
import { contentExtensions } from "../../src/components/editor/extensions";
import { webComponents } from "../../src/components/markdown-components";
import { parseMarkdown } from "../../src/lib/markdown/parse";
import { renderMarkdownTree } from "../../src/lib/markdown/render";

const manager = new MarkdownManager({ extensions: resolveExtensions(contentExtensions()) });
const html = (md: string) =>
  renderToStaticMarkup(<>{renderMarkdownTree(parseMarkdown(md), webComponents)}</>);

/** Same text and same tags, e.g. <strong><a> vs <a><strong>: looks identical. */
const equivalent = (a: string, b: string) => {
  const text = (h: string) => h.replace(/<[^>]+>/g, "");
  const tags = (h: string) => (h.match(/<[^>]+>/g) ?? []).sort().join("");
  return text(a) === text(b) && tags(a) === tags(b);
};

const cases: Record<string, string> = {
  paragraphs: "First paragraph.\n\nSecond paragraph.",
  inline: "Some **bold**, _italic_, ~~struck~~ and `code`. Also ***both***.",
  headings: "## Section\n\nText\n\n### Sub-section\n\nMore",
  link: "A [link](https://example.com) and [mail](mailto:a@example.com).",
  "bold link": "A **[bold link](https://example.com)** here.",
  bullets: "- one\n- two\n- three",
  ordered: "1. first\n2. second\n3. third",
  nested: "- parent\n  - child\n  - child 2\n- sibling",
  quote: "> a quote\n> continues",
  "code block": "```js\nconst x = 1 < 2;\nconsole.log(`hi`);\n```",
  divider: "Above\n\n---\n\nBelow",
  image: "![Alt text](https://example.com/a.png)",
  table: "| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |",
  "special characters":
    "Prices: 5 * 3 = 15, use _underscores_ and a literal \\*star\\*. 2 < 3 & 4 > 1",
  "hard break": "line one  \nline two",
  mixed:
    "## What's new\n\nHello **readers**! Here's a [link](https://example.com).\n\n- one\n- two\n\n> a quote\n\n---\n\n1. a\n2. b",
};

for (const [name, md] of Object.entries(cases)) {
  test(`round trip: ${name}`, () => {
    const once = manager.serialize(manager.parse(md));
    const twice = manager.serialize(manager.parse(once));
    assert.equal(twice, once, "not stable on a second pass");
    const before = html(md);
    const after = html(once);
    assert.ok(
      before === after || equivalent(before, after),
      `renders differently\n  in:  ${md}\n  out: ${once}\n  ${before}\n  ${after}`,
    );
  });
}
