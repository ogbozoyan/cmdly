import { MOD } from "../shared/platform.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { canInjectInto, PALETTE_URL, previousTab } from "./tab-service.ts";
import { kv, log } from "../shared/log.ts";
import { windowState } from "./window-watch-service.ts";

/**
 * Opening and closing the command bar.
 *
 * Two display modes:
 *  - overlay: injected into the current web page (dist/overlay.js), the page stays visible;
 *  - palette page: a standalone tab (palette.html) — used where Chrome forbids scripts (chrome:// pages).
 *
 * Two ways ⌘T reaches us:
 *  - native: the user assigned ⌘T to the "open-bar" command at chrome://extensions/shortcuts.
 *    Chrome then calls chrome.commands.onCommand instead of opening a tab — no flash at all.
 *    (Chrome rejects ⌘T as a manifest default, so only the user can assign it.)
 *  - fallback: Chrome opens our new tab page (newtab.html); we close it and show the overlay
 *    on the previous page. Works without setup, but the new tab flashes for a moment.
 */

/** The shortcut assigned to the "open-bar" command in Chrome, or "" if none. */
export async function nativeOpenBarShortcut(): Promise<string> {
  const commands = await chrome.commands.getAll();
  return commands.find((c) => c.name === "open-bar")?.shortcut ?? "";
}

export async function showOverlay(tabId: number): Promise<void> {
  log.debug("bar", `inject overlay ${kv({ tab: tabId })}`);
  await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] });
}

/** True while the bar is drawn on the page (running overlay.js again would toggle it off). */
export async function hasOverlay(tabId: number): Promise<boolean> {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!document.getElementById("cmdly-overlay") });
  return !!result?.result;
}

async function openPalettePage(index: number, windowId: number): Promise<void> {
  log.debug("bar", `open palette page ${kv({ win: windowId, index, state: windowState(windowId) })}`);
  await chrome.tabs.create({ url: PALETTE_URL, index, windowId, active: true });
}

/** Toolbar button, chrome://extensions/shortcuts command, or a custom shortcut from the content script. */
export async function openBar(tab: chrome.tabs.Tab | undefined): Promise<void> {
  if (!tab?.id) return log.debug("bar", "open-bar without a tab: ignored");
  log.debug("bar", `open-bar ${kv({ tab: tab.id, win: tab.windowId, state: windowState(tab.windowId), injectable: canInjectInto(tab) })}`);
  // chrome://, the Web Store and our own pages (options) never accept scripts: go straight to the palette.
  if (!canInjectInto(tab)) return openPalettePage(tab.index + 1, tab.windowId);
  try {
    await showOverlay(tab.id);
  } catch (error) {
    log.info("bar", "overlay refused, opening the palette page", error);
    await openPalettePage(tab.index + 1, tab.windowId);
  }
}

/**
 * Our new tab page was opened.
 *  - ⌘T is handled natively → this tab came from the "+" button or the menu: show the bar
 *    right in this new tab, like Arc does for "New Tab".
 *  - otherwise this is the ⌘T fallback: close the tab and show the overlay on the previous page.
 */
export async function handleNewTab(newTab: chrome.tabs.Tab): Promise<void> {
  const { features, shortcuts } = await settingsRepository.get();
  const cmdTIsOurs = shortcuts.openBar === `${MOD}+KeyT`;
  const nativeShortcut = await nativeOpenBarShortcut();
  const prev = await previousTab(newTab);
  log.debug("bar", `new tab page ${kv({
    tab: newTab.id, win: newTab.windowId, state: windowState(newTab.windowId), native: !!nativeShortcut,
    overlay: features.overlay, cmdTIsOurs, prev: prev?.id, prevInjectable: canInjectInto(prev),
  })}`);

  if (!nativeShortcut && features.overlay && cmdTIsOurs && prev?.id && canInjectInto(prev)) {
    try {
      log.debug("bar", `⌘T fallback: back to the previous tab, overlay there ${kv({ prev: prev.id })}`);
      await chrome.tabs.update(prev.id, { active: true });
      await showOverlay(prev.id);
      if (newTab.id) await chrome.tabs.remove(newTab.id);
      return;
    } catch (error) {
      log.info("bar", "overlay refused on the previous tab, falling back to the palette page", error);
      // Page refused the script (e.g. Web Store) — fall through to the palette page.
    }
  }

  // Re-creating the tab (instead of navigating) puts focus into the page, not the address bar.
  log.debug("bar", `new tab → palette page ${kv({ reason: nativeShortcut ? "plus-button" : "no-overlay-possible" })}`);
  await openPalettePage(newTab.index, newTab.windowId);
  if (newTab.id) await chrome.tabs.remove(newTab.id);
}

/**
 * Esc on the palette page: go back to the previous tab and close the palette.
 * If the palette is the window's only real tab it stays — closing it would close the window.
 */
export async function dismissPalettePage(paletteTab: chrome.tabs.Tab): Promise<void> {
  const prev = await previousTab(paletteTab);
  log.debug("bar", `dismiss palette ${kv({ tab: paletteTab.id, prev: prev?.id })}`);
  if (!prev?.id) return;
  await chrome.tabs.update(prev.id, { active: true });
  if (paletteTab.id) await chrome.tabs.remove(paletteTab.id);
}

export async function openPalettePageIn(windowId: number): Promise<void> {
  await chrome.tabs.create({ url: PALETTE_URL, windowId, active: true });
}
