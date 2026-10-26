import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, fromImportFile, mergeSettings, toExportFile } from "../../src/shared/settings.ts";

test("missing settings fall back to defaults", () => {
  assert.deepEqual(mergeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(mergeSettings({}), DEFAULT_SETTINGS);
});

test("saved values override defaults, unknown keys are dropped", () => {
  const s = mergeSettings({ features: { calculator: false }, junk: 1, appearance: { theme: "light" } });
  assert.equal(s.features.calculator, false);
  assert.equal(s.features.uuid, true);
  assert.equal(s.appearance.theme, "light");
  assert.equal(s.appearance.width, DEFAULT_SETTINGS.appearance.width);
  assert.equal("junk" in s, false);
});

test("values of the wrong type are ignored", () => {
  const s = mergeSettings({ limits: { tabs: "lots" }, features: "nope" });
  assert.equal(s.limits.tabs, DEFAULT_SETTINGS.limits.tabs);
  assert.deepEqual(s.features, DEFAULT_SETTINGS.features);
});

test("defaults are never mutated", () => {
  const s = mergeSettings({});
  s.features.overlay = false;
  assert.equal(DEFAULT_SETTINGS.features.overlay, true);
});

test("export → import round trip", () => {
  const custom = mergeSettings({ shortcuts: { copyUrl: "" }, appearance: { accent: "#ff0000" } });
  const file = JSON.parse(JSON.stringify(toExportFile(custom)));
  assert.equal(file.app, "cmdly");
  assert.deepEqual(fromImportFile(file), custom);
});

test("import accepts a bare settings object", () => {
  assert.equal(fromImportFile({ appearance: { theme: "light" } }).appearance.theme, "light");
});

test("import rejects garbage with a readable message", () => {
  assert.throws(() => fromImportFile(null), /Not a Cmdly settings file/);
  assert.throws(() => fromImportFile([1, 2]), /Not a Cmdly settings file/);
  assert.throws(() => fromImportFile({ app: "other", settings: {} }), /another app/);
  assert.throws(() => fromImportFile({ app: "cmdly" }), /Settings are missing/);
  assert.throws(() => fromImportFile({ foo: 1 }), /No Cmdly settings/);
});

test("the old soft-wrap switch becomes overflow = wrap, bad values fall back", () => {
  assert.equal(mergeSettings({ switcher: { softWrap: true } }).switcher.overflow, "wrap");
  assert.equal(mergeSettings({ switcher: { softWrap: false } }).switcher.overflow, "fit");
  assert.equal(mergeSettings({ switcher: { softWrap: true, overflow: "scroll" } }).switcher.overflow, "scroll");
  assert.equal(mergeSettings({ switcher: { overflow: "sideways" } }).switcher.overflow, "fit");
});
