import { log, setLogSink, type LogEntry } from "./log.ts";
import { send } from "./messages.ts";

/**
 * Connects the logger of one context (overlay, content script, extension page) to the background's
 * buffer and reports errors nobody caught — otherwise they show up only as a bare line in the page console.
 * The background has its own wiring (background/log-service.ts).
 */
export function initLogging(scope: string): void {
  setLogSink((entry: LogEntry) => {
    send({ type: "log", entry });
  });
  catchUncaught(scope);
}

/** Uncaught errors and rejected promises of the current context. */
export function catchUncaught(scope: string): void {
  const target = globalThis as unknown as EventTarget;
  target.addEventListener("error", (e) => {
    const event = e as ErrorEvent;
    // Content scripts may see errors of the page's own scripts (http/file URLs): not ours.
    if (/^(https?|file):/.test(event.filename)) return;
    log.error(scope, `uncaught: ${event.message}`, event.error ?? `${event.filename}:${event.lineno}:${event.colno}`);
  });
  target.addEventListener("unhandledrejection", (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    if (reason instanceof Error && /(https?|file):\/\//.test(reason.stack ?? "") && !reason.stack!.includes("chrome-extension://")) return;
    log.error(scope, "unhandled promise rejection", reason);
  });
}
