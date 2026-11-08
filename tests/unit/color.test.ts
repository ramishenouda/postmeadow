import assert from "node:assert/strict";
import { test } from "node:test";
import { accentIsReadable, contrastRatio, DEFAULT_ACCENT } from "../../src/lib/color";

test("contrast ratio matches WCAG reference values", () => {
  assert.equal(contrastRatio("#000000", "#ffffff").toFixed(1), "21.0");
  assert.equal(contrastRatio("#ffffff", "#ffffff").toFixed(1), "1.0");
  assert.equal(contrastRatio("#767676", "#ffffff").toFixed(2), "4.54"); // the classic AA grey
});

test("readable accents pass, pale ones and malformed values don't", () => {
  assert.ok(accentIsReadable(DEFAULT_ACCENT));
  assert.ok(accentIsReadable("#b91c1c")); // dark red
  assert.ok(!accentIsReadable("#fde047")); // yellow
  assert.ok(!accentIsReadable("#22c55e")); // bright green, ~2.3:1
  assert.ok(!accentIsReadable("red"));
  assert.ok(!accentIsReadable("#12345"));
});
