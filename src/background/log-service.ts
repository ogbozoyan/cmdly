import { DEFAULT_LOG_KB, kv, LIVE_VIEW_KB, log, LogRing, setLogSink, shouldRecord, LOG_TAIL_PORT, type LogEntry, type LogTailMessage } from "../shared/log.ts";
import { catchUncaught } from "../shared/log-runtime.ts";
import { mergeSettings } from "../shared/settings.ts";

const KEY = "log";
const STARTED_KEY = "sw-started";
/** Detailed logging writes a lot: entries are batched instead of rewriting storage on every line. */
const FLUSH_MS = 250;

/**
 * The log buffer. chrome.storage.session: survives the service worker restarting, is wiped when the
 * browser closes, and never leaves the machine. Entries live in a size-limited ring in memory and are
 * flushed every FLUSH_MS; a worker stopped by Chrome in between loses at most that much.
 * Open Settings → Diagnostics pages get every entry live through a port (LOG_TAIL_PORT).
 */
let ring: LogRing | null = null;
let loading: Promise<LogRing> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let config = { maxBytes: DEFAULT_LOG_KB * 1024, verbose: true };
/** Live viewers; a closed page disconnects its port and is forgotten (no leak). */
const tails = new Set<chrome.runtime.Port>();

function load(): Promise<LogRing> {
  loading ??= chrome.storage.session
    .get(KEY)
    .then((stored) => (ring ??= new LogRing(config.maxBytes, (stored[KEY] as LogEntry[] | undefined) ?? [])))
    .catch(() => (ring ??= new LogRing(config.maxBytes)));
  return loading;
}

function scheduleFlush(): void {
  if (flushTimer) return; // one write per FLUSH_MS, however many entries arrive
  flushTimer = setTimeout(flush, FLUSH_MS);
}

async function flush(): Promise<void> {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  if (!ring) return;
  try {
    await chrome.storage.session.set({ [KEY]: ring.toArray() });
  } catch {
    // the log must never break anything; the entries stay in memory
  }
}

function broadcast(message: LogTailMessage): void {
  for (const port of tails) {
    try {
      port.postMessage(message);
    } catch {
      tails.delete(port);
    }
  }
}

export function recordLog(entry: LogEntry): void {
  if (!shouldRecord(entry.level, config.verbose)) return;
  load().then((r) => {
    r.push(entry);
    scheduleFlush();
    if (tails.size) broadcast({ type: "entry", entry });
  });
}

export async function readLog(): Promise<LogEntry[]> {
  const r = await load();
  await flush();
  return r.toArray();
}

export async function clearLog(): Promise<void> {
  (await load()).clear();
  await flush();
  broadcast({ type: "cleared" });
}

function watchTails(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== LOG_TAIL_PORT) return;
    tails.add(port);
    port.onDisconnect.addListener(() => tails.delete(port));
    // Only what the view can show: the full buffer may be megabytes.
    load().then((r) => {
      const entries = new LogRing(LIVE_VIEW_KB * 1024, r.toArray()).toArray();
      port.postMessage({ type: "snapshot", entries } satisfies LogTailMessage);
    });
  });
}

/** Called once from the service worker entry point. */
export function startLogging(): void {
  setLogSink(recordLog);
  catchUncaught("background");
  watchConfig();
  watchTails();
  announceStart();
}

/** Size and detail follow Settings → Diagnostics, read from storage directly so the log works before anything else. */
function watchConfig(): void {
  const apply = (saved: unknown) => {
    const { logs } = mergeSettings(saved);
    config = { maxBytes: logs.maxKb * 1024, verbose: logs.verbose };
    if (ring?.resize(config.maxBytes)) scheduleFlush();
  };
  chrome.storage.sync.get("settings").then((s) => apply(s.settings), () => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) apply(changes.settings.newValue);
  });
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
    const { logs } = mergeSettings((await chrome.storage.sync.get("settings")).settings);
    log.info("background", `log ${kv({ maxKb: logs.maxKb, detailed: logs.verbose })}`);
  } catch (error) {
    log.info("background", `service worker started (${version})`, error);
  }
}
