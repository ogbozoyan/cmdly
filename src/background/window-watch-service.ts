import { kv, log } from "../shared/log.ts";

/**
 * Diagnostics only: records every change of a window's state (normal, maximized, fullscreen…),
 * window focus and tab activation, so the log shows what Chrome did right after each Cmdly action
 * (e.g. "window left fullscreen 40 ms after open-bar").
 */

const states = new Map<number, string>();

export function watchWindows(): void {
  chrome.windows.getAll().then((windows) => {
    for (const w of windows) if (w.id !== undefined) states.set(w.id, w.state ?? "?");
    log.debug("window", `windows at start ${kv({ count: windows.length, states: [...states.values()].join(",") })}`);
  }, () => {});
  // There is no "state changed" event; entering or leaving fullscreen changes the bounds.
  chrome.windows.onBoundsChanged.addListener((w) => noteState(w.id!, w.state));
  chrome.windows.onCreated.addListener((w) => {
    states.set(w.id!, w.state ?? "?");
    log.debug("window", `created ${kv({ win: w.id, state: w.state, type: w.type, incognito: w.incognito })}`);
  });
  chrome.windows.onRemoved.addListener((id) => {
    states.delete(id);
    log.debug("window", `removed ${kv({ win: id })}`);
  });
  chrome.windows.onFocusChanged.addListener((id) => {
    log.debug("window", `focus ${kv({ win: id === chrome.windows.WINDOW_ID_NONE ? "none" : id })}`);
  });
  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    log.debug("tab", `activated ${kv({ tab: tabId, win: windowId })}`);
  });
  chrome.tabs.onCreated.addListener((tab) => {
    log.debug("tab", `created ${kv({ tab: tab.id, win: tab.windowId, active: tab.active })}`);
  });
  chrome.tabs.onRemoved.addListener((tabId, info) => {
    log.debug("tab", `removed ${kv({ tab: tabId, win: info.windowId, windowClosing: info.isWindowClosing })}`);
  });
}

function noteState(windowId: number, state: string | undefined): void {
  const next = state ?? "?";
  const prev = states.get(windowId);
  if (prev === next) return;
  states.set(windowId, next);
  // Info, not debug: a window leaving fullscreen is exactly what a bug report needs, even without the trace.
  log.info("window", `state ${kv({ win: windowId, from: prev ?? "?", to: next })}`);
}

/** The current state of a window, for log lines ("fullscreen", "normal"…). */
export function windowState(windowId: number | undefined): string {
  return windowId === undefined ? "?" : (states.get(windowId) ?? "?");
}
