import { appendEntry, log, setLogSink, type LogEntry } from "../shared/log.ts";
import { catchUncaught } from "../shared/log-runtime.ts";

const KEY = "log";

/**
 * The log buffer. chrome.storage.session: survives the service worker restarting, is wiped when the
 * browser closes, and never leaves the machine. Writes are chained so entries don't overwrite each other.
 */
let queue: Promise<void> = Promise.resolve();

export function recordLog(entry: LogEntry): void {
  queue = queue
    .then(async () => {
      const stored = (await chrome.storage.session.get(KEY))[KEY] as LogEntry[] | undefined;
      await chrome.storage.session.set({ [KEY]: appendEntry(stored ?? [], entry) });
    })
    .catch(() => {});
}

export async function readLog(): Promise<LogEntry[]> {
  await queue;
  return ((await chrome.storage.session.get(KEY))[KEY] as LogEntry[] | undefined) ?? [];
}

export async function clearLog(): Promise<void> {
  await queue;
  await chrome.storage.session.remove(KEY);
}

/** Called once from the service worker entry point. */
export function startLogging(): void {
  setLogSink(recordLog);
  catchUncaught("background");
  log.info("background", `service worker started (${chrome.runtime.getManifest().version})`);
}
