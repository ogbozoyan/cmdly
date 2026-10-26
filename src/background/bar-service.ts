import { MOD } from "../shared/platform.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { canInjectInto, PALETTE_URL, previousTab } from "./tab-service.ts";

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
  await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] });
}

/** True while the bar is drawn on the page (running overlay.js again would toggle it off). */
export async function hasOverlay(tabId: number): Promise<boolean> {
  const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!document.getElementById("cmdly-overlay") });
  return !!result?.result;
}

async function openPalettePage(index: number, windowId: number): Promise<void> {
  await chrome.tabs.create({ url: PALETTE_URL, index, windowId, active: true });
}

/** Toolbar button, chrome://extensions/shortcuts command, or a custom shortcut from the content script. */
export async function openBar(tab: chrome.tabs.Tab | undefined): Promise<void> {
  if (!tab?.id) return;
  try {
    await showOverlay(tab.id);
  } catch {
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

  if (!nativeShortcut && features.overlay && cmdTIsOurs && prev?.id && canInjectInto(prev)) {
    try {
      await chrome.tabs.update(prev.id, { active: true });
      await showOverlay(prev.id);
      if (newTab.id) await chrome.tabs.remove(newTab.id);
      return;
    } catch {
      // Page refused the script (e.g. Web Store) — fall through to the palette page.
    }
  }

  // Re-creating the tab (instead of navigating) puts focus into the page, not the address bar.
  await openPalettePage(newTab.index, newTab.windowId);
  if (newTab.id) await chrome.tabs.remove(newTab.id);
}

/**
 * Esc on the palette page: go back to the previous tab and close the palette.
 * If the palette is the window's only real tab it stays — closing it would close the window.
 */
export async function dismissPalettePage(paletteTab: chrome.tabs.Tab): Promise<void> {
  const prev = await previousTab(paletteTab);
  if (!prev?.id) return;
  await chrome.tabs.update(prev.id, { active: true });
  if (paletteTab.id) await chrome.tabs.remove(paletteTab.id);
}

export async function openPalettePageIn(windowId: number): Promise<void> {
  await chrome.tabs.create({ url: PALETTE_URL, windowId, active: true });
}
