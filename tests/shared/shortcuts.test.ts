import assert from "node:assert/strict";
import { test } from "node:test";
import { formatShortcut, isValidShortcut, matchesShortcut, shortcutFromEvent } from "../../src/shared/shortcuts.ts";

const key = (code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

test("records a shortcut from a key press", () => {
  assert.equal(shortcutFromEvent(key("KeyC", { meta: true, shift: true })), "Shift+Meta+KeyC");
  assert.equal(shortcutFromEvent(key("KeyK", { ctrl: true })), "Ctrl+KeyK");
  assert.equal(shortcutFromEvent(key("MetaLeft", { meta: true })), null); // modifiers only
});

test("matches exact modifiers only", () => {
  const copyUrl = "Meta+Shift+KeyC";
  assert.equal(matchesShortcut(key("KeyC", { meta: true, shift: true }), copyUrl), true);
  assert.equal(matchesShortcut(key("KeyC", { meta: true }), copyUrl), false);
  assert.equal(matchesShortcut(key("KeyC", { meta: true, shift: true, alt: true }), copyUrl), false);
  assert.equal(matchesShortcut(key("KeyV", { meta: true, shift: true }), copyUrl), false);
  assert.equal(matchesShortcut(key("KeyC", { meta: true, shift: true }), ""), false); // disabled
});

test("modifier order in the stored string doesn't matter", () => {
  assert.equal(matchesShortcut(key("KeyC", { meta: true, shift: true }), "Shift+Meta+KeyC"), true);
});

test("formats for macOS and other systems", () => {
  assert.equal(formatShortcut("Meta+Shift+KeyC", true), "⇧⌘C");
  assert.equal(formatShortcut("Meta+KeyT", true), "⌘T");
  assert.equal(formatShortcut("Ctrl+Alt+Digit1", true), "⌃⌥1");
  assert.equal(formatShortcut("Ctrl+Shift+KeyC", false), "Ctrl+Shift+C");
  assert.equal(formatShortcut("Meta+Slash", true), "⌘/");
  assert.equal(formatShortcut("", true), "");
});

test("requires Cmd, Ctrl or Alt", () => {
  assert.equal(isValidShortcut("Meta+KeyK"), true);
  assert.equal(isValidShortcut("Alt+KeyK"), true);
  assert.equal(isValidShortcut("Shift+KeyK"), false);
  assert.equal(isValidShortcut("KeyK"), false);
  assert.equal(isValidShortcut(""), false);
});
