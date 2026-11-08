/**
 * Starter templates must open in the editor without losing anything: their Markdown
 * should survive the editor's round trip and render the same in emails.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveExtensions } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { renderToStaticMarkup } from "react-dom/server";
import { contentExtensions } from "../../src/components/editor/extensions";
import { emailMarkdownComponents } from "../../src/emails/components/markdown-email";
import { parseMarkdown } from "../../src/lib/markdown/parse";
import { renderMarkdownTree } from "../../src/lib/markdown/render";
import { STARTER_TEMPLATES, starterTemplate } from "../../src/lib/post-templates";

const manager = new MarkdownManager({ extensions: resolveExtensions(contentExtensions()) });
const html = (md: string) =>
  renderToStaticMarkup(<>{renderMarkdownTree(parseMarkdown(md), emailMarkdownComponents)}</>);

/** Same text and same tags (nesting order may differ, which looks identical). */
const equivalent = (a: string, b: string) => {
  const text = (h: string) => h.replace(/<[^>]+>/g, "");
  const tags = (h: string) => (h.match(/<[^>]+>/g) ?? []).sort().join("");
  return text(a) === text(b) && tags(a) === tags(b);
};

for (const template of STARTER_TEMPLATES) {
  test(`starter template "${template.name}" survives the editor`, () => {
    const once = manager.serialize(manager.parse(template.content));
    const before = html(template.content);
    const after = html(once);
    assert.ok(
      before === after || equivalent(before, after),
      `renders differently after the editor:\n${template.content}\n---\n${once}`,
    );
    assert.ok(template.title.length > 0 && template.title.length <= 200);
    assert.ok(template.name.length > 0 && template.description.length > 0);
  });
}

test("template ids are unique and look-up works", () => {
  const ids = STARTER_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(starterTemplate("weekly-roundup")?.name, "Weekly roundup");
  assert.equal(starterTemplate("nope"), null);
});
