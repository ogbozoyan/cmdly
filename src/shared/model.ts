/** Names of the monochrome icons drawn by the UI (see src/ui/icons.ts). */
export type GlyphName =
  | "link" | "close" | "duplicate" | "pin" | "sound" | "reload" | "window" | "restore" | "star"
  | "incognito" | "history" | "download" | "puzzle" | "gear" | "calc" | "trash" | "key" | "code" | "braces";

/** Content of the expandable panel under the results (Tab to open). */
export interface Preview {
  /** Decides syntax highlighting; "html" means `content` is a full document shown in a sandboxed iframe. */
  language: "json" | "yaml" | "html";
  /** Panel title instead of the upper-cased language, e.g. "Markdown". */
  label?: string;
  content: string;
  /** Extra lines under the code, e.g. human-readable JWT expiry. */
  notes?: string[];
}

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
  /** Came from the search engine's suggestions (see shared/suggestions.ts). */
  suggestion?: boolean;
  /** If set, the row can be expanded into a viewer panel. */
  preview?: Preview;
  /** If set, Tab switches this row to the next variant and remembers it (e.g. UUID version). */
  variant?: Variant;
}

/** Text typed into the bar and not run yet — restored when the bar opens again. */
export interface Draft {
  text: string;
  /** Original multi-line paste (YAML/JSON) behind a flattened `text`. */
  pasted?: string;
}

/** A remembered choice that Tab cycles through. */
export interface Variant {
  setting: "uuidVersion";
  /** Shown on the row's chip, e.g. "v4". */
  value: string;
  next: "v4" | "v7" | "v1";
}

/** What the background asks the UI to do after a command. */
export interface CommandResult {
  copy?: string;
  toast?: string;
  /** Standalone palette page must close itself (the overlay always closes). */
  closePalette?: boolean;
}
