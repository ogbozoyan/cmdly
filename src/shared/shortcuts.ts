import { IS_MAC } from "./platform.ts";

/**
 * Keyboard shortcut stored as a string: modifiers + KeyboardEvent.code, e.g. "Meta+Shift+KeyC".
 * `code` is the physical key, so shortcuts work on any keyboard layout (Russian included).
 */
export type Shortcut = string;

type Modifier = "Ctrl" | "Alt" | "Shift" | "Meta";

const MODIFIERS: Modifier[] = ["Ctrl", "Alt", "Shift", "Meta"];
const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;
const KEY_NAMES: Record<string, string> = {
  Space: "Space", Enter: "↵", Escape: "Esc", Backspace: "⌫", Tab: "⇥",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Slash: "/", Backslash: "\\", Period: ".", Comma: ",", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`",
};

interface KeyEventLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Builds a Shortcut from a key press. Returns null while only modifiers are held. */
export function shortcutFromEvent(e: KeyEventLike): Shortcut | null {
  if (!e.code || MODIFIER_CODES.test(e.code)) return null;
  const mods = MODIFIERS.filter((m) => pressed(e, m));
  return [...mods, e.code].join("+");
}

export function matchesShortcut(e: KeyEventLike, shortcut: Shortcut): boolean {
  const parsed = parse(shortcut);
  if (!parsed || e.code !== parsed.code) return false;
  return MODIFIERS.every((m) => parsed.mods.has(m) === pressed(e, m));
}

/** Human-readable form: "⌘⇧C" on macOS, "Ctrl+Shift+C" elsewhere. */
export function formatShortcut(shortcut: Shortcut, isMac = IS_MAC): string {
  const parsed = parse(shortcut);
  if (!parsed) return "";
  const symbols: Record<Modifier, string> = isMac
    ? { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" }
    : { Ctrl: "Ctrl+", Alt: "Alt+", Shift: "Shift+", Meta: "Win+" };
  const key = KEY_NAMES[parsed.code] ?? parsed.code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
  return MODIFIERS.filter((m) => parsed.mods.has(m)).map((m) => symbols[m]).join("") + key;
}

/** A shortcut needs Ctrl, Alt or Cmd — otherwise it would fire while typing. */
export function isValidShortcut(shortcut: Shortcut): boolean {
  const parsed = parse(shortcut);
  return !!parsed && (parsed.mods.has("Ctrl") || parsed.mods.has("Alt") || parsed.mods.has("Meta"));
}

function parse(shortcut: Shortcut): { code: string; mods: Set<string> } | null {
  if (!shortcut) return null;
  const parts = shortcut.split("+");
  const code = parts.pop()!;
  return { code, mods: new Set(parts) };
}

function pressed(e: KeyEventLike, m: Modifier): boolean {
  return { Ctrl: e.ctrlKey, Alt: e.altKey, Shift: e.shiftKey, Meta: e.metaKey }[m];
}
