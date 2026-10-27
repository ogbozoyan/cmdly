/**
 * Diagnostics log. Pure: no chrome.*, unit-tested in Node. The runtime wiring is in log-runtime.ts.
 *
 * Rules (the log can end up in a public GitHub issue — see PRIVACY.md):
 *  - log what failed and where (scope, message, stack), never what the user typed, pasted or visited;
 *  - warn/error go to the console and the buffer, info/debug only to the buffer.
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

export const MAX_ENTRIES = 300;

type Sink = (entry: LogEntry) => void;
let sink: Sink | null = null;

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

/** Appends keeping only the newest MAX_ENTRIES. */
export function appendEntry(entries: LogEntry[], entry: LogEntry): LogEntry[] {
  const next = [...entries, entry];
  return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
}

/** Plain text for pasting into an issue: environment line first, then one line per entry. */
export function formatReport(environment: string, entries: LogEntry[]): string {
  const lines = entries.map((e) => {
    const time = new Date(e.at).toISOString().slice(11, 23);
    const head = `${time} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.message}`;
    return e.detail ? `${head}\n${e.detail.replace(/^/gm, "    ")}` : head;
  });
  return [environment, `${entries.length} log entries`, "", ...lines].join("\n");
}
