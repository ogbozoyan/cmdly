/** Tab helpers used by several services. */
import { pageKind } from "../shared/page-kind.ts";
import { kv, log } from "../shared/log.ts";

export const PALETTE_URL = chrome.runtime.getURL("palette.html");

/** The pinned tab that keeps a window open (see keep-open-plan.ts). */
export const GUARD_URL = chrome.runtime.getURL("keep-open.html");

export function isGuardTab(tab: chrome.tabs.Tab): boolean {
  return (tab.url ?? tab.pendingUrl ?? "").startsWith(GUARD_URL);
}

/** The most recently used real tab in the same window, other than `tab` (the guard doesn't count). */
export async function previousTab(tab: chrome.tabs.Tab): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  return tabs
    .filter((t) => t.id !== tab.id && !isGuardTab(t))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
}

/** Pages where Chrome forbids extension scripts (chrome://, Web Store…). */
export function canInjectInto(tab: chrome.tabs.Tab | undefined): boolean {
  if (!tab) return false;
  const kind = pageKind(tab.url ?? "");
  return kind === "web" || kind === "file";
}

/**
 * Reopens the last closed tab or window. Skips the empty new tabs that Cmdly closes itself
 * when Cmd+T turns into the overlay — otherwise "undo" would bring back a blank tab.
 */
export async function restoreClosedTab(): Promise<void> {
  const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
  const entry = sessions.find((s) => s.window || (s.tab && !isCmdlyTab(s.tab)));
  const sessionId = entry?.tab?.sessionId ?? entry?.window?.sessionId;
  log.debug("tabs", `reopen closed ${kv({ recent: sessions.length, found: entry ? (entry.window ? "window" : "tab") : "none" })}`);
  if (sessionId) await chrome.sessions.restore(sessionId);
}

function isCmdlyTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? tab.pendingUrl ?? "";
  return url.startsWith("chrome://newtab") || url.startsWith(chrome.runtime.getURL(""));
}
