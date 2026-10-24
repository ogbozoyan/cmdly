import type { ResultItem } from "../shared/model.ts";
import { looksLikeUrl, toUrl } from "../shared/url.ts";

export interface OpenRequest {
  /** Selected row; absent when Enter is pressed with no results. */
  item?: ResultItem;
  /** Raw input text, used when there is no item. */
  text: string;
  /** Cmd+Enter: open in a background tab. */
  inBackground: boolean;
  overlay: boolean;
}

/**
 * Opens what the user picked.
 *  - tab → switch to it;
 *  - URL / search in overlay mode → new tab next to the current one (the page under the bar stays);
 *  - URL / search on the palette page → navigate the palette tab itself.
 */
export async function open(request: OpenRequest, host: chrome.tabs.Tab): Promise<void> {
  const item = request.item ?? itemFromText(request.text);
  if (!item) return;

  if (item.kind === "tab" && item.tabId) {
    await chrome.windows.update(item.windowId!, { focused: true });
    await chrome.tabs.update(item.tabId, { active: true });
    if (!request.overlay) await chrome.tabs.remove(host.id!);
    return;
  }

  let targetTabId = host.id!;
  if (request.overlay || request.inBackground) {
    const tab = await chrome.tabs.create({ index: host.index + 1, active: !request.inBackground, windowId: host.windowId });
    targetTabId = tab.id!;
  }

  if (item.kind === "search") {
    await chrome.search.query({ text: item.title, tabId: targetTabId });
  } else if (item.url) {
    await chrome.tabs.update(targetTabId, { url: item.url });
  }
}

function itemFromText(text: string): ResultItem | null {
  if (!text) return null;
  return looksLikeUrl(text) ? { kind: "url", title: text, url: toUrl(text) } : { kind: "search", title: text };
}
