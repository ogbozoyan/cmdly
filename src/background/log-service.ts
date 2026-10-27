import { appendEntry, log, setLogSink, type LogEntry } from "../shared/log.ts";
import { catchUncaught } from "../shared/log-runtime.ts";

const KEY = "log";
const STARTED_KEY = "sw-started";

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
  announceStart();
}

/**
 * Chrome stops an idle service worker after ~30 s and starts it again on the next event, which looks like
 * a crash loop in the log. Session storage outlives those restarts but not the browser or an extension reload.
 */
async function announceStart(): Promise<void> {
  const version = chrome.runtime.getManifest().version;
  try {
    const woke = !!(await chrome.storage.session.get(STARTED_KEY))[STARTED_KEY];
    await chrome.storage.session.set({ [STARTED_KEY]: true });
    log.info("background", `service worker started (${version}, ${woke ? "woke up after idle" : "fresh start: browser launch or extension reload"})`);
  } catch (error) {
    log.info("background", `service worker started (${version})`, error);
  }
}
