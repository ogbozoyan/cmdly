import { MOD } from "../shared/platform.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { canInjectInto, PALETTE_URL, previousTab } from "./tab-service.ts";

/**
 * Opening and closing the command bar.
 *
 * Two display modes:
 *  - overlay: injected into the current web page (dist/overlay.js), the page stays visible;
 *  - palette page: a standalone tab (palette.html) — used where Chrome forbids scripts (chrome:// pages).
 */

export async function showOverlay(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] });
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
 * Cmd+T opened our new tab page. Chrome doesn't let extensions intercept Cmd+T directly,
 * so we close that tab and show the overlay on the page the user came from.
 */
export async function handleNewTab(newTab: chrome.tabs.Tab): Promise<void> {
  const { features, shortcuts } = await settingsRepository.get();
  const cmdTIsOurs = shortcuts.openBar === `${MOD}+KeyT`;
  const prev = await previousTab(newTab);

  if (features.overlay && cmdTIsOurs && prev?.id && canInjectInto(prev)) {
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

/** Esc on the palette page: go back to the previous tab and close the palette. */
export async function dismissPalettePage(paletteTab: chrome.tabs.Tab): Promise<void> {
  const prev = await previousTab(paletteTab);
  if (prev?.id) await chrome.tabs.update(prev.id, { active: true });
  if (paletteTab.id) await chrome.tabs.remove(paletteTab.id);
}
