import assert from "node:assert/strict";
import { test } from "node:test";
import { paywalledMarkdown, previewMarkdown } from "../../src/lib/paid-preview";

test("the preview is the first blocks, at most a third and at most three", () => {
  const nine = Array.from({ length: 9 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n");
  assert.deepEqual(previewMarkdown(nine), {
    preview: "Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.",
    truncated: true,
  });
  const thirty = Array.from({ length: 30 }, (_, i) => `P${i}.`).join("\n\n");
  assert.equal(previewMarkdown(thirty).preview.split("\n\n").length, 3);
  // Short posts still keep most of it back.
  assert.equal(previewMarkdown("One.\n\nTwo.").preview, "One.");
  assert.deepEqual(previewMarkdown("Only one."), { preview: "Only one.", truncated: false });
});

test("the paywalled version ends with an upgrade button", () => {
  const md = paywalledMarkdown("A.\n\nB.\n\nC.\n\nD.", "https://x.test/pub/upgrade", "The Pub");
  assert.match(md, /^A\./);
  assert.doesNotMatch(md, /D\./);
  assert.match(md, /\n\n\[Upgrade to read the rest\]\(https:\/\/x\.test\/pub\/upgrade\)\n$/);
});
