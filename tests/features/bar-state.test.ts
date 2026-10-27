import assert from "node:assert/strict";
import { test } from "node:test";
import { reduce } from "../../src/features/bar-state.ts";
import { createRegistry } from "../../src/features/registry.ts";
import { COMMON, type BarState } from "../../src/features/types.ts";
import { DEFAULT_SETTINGS } from "../../src/shared/settings.ts";

const registry = createRegistry(DEFAULT_SETTINGS.features);
const ctx = { features: DEFAULT_SETTINGS.features, tools: DEFAULT_SETTINGS.tools };
const inMarkdown: BarState = { kind: "feature", id: "markdown" };
const row = { hasPreview: true, hasVariant: false };

test("Tab on a trigger word enters the feature, Esc goes back", () => {
  const entered = reduce(COMMON, { type: "tab", input: "md", row: null }, registry);
  assert.deepEqual(entered.state, inMarkdown);
  assert.deepEqual(reduce(inMarkdown, { type: "escape", input: "# x", row, previewOpen: true }, registry).state, COMMON);
});

test("Tab on rows: a preview folds, nothing else happens", () => {
  assert.deepEqual(reduce(COMMON, { type: "tab", input: "x", row }, registry).effects, [{ type: "toggle-preview" }]);
  const orphan = { hasPreview: false, hasVariant: true };
  assert.deepEqual(reduce(COMMON, { type: "tab", input: "uuid", row: orphan }, registry).effects, []); // a variant needs its feature
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
  // A trigger word alone is not enough: the rest has to be able to be that format.
  for (const query of ["html to pdf", "md file", "swagger ui", "md hello world"]) assert.deepEqual(registry.recognize(query, ctx), [], query);
  assert.equal(registry.recognize("html <b>hi</b>", ctx)[0]?.feature, "html");
  assert.equal(registry.recognize("md # Title", ctx)[0]?.feature, "markdown");
  assert.deepEqual(registry.recognize("# todo", ctx), []); // one line is not certain enough without the prefix
  const spec = JSON.stringify({ openapi: "3.0.0", paths: {} });
  assert.equal(registry.recognize(spec, ctx).filter((r) => r.feature === "openapi" || r.feature === "html").length, 1);
  const off = createRegistry({ ...DEFAULT_SETTINGS.features, markup: false });
  assert.deepEqual(off.recognize("<h1>Hi</h1><p>x</p>", ctx), []);
});

test("data and UUID rows belong to their features; an OpenAPI spec keeps the JSON rows too", () => {
  const json = registry.recognize('{"a":1}', ctx);
  assert.deepEqual(new Set(json.map((r) => r.feature)), new Set(["json"]));
  const uuid = registry.recognize("uuid", ctx)[0];
  assert.equal(uuid.feature, "uuid");
  assert.deepEqual(reduce(COMMON, { type: "tab", input: "uuid", row: { feature: "uuid", hasPreview: false, hasVariant: true } }, registry).effects, [{ type: "cycle-variant" }]);
  const spec = registry.recognize('{"openapi":"3.0.0","info":{"title":"T","version":"1"},"paths":{}}', ctx).map((r) => r.feature);
  assert.ok(spec.includes("openapi") && spec.includes("json"));
});
