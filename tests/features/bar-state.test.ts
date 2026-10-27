import assert from "node:assert/strict";
import { test } from "node:test";
import { reduce } from "../../src/features/bar-state.ts";
import { createRegistry } from "../../src/features/registry.ts";
import { COMMON, type BarState } from "../../src/features/types.ts";
import { DEFAULT_SETTINGS } from "../../src/shared/settings.ts";

const registry = createRegistry(DEFAULT_SETTINGS.features);
const ctx = { features: DEFAULT_SETTINGS.features };
const inMarkdown: BarState = { kind: "feature", id: "markdown" };
const row = { hasPreview: true, hasVariant: false };

test("Tab on a trigger word enters the feature, Esc goes back", () => {
  const entered = reduce(COMMON, { type: "tab", input: "md", row: null }, registry);
  assert.deepEqual(entered.state, inMarkdown);
  assert.deepEqual(reduce(inMarkdown, { type: "escape", input: "# x", row, previewOpen: true }, registry).state, COMMON);
});

test("Tab on rows: preview folds, a variant cycles, nothing else happens", () => {
  assert.deepEqual(reduce(COMMON, { type: "tab", input: "x", row }, registry).effects, [{ type: "toggle-preview" }]);
  const variant = { hasPreview: false, hasVariant: true };
  assert.deepEqual(reduce(COMMON, { type: "tab", input: "uuid", row: variant }, registry).effects, [{ type: "cycle-variant" }]);
  assert.deepEqual(reduce(COMMON, { type: "tab", input: "x", row: null }, registry).effects, []);
});

test("Esc outside a feature: fold the preview, then clear, then close", () => {
  const esc = (input: string, previewOpen: boolean) => reduce(COMMON, { type: "escape", input, row, previewOpen }, registry).effects;
  assert.deepEqual(esc("x", true), [{ type: "toggle-preview" }]);
  assert.deepEqual(esc("x", false), [{ type: "clear-input" }]);
  assert.deepEqual(esc("", false), [{ type: "close" }]);
});

test("Backspace on an empty input leaves the feature, on a filled one it is left alone", () => {
  assert.deepEqual(reduce(inMarkdown, { type: "backspace", input: "" }, registry).state, COMMON);
  assert.equal(reduce(inMarkdown, { type: "backspace", input: "a" }, registry).handled, false);
});

test("pasted text is recognized, a prefix forces the format, and the setting turns it off", () => {
  assert.equal(registry.recognize("<h1>Hi</h1><p>x</p>", ctx)[0]?.feature, "html");
  assert.equal(registry.recognize("md # Title\n\ntext", ctx)[0]?.feature, "markdown");
  assert.deepEqual(registry.recognize("just words", ctx), []);
  const off = createRegistry({ ...DEFAULT_SETTINGS.features, markup: false });
  assert.deepEqual(off.recognize("<h1>Hi</h1><p>x</p>", ctx), []);
});
