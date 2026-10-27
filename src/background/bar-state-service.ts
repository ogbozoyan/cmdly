import type { Draft } from "../shared/model.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { hasOverlay, showOverlay } from "./bar-service.ts";

/**
 * Keeps the command bar alive across interruptions, like Arc:
 *  - the typed text (draft) survives closing the bar, a crash or a reload, until something is run;
 *  - a bar that was open when its page reloaded opens again on the reloaded page.
 * Stored in chrome.storage.session: in memory only, survives service worker restarts,
 * gone when the browser quits.
 */

const DRAFT_KEY = "draft";
const OPEN_KEY = "openBars"; // tabId → page URL the overlay was open on
/** An old half-typed query is noise, not context. */
const DRAFT_TTL_MS = 10 * 60 * 1000;

export async function saveDraft(draft: Draft | null): Promise<void> {
  if (!draft?.text.trim()) await chrome.storage.session.remove(DRAFT_KEY);
  else await chrome.storage.session.set({ [DRAFT_KEY]: { ...draft, at: Date.now() } });
}

export async function loadDraft(): Promise<Draft | null> {
  const saved = (await chrome.storage.session.get(DRAFT_KEY))[DRAFT_KEY] as (Draft & { at: number }) | undefined;
  if (!saved || Date.now() - saved.at > DRAFT_TTL_MS) return null;
  return { text: saved.text, pasted: saved.pasted };
}

async function openBars(): Promise<Record<string, string>> {
  return ((await chrome.storage.session.get(OPEN_KEY))[OPEN_KEY] as Record<string, string> | undefined) ?? {};
}

/** The overlay reports itself; a page that unloads never says "closed", so the mark survives a reload. */
export async function markOverlay(tab: chrome.tabs.Tab, open: boolean): Promise<void> {
  if (!tab.id) return;
  const bars = await openBars();
  if (open && tab.url) bars[tab.id] = tab.url;
  else delete bars[tab.id];
  await chrome.storage.session.set({ [OPEN_KEY]: bars });
}

export function watchBarState(): void {
  chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
    if (change.status !== "complete") return;
    if (!(await settingsRepository.get()).bar.reopenAfterReload) return;
    const bars = await openBars();
    const url = bars[tabId];
    if (!url) return;
    // A frame inside the page (the HTML preview) also flips the tab to loading → complete.
    // The bar is still there then, and showing it again would toggle it off.
    if (await hasOverlay(tabId).catch(() => false)) return;
    delete bars[tabId];
    await chrome.storage.session.set({ [OPEN_KEY]: bars });
    // Same address = reload: bring the bar back. Another address = the user went somewhere else.
    if (tab.url === url) showOverlay(tabId).catch(() => {});
  });
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const bars = await openBars();
    if (!(tabId in bars)) return;
    delete bars[tabId];
    await chrome.storage.session.set({ [OPEN_KEY]: bars });
  });
}
