/**
 * Diagnostics log. Pure: no chrome.*, unit-tested in Node. The runtime wiring is in log-runtime.ts.
 *
 * Rules (the log can end up in a public GitHub issue — see PRIVACY.md):
 *  - log what failed and where (scope, message, stack), never what the user typed, pasted or visited;
 *  - warn/error go to the console and the buffer, info/debug only to the buffer;
 *  - debug is the trace (entering a service, which branch was taken, ids and states): kept only when
 *    Settings → Diagnostics → "Detailed log" is on. Pass facts as kv({...}): ids, counts, states — no text.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  /** Epoch ms. */
  at: number;
  level: LogLevel;
  /** Where it happened: "background", "overlay", "content", "palette", "options", or a service name. */
  scope: string;
  message: string;
  /** Stack trace or the error's own text, when there is one. */
  detail?: string;
}

/** Default size of the stored buffer (Settings.logs.maxKb). */
export const DEFAULT_LOG_KB = 1024;
/** The live view in Settings → Diagnostics keeps this much on screen; older lines are removed from the page. */
export const LIVE_VIEW_KB = 16;

type Sink = (entry: LogEntry) => void;
let sink: Sink | null = null;

/** Name of the port Settings → Diagnostics opens to follow the log live. */
export const LOG_TAIL_PORT = "log-tail";

/** What the background sends down that port: the buffer once, then every new entry. */
export type LogTailMessage =
  | { type: "snapshot"; entries: LogEntry[] }
  | { type: "entry"; entry: LogEntry }
  | { type: "cleared" };

/** Where entries go besides the console: the background's buffer (directly or via a message). */
export function setLogSink(next: Sink | null): void {
  sink = next;
}

/** Turns anything thrown into text. Messages from Chrome's own errors are kept as they are. */
export function describeError(error: unknown): string | undefined {
  if (error == null) return undefined;
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function write(level: LogLevel, scope: string, message: string, error?: unknown): void {
  const entry: LogEntry = { at: Date.now(), level, scope, message, detail: describeError(error) };
  if (level === "warn" || level === "error") {
    const out = level === "warn" ? console.warn : console.error;
    out(`[Cmdly:${scope}] ${message}`, ...(error === undefined ? [] : [error]));
  }
  try {
    sink?.(entry);
  } catch {
    // logging must never break the feature that logs
  }
}

export const log = {
  debug: (scope: string, message: string, error?: unknown) => write("debug", scope, message, error),
  info: (scope: string, message: string, error?: unknown) => write("info", scope, message, error),
  warn: (scope: string, message: string, error?: unknown) => write("warn", scope, message, error),
  error: (scope: string, message: string, error?: unknown) => write("error", scope, message, error),
};

/** Rough size of an entry as stored (JSON), in bytes. */
export function entrySize(e: LogEntry): number {
  return 48 + e.scope.length + e.message.length + (e.detail?.length ?? 0);
}

/**
 * Entries limited by size, oldest dropped first. The running total keeps a push O(1) amortized,
 * so a detailed log (dozens of lines per keystroke) costs nothing noticeable.
 */
export class LogRing {
  private items: LogEntry[] = [];
  private head = 0;
  private bytes = 0;
  private maxBytes: number;

  constructor(maxBytes: number, entries: LogEntry[] = []) {
    this.maxBytes = maxBytes;
    for (const e of entries) this.push(e);
  }

  /** Adds an entry; returns how many of the oldest were dropped (the live view removes as many lines). */
  push(entry: LogEntry): number {
    this.items.push(entry);
    this.bytes += entrySize(entry);
    return this.trim();
  }

  resize(maxBytes: number): number {
    this.maxBytes = maxBytes;
    return this.trim();
  }

  clear(): void {
    this.items = [];
    this.head = 0;
    this.bytes = 0;
  }

  get size(): number {
    return this.bytes;
  }

  toArray(): LogEntry[] {
    return this.items.slice(this.head);
  }

  private trim(): number {
    let dropped = 0;
    // Always keep the newest entry, even if it alone is over the limit.
    while (this.bytes > this.maxBytes && this.items.length - this.head > 1) {
      this.bytes -= entrySize(this.items[this.head++]);
      dropped++;
    }
    // Compact now and then instead of shifting on every drop.
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return dropped;
  }
}

export function shouldRecord(level: LogLevel, verbose: boolean): boolean {
  return verbose || level !== "debug";
}

/** Facts for a log line: `kv({ tab: 12, state: "fullscreen" })` → "tab=12 state=fullscreen". */
export function kv(fields: Record<string, string | number | boolean | null | undefined>): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === "string" && /\s/.test(v) ? JSON.stringify(v) : v}`)
    .join(" ");
}

export function logFileName(now: number): string {
  const iso = new Date(now).toISOString(); // 2026-10-27T18:03:05.000Z
  return `cmdly-log-${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, "")}.txt`;
}

/** Plain text for pasting into an issue: environment line first, then one line per entry. */
export function formatReport(environment: string, entries: LogEntry[]): string {
  return [environment, `${entries.length} log entries`, "", ...entries.map(formatEntry)].join("\n");
}

/** One entry as text: time, level, scope, message, and the stack indented under it. */
export function formatEntry(e: LogEntry): string {
  const time = new Date(e.at).toISOString().slice(11, 23);
  const head = `${time} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.message}`;
  return e.detail ? `${head}\n${e.detail.replace(/^/gm, "    ")}` : head;
}

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

export function atLeast(level: LogLevel, min: LogLevel): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(min);
}
