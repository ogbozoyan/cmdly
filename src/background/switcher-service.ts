import { settingsRepository } from "../shared/settings-repository.ts";
import { neighbourDirection, recentFirst, thumbnailSize, type SwitcherMessage, type SwitcherTab } from "../shared/switcher.ts";
import { favicon } from "./search-service.ts";
import { canInjectInto, isGuardTab, previousTab } from "./tab-service.ts";
import { kv, log } from "../shared/log.ts";

/**
 * Tab switcher (Arc's Ctrl+Tab). Chrome reserves Ctrl+Tab for itself — pages and extensions never
 * see it — so the switcher is the "tab-switcher" command the user can bind at chrome://extensions/shortcuts.
 *
 * The switcher UI lives in the always-on content script: every press is one "switcher-show" message
 * (the first opens it, the next ones move the selection). Releasing the modifier switches
 * (see content/switcher.ts). Nothing on the hot path waits for a screenshot.
 *
 * Chrome's own Ctrl+Tab (Settings.switcher.ctrlTab): content scripts report when Ctrl goes down
 * and up. If the tab with Ctrl down is replaced by its neighbour, that was Ctrl+Tab (or
 * Ctrl+Shift+Tab): we switch back and show the switcher instead. The neighbour flashes for a moment —
 * extensions can't stop Chrome's switch, only undo it.
 *
 * Previews: a screenshot of the visible tab is taken a moment after a tab is shown, downscaled and
 * kept in memory (`thumbs`) plus chrome.storage.session for service worker restarts — memory only,
 * never synced or sent anywhere. Off with Settings.switcher.thumbnails; never in incognito.
 */

const THUMB_PREFIX = "thumb:";
/** Wait for the page to settle after switching before taking its picture. */
const CAPTURE_DELAY_MS = 600;

const timers = new Map<number, ReturnType<typeof setTimeout>>();
/** Previews by tab id; filled from chrome.storage.session after a service worker restart. */
const thumbs = new Map<number, string>();
let thumbsLoaded: Promise<void> | null = null;
/** Tabs showing the switcher right now — never captured, or the switcher ends up in the preview. */
const switcherOpenIn = new Set<number>();

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
  await tell(tabId, { type: "switcher-release" });
}

/** Sends to the top frame's content script; injects it first if the page predates the extension. */
async function tell(tabId: number, message: SwitcherMessage): Promise<boolean> {
  const sendIt = () => chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).then(() => true);
  try {
    return await sendIt();
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      return await sendIt();
    } catch (error) {
      log.warn("switcher", "content script unreachable", error);
      return false;
    }
  }
}

export function setSwitcherState(sender: chrome.tabs.Tab, open: boolean): void {
  if (!sender.id) return;
  if (open) switcherOpenIn.add(sender.id);
  else {
    switcherOpenIn.delete(sender.id);
    // Like after any switch: refresh the preview of whatever is on screen now.
    if (sender.active) schedule(sender.id);
  }
}

async function onTabActivated({ tabId, windowId }: { tabId: number; windowId: number }): Promise<void> {
  const from = ctrlTab;
  if (from === null || from === tabId) return;
  // One round of parallel lookups: every extra await here is time the neighbour tab stays on screen.
  const [settings, a, b, all] = await Promise.all([
    settingsRepository.get(),
    chrome.tabs.get(from).catch(() => null),
    chrome.tabs.get(tabId).catch(() => null),
    chrome.tabs.query({ windowId }),
  ]);
  if (!settings.switcher.ctrlTab || !a || !b || a.windowId !== windowId || !canInjectInto(a)) return;
  const count = all.length;
  const direction = neighbourDirection(a.index, b.index, count);
  if (!direction) return;
  log.debug("switcher", `Ctrl+Tab taken back ${kv({ from, to: tabId, direction })}`);

  await chrome.tabs.update(from, { active: true });
  hijackedIn = from;
  snapshotTab = from;
  if (!(await tell(from, { type: "switcher-show", delta: direction }))) {
    hijackedIn = null;
    return;
  }
  // A quick tap: Ctrl was already released while we were bringing the tab back.
  if (ctrlTab !== from && hijackedIn === from) {
    hijackedIn = null;
    await releaseSwitcher(from);
  }
}

/** `delta` -1 is the "back" command (Ctrl+Shift+Q): starts from the oldest tab, or steps back if already open. */
export async function openSwitcher(tab: chrome.tabs.Tab | undefined, delta: 1 | -1 = 1): Promise<void> {
  if (!tab?.id) return;
  log.debug("switcher", `open ${kv({ tab: tab.id, delta, injectable: canInjectInto(tab) })}`);
  // chrome:// pages, the Web Store: no UI possible — behave like a quick tap.
  if (!canInjectInto(tab) || !(await tell(tab.id, { type: "switcher-show", delta }))) return switchToPrevious(tab);
}

/** Is the command bar on the page? Its picture must not become the preview. Null if scripts can't run. */
async function overlayOnPage(tabId: number): Promise<boolean | null> {
  try {
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.getElementById("cmdly-overlay") || !!document.getElementById("cmdly-switcher"),
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
  const snapshot = snapshotTab === sender.id ? accessSnapshot : null;
  const tabs = recentFirst(
    (await chrome.tabs.query({ windowId: sender.windowId }))
      .filter((t) => !isGuardTab(t))
      .map((t) => ({ ...t, lastAccessed: snapshot?.get(t.id!) ?? t.lastAccessed }))
  );
  const { switcher } = await settingsRepository.get();
  if (switcher.thumbnails) await loadThumbs();
  return tabs.map((t) => {
    const url = t.url || t.pendingUrl || "";
    return {
      tabId: t.id!,
      windowId: t.windowId,
      title: t.title || url,
      url,
      icon: favicon(url, t.favIconUrl),
      thumbnail: switcher.thumbnails ? thumbs.get(t.id!) : undefined,
    };
  });
}

export async function switchTab(tabId: number): Promise<void> {
  log.debug("switcher", `switch ${kv({ tab: tabId })}`);
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
    switcherOpenIn.delete(tabId);
    thumbs.delete(tabId);
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

async function stillActive(tabId: number, windowId: number): Promise<boolean> {
  const [active] = await chrome.tabs.query({ active: true, windowId }).catch(() => []);
  return active?.id === tabId && canInjectInto(active);
}

/** Screenshot → downscaled JPEG in `thumbs`. Skipped while Cmdly's own UI covers the page. */
async function captureNow(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || tab.incognito || !canInjectInto(tab) || switcherOpenIn.has(tab.id)) return;
  if (!(await settingsRepository.get()).switcher.thumbnails) return;
  if ((await overlayOnPage(tab.id)) !== false) return;
  const tabId = tab.id;
  // captureVisibleTab shoots whatever is active *now*; the user may have switched during the awaits above,
  // and the shot would be stored under the wrong tab.
  if (!(await stillActive(tabId, tab.windowId))) return;
  let shot: string;
  try {
    shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 85 });
  } catch (error) {
    log.debug("switcher", "screenshot skipped", error);
    return; // window minimized, rate limit (2 per second) or page not capturable
  }
  if (!(await stillActive(tabId, tab.windowId))) return;
  try {
    const thumb = await downscale(shot);
    thumbs.set(tabId, thumb);
    await chrome.storage.session.set({ [THUMB_PREFIX + tabId]: thumb });
  } catch (error) {
    log.warn("switcher", "thumbnail not stored", error);
    // tab closed meanwhile, or session storage full
  }
}

function loadThumbs(): Promise<void> {
  thumbsLoaded ??= chrome.storage.session.get(null).then((all) => {
    for (const [key, value] of Object.entries(all)) {
      const id = Number(key.slice(THUMB_PREFIX.length));
      if (key.startsWith(THUMB_PREFIX) && typeof value === "string" && !thumbs.has(id)) thumbs.set(id, value);
    }
  });
  return thumbsLoaded;
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
  thumbs.clear();
  const keys = Object.keys(await chrome.storage.session.get(null)).filter((k) => k.startsWith(THUMB_PREFIX));
  if (keys.length) await chrome.storage.session.remove(keys);
}
