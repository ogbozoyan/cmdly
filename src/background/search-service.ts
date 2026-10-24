import type { ResultItem } from "../shared/model.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { looksLikeUrl, shortUrl, toUrl } from "../shared/url.ts";
import { commandTarget, matchCommands } from "./command-service.ts";
import { score } from "./scoring.ts";
import { PALETTE_URL } from "./tab-service.ts";

/**
 * Builds the result list for a query, in this order:
 *   typed URL → web search → commands → open tabs → bookmarks → history.
 * Calculator and dev tools are added on top by the UI itself (src/tools/local-results.ts).
 * An empty query shows recent tabs only.
 */
export async function search(query: string, host: chrome.tabs.Tab, overlay: boolean): Promise<ResultItem[]> {
  const { sources, limits, features } = await settingsRepository.get();
  const results = new ResultList();

  if (query && looksLikeUrl(query)) {
    const url = toUrl(query);
    results.add({ kind: "url", title: shortUrl(url), url, icon: favicon(url), action: "Open" });
  }

  if (sources.tabs) results.addAll(await findTabs(query, host, query ? limits.tabs : Math.max(limits.tabs, 6)));
  if (!query) return results.items;

  if (sources.bookmarks) results.addAll(await findBookmarks(query, limits.bookmarks));
  if (sources.history) results.addAll(await findHistory(query, limits.history));

  // Web search goes first for text, last for things that look like a URL.
  const webSearch: ResultItem = { kind: "search", title: query, action: "Search" };
  if (looksLikeUrl(query)) results.items.push(webSearch);
  else results.items.unshift(webSearch);

  if (features.commands) {
    results.items.splice(1, 0, ...matchCommands(query, await commandTarget(host, overlay)));
  }
  return results.items;
}

/** Result list without duplicate URLs (a page can be open, bookmarked and in history at once). */
class ResultList {
  readonly items: ResultItem[] = [];
  private readonly seen = new Set<string>();

  add(item: ResultItem): void {
    if (item.url && this.seen.has(item.url)) return;
    if (item.url) this.seen.add(item.url);
    this.items.push(item);
  }

  addAll(items: ResultItem[]): void {
    items.forEach((item) => this.add(item));
  }
}

async function findTabs(query: string, host: chrome.tabs.Tab, limit: number): Promise<ResultItem[]> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.id !== host.id && t.url && !t.url.startsWith(PALETTE_URL) && !t.url.startsWith("about:"))
    .map((t) => ({ t, relevance: query ? score(query, t.title, t.url) : 1 }))
    .filter((x) => x.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || (b.t.lastAccessed ?? 0) - (a.t.lastAccessed ?? 0))
    .slice(0, limit)
    .map(({ t }) => ({
      kind: "tab" as const,
      title: t.title || shortUrl(t.url!),
      url: t.url,
      icon: favicon(t.url!, t.favIconUrl),
      tabId: t.id,
      windowId: t.windowId,
      action: "Switch to Tab",
    }));
}

async function findBookmarks(query: string, limit: number): Promise<ResultItem[]> {
  const bookmarks = await chrome.bookmarks.search(query);
  return bookmarks
    .filter((b) => b.url)
    .map((b) => ({ b, relevance: score(query, b.title, b.url) }))
    .filter((x) => x.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit)
    .map(({ b }) => pageRow("bookmark", b.title, b.url!));
}

async function findHistory(query: string, limit: number): Promise<ResultItem[]> {
  const visits = await chrome.history.search({ text: query, startTime: 0, maxResults: 30 });
  return visits
    .filter((h) => h.url)
    .map((h) => ({ h, relevance: score(query, h.title, h.url) + Math.min(h.visitCount ?? 0, 20) / 10 }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit)
    .map(({ h }) => pageRow("history", h.title, h.url!));
}

function pageRow(kind: "bookmark" | "history", title: string | undefined, url: string): ResultItem {
  return { kind, title: title || shortUrl(url), url, meta: shortUrl(url), icon: favicon(url) };
}

/** Tab's own favicon if usable, otherwise Chrome's favicon cache (needs the "favicon" permission). */
function favicon(pageUrl: string, favIconUrl?: string): string {
  if (favIconUrl && /^(https?|data):/.test(favIconUrl)) return favIconUrl;
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", pageUrl);
  u.searchParams.set("size", "32");
  return u.toString();
}
