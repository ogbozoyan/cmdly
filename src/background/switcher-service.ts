import { settingsRepository } from "../shared/settings-repository.ts";
import { neighbourDirection, recentFirst, thumbnailSize, type SwitcherTab } from "../shared/switcher.ts";
import { favicon } from "./search-service.ts";
import { canInjectInto, isGuardTab, previousTab } from "./tab-service.ts";

/**
 * Tab switcher (Arc's Ctrl+Tab). Chrome reserves Ctrl+Tab for itself — pages and extensions never
 * see it — so the switcher is the "tab-switcher" command the user can bind at chrome://extensions/shortcuts.
 *
 * The first press injects dist/switcher.js into the current page; every next press while it is open
 * injects it again, which moves the selection. Releasing the modifier switches (see content/switcher.ts).
 *
 * Chrome's own Ctrl+Tab (Settings.switcher.ctrlTab): content scripts report when Ctrl goes down
 * and up. If the tab with Ctrl down is replaced by its neighbour, that was Ctrl+Tab (or
 * Ctrl+Shift+Tab): we switch back and show the switcher instead. The neighbour flashes for a moment —
 * extensions can't stop Chrome's switch, only undo it.
 *
 * Previews: a screenshot of the visible tab is taken a moment after a tab is shown, downscaled
 * and kept in chrome.storage.session (memory only, never synced or sent anywhere). Off with
 * Settings.switcher.thumbnails; incognito tabs are never captured.
 */

const THUMB_PREFIX = "thumb:";
/** Wait for the page to settle after switching before taking its picture. */
const CAPTURE_DELAY_MS = 600;

const timers = new Map<number, ReturnType<typeof setTimeout>>();
/** Captures still being downscaled — the switcher waits for them so the current card is fresh. */
const pending = new Map<number, Promise<void>>();

/** Tab where Ctrl is down right now, as reported by its content script. */
let ctrlTab: number | null = null;
/** lastAccessed of the window's tabs when Ctrl went down — Chrome's brief switch to the neighbour must not count. */
let accessSnapshot: Map<number, number> | null = null;
/** Tab showing a switcher opened by Ctrl+Tab: releasing Ctrl anywhere commits it. */
let hijackedIn: number | null = null;
/** Tab whose switcher must order tabs by `accessSnapshot` (kept after Ctrl is released). */
let snapshotTab: number | null = null;

export async function setCtrlState(sender: chrome.tabs.Tab, held: boolean): Promise<void> {
  if (held) {
    ctrlTab = sender.id ?? null;
    accessSnapshot = null;
    snapshotTab = null;
    const tabs = await chrome.tabs.query({ windowId: sender.windowId });
    if (ctrlTab === sender.id) accessSnapshot = new Map(tabs.map((t) => [t.id!, t.lastAccessed ?? 0]));
    return;
  }
  // Released — possibly seen by the neighbour Chrome switched to, not by the tab that saw it go down.
  ctrlTab = null;
  const tabId = hijackedIn;
  hijackedIn = null;
  if (tabId !== null) await releaseSwitcher(tabId);
}

async function releaseSwitcher(tabId: number): Promise<void> {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        type W = Window & { __cmdlyModifierHeld?: boolean };
        (window as W).__cmdlyModifierHeld = false;
        (document.getElementById("cmdly-switcher") as (HTMLElement & { cmdlyRelease?: () => void }) | null)?.cmdlyRelease?.();
      },
    })
    .catch(() => {});
}

async function onTabActivated({ tabId, windowId }: { tabId: number; windowId: number }): Promise<void> {
  const from = ctrlTab;
  if (from === null || from === tabId) return;
  if (!(await settingsRepository.get()).switcher.ctrlTab) return;
  const [a, b] = await Promise.all([chrome.tabs.get(from).catch(() => null), chrome.tabs.get(tabId).catch(() => null)]);
  if (!a || !b || a.windowId !== windowId || !canInjectInto(a)) return;
  const count = (await chrome.tabs.query({ windowId })).length;
  const direction = neighbourDirection(a.index, b.index, count);
  if (!direction) return;

  await chrome.tabs.update(from, { active: true });
  const ui = await cmdlyUiOnPage(from);
  if (!ui) return;
  hijackedIn = from;
  snapshotTab = from;
  await chrome.scripting.executeScript({
    target: { tabId: from },
    args: [direction],
    func: (delta: number) => {
      type W = Window & { __cmdlyModifierHeld?: boolean; __cmdlySwitcherStart?: number };
      const host = document.getElementById("cmdly-switcher") as (HTMLElement & { cmdlyMove?: (d: number) => void }) | null;
      if (host) return host.cmdlyMove?.(delta);
      (window as W).__cmdlyModifierHeld = true;
      (window as W).__cmdlySwitcherStart = delta;
    },
  });
  if (!ui.switcher) await chrome.scripting.executeScript({ target: { tabId: from }, files: ["switcher.js"] });
  // A quick tap: Ctrl was already released while we were bringing the tab back.
  if (ctrlTab !== from && hijackedIn === from) {
    hijackedIn = null;
    await releaseSwitcher(from);
  }
}

export async function openSwitcher(tab: chrome.tabs.Tab | undefined): Promise<void> {
  if (!tab?.id) return;
  const ui = await cmdlyUiOnPage(tab.id);
  // chrome:// pages, the Web Store: no UI possible — behave like a quick tap.
  if (!ui) return switchToPrevious(tab);
  // A fresh picture of the page we're leaving, unless our own UI covers it.
  if (!ui.switcher && !ui.overlay) await captureNow(tab, false);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["switcher.js"] });
}

/** Which of Cmdly's injected UIs are on the page; null if scripts can't run there. */
async function cmdlyUiOnPage(tabId: number): Promise<{ switcher: boolean; overlay: boolean } | null> {
  try {
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        switcher: !!document.getElementById("cmdly-switcher"),
        overlay: !!document.getElementById("cmdly-overlay"),
      }),
    });
    return frame?.result ?? null;
  } catch {
    return null;
  }
}

async function switchToPrevious(tab: chrome.tabs.Tab): Promise<void> {
  const prev = await previousTab(tab);
  if (prev?.id) await chrome.tabs.update(prev.id, { active: true });
}

/** Cards for the window of `sender`, most recently used first. */
export async function switcherTabs(sender: chrome.tabs.Tab): Promise<SwitcherTab[]> {
  await Promise.all(pending.values());
  const snapshot = snapshotTab === sender.id ? accessSnapshot : null;
  const tabs = recentFirst(
    (await chrome.tabs.query({ windowId: sender.windowId }))
      .filter((t) => !isGuardTab(t))
      .map((t) => ({ ...t, lastAccessed: snapshot?.get(t.id!) ?? t.lastAccessed }))
  );
  const { switcher } = await settingsRepository.get();
  const thumbs: Record<string, string> = switcher.thumbnails
    ? await chrome.storage.session.get(tabs.map((t) => THUMB_PREFIX + t.id))
    : {};
  return tabs.map((t) => {
    const url = t.url || t.pendingUrl || "";
    return {
      tabId: t.id!,
      windowId: t.windowId,
      title: t.title || url,
      url,
      icon: favicon(url, t.favIconUrl),
      thumbnail: thumbs[THUMB_PREFIX + t.id],
    };
  });
}

export async function switchTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (tab) await chrome.windows.update(tab.windowId, { focused: true });
}

// ---------- previews ----------

export function watchTabSwitches(): void {
  chrome.tabs.onActivated.addListener((info) => {
    schedule(info.tabId);
    onTabActivated(info).catch(() => {});
  });
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status === "complete" && tab.active) schedule(tabId);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    clearTimeout(timers.get(tabId));
    timers.delete(tabId);
    chrome.storage.session.remove(THUMB_PREFIX + tabId);
  });
  settingsRepository.onChange((s) => {
    if (!s.switcher.thumbnails) clearThumbnails();
  });
}

function schedule(tabId: number): void {
  clearTimeout(timers.get(tabId));
  timers.set(
    tabId,
    setTimeout(async () => {
      timers.delete(tabId);
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab?.active) await captureNow(tab);
    }, CAPTURE_DELAY_MS)
  );
}

/**
 * Takes the screenshot right away; downscaling continues in the background (see `pending`).
 * `checkPage`: skip if the command bar or the switcher is on screen — it would end up in the preview.
 */
async function captureNow(tab: chrome.tabs.Tab, checkPage = true): Promise<void> {
  if (!tab.id || tab.incognito || !canInjectInto(tab)) return;
  if (!(await settingsRepository.get()).switcher.thumbnails) return;
  if (checkPage) {
    const ui = await cmdlyUiOnPage(tab.id);
    if (!ui || ui.overlay || ui.switcher) return;
  }
  let shot: string;
  try {
    shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 85 });
  } catch {
    return; // window minimized, rate limit (2 per second) or page not capturable
  }
  const tabId = tab.id;
  const job = downscale(shot)
    .then((thumb) => chrome.storage.session.set({ [THUMB_PREFIX + tabId]: thumb }))
    .catch(() => {})
    .finally(() => pending.delete(tabId));
  pending.set(tabId, job);
}

async function downscale(dataUrl: string): Promise<string> {
  const source = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const size = thumbnailSize(source.width, source.height);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size.width, size.height);
  source.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.75 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

async function clearThumbnails(): Promise<void> {
  const keys = Object.keys(await chrome.storage.session.get(null)).filter((k) => k.startsWith(THUMB_PREFIX));
  if (keys.length) await chrome.storage.session.remove(keys);
}
