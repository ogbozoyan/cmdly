/** Names of the monochrome icons drawn by the UI (see src/ui/icons.ts). */
export type GlyphName =
  | "link" | "close" | "duplicate" | "pin" | "sound" | "reload" | "window" | "restore" | "star"
  | "incognito" | "history" | "download" | "puzzle" | "gear" | "calc" | "trash" | "key" | "code";

/** Where a result row came from — decides what happens on Enter. */
export type ResultKind =
  | "search" // web search with the default search engine
  | "url" // typed address
  | "tab" // open tab → switch to it
  | "bookmark"
  | "history"
  | "command" // browser action, executed by the background
  | "calc" // calculator result → copy
  | "tool"; // dev tool output (UUID, Base64, JWT…) → copy

/** One row in the command bar. */
export interface ResultItem {
  kind: ResultKind;
  title: string;
  /** Secondary grey text after the title. */
  meta?: string;
  /** Label on the right side: "Switch to Tab", "Copy", "Run"… */
  action?: string;
  /** Favicon URL for pages. */
  icon?: string;
  /** Built-in icon for commands and tools. */
  glyph?: GlyphName;
  url?: string;
  tabId?: number;
  windowId?: number;
  commandId?: string;
  /** If set, Enter copies this text instead of navigating. */
  copy?: string;
}

/** What the background asks the UI to do after a command. */
export interface CommandResult {
  copy?: string;
  toast?: string;
  /** Standalone palette page must close itself (the overlay always closes). */
  closePalette?: boolean;
}
