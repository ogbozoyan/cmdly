import { t } from "../i18n/index.ts";
import type { ResultItem } from "../shared/model.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { looksLikeUrl, shortUrl, toUrl } from "../shared/url.ts";
import { historyFrecency, parseScope, rank, tabFrecency, TOP_HIT, type Candidate, type Field, type Scope } from "../shared/ranking.ts";
import type { Settings } from "../shared/settings.ts";
import { choiceKey, learnedBoost } from "./choice-service.ts";
import { commandCandidates, commandTarget, matchCommands } from "./command-service.ts";
import { score } from "./scoring.ts";
import { isGuardTab, PALETTE_URL } from "./tab-service.ts";
import { log } from "../shared/log.ts";

/**
 * Builds the result list for a query, in this order:
 *   typed URL → web search → commands → open tabs → bookmarks → history.
 * Calculator and dev tools are added on top by the UI itself (src/tools/local-results.ts).
 * An empty query shows recent tabs only.
 */
export async function search(query: string, host: chrome.tabs.Tab, overlay: boolean): Promise<ResultItem[]> {
  const settings = await settingsRepository.get();
  if (query && settings.experimental.scopes && settings.features.commands) {
    const { scope, rest } = parseScope(query);
    if (scope) return scopedSearch(scope, rest, query, host, overlay, settings);
  }
  if (query && settings.experimental.ranking) return rankedSearch(query, host, overlay, settings);
  const { sources, limits, features } = settings;
  const results = new ResultList();

  if (query && looksLikeUrl(query)) {
    const url = toUrl(query);
    results.add({ kind: "url", title: shortUrl(url), url, icon: favicon(url), action: t("actionOpen") });
  }

  if (sources.tabs) results.addAll(await safely("tabs", () => findTabs(query, host, query ? limits.tabs : Math.max(limits.tabs, 6))));
  if (!query) return results.items;

  if (sources.bookmarks) results.addAll(await safely("bookmarks", () => findBookmarks(query, limits.bookmarks)));
  if (sources.history) results.addAll(await safely("history", () => findHistory(query, limits.history)));

  // Web search goes first for text, last for things that look like a URL.
  const webSearch: ResultItem = { kind: "search", title: query, action: t("actionSearch") };
  if (looksLikeUrl(query)) results.items.push(webSearch);
  else results.items.unshift(webSearch);

  if (features.commands) {
    const commands = await safely("commands", async () => matchCommands(query, await commandTarget(host, overlay), features.chromeSettings));
    results.items.splice(1, 0, ...commands);
  }
  return results.items;
}

/**
 * Experimental ranking (Settings → Experimental): every source on one relevance scale
 * (shared/ranking.ts). A strong enough row replaces web search as the first row, so it owns Enter.
 */
async function rankedSearch(query: string, host: chrome.tabs.Tab, overlay: boolean, settings: Settings): Promise<ResultItem[]> {
  const { sources, limits, features } = settings;
  const now = Date.now();
  const candidates: Candidate<ResultItem>[] = [];
  const add = async (source: string, find: () => Promise<Candidate<ResultItem>[]>) => {
    try {
      candidates.push(...(await find()));
    } catch (error) {
      log.error("search", `${source} search failed`, error);
    }
  };
  if (sources.tabs) await add("tabs", () => tabCandidates(host, now));
  if (sources.bookmarks) await add("bookmarks", () => bookmarkCandidates(query));
  if (sources.history) await add("history", () => historyCandidates(query, now));
  if (features.commands) {
    await add("commands", async () => commandCandidates(await commandTarget(host, overlay), features.chromeSettings));
  }

  if (settings.experimental.learned) {
    const learned = await learnedBoost(query);
    for (const c of candidates) c.learned = learned(choiceKey(c.item) ?? "");
  }
  const ranked = rank(query, candidates, { cyrillicLayout: uiLanguage(settings).startsWith("ru") });
  const limit: Partial<Record<ResultItem["kind"], number>> = { tab: limits.tabs, bookmark: limits.bookmarks, history: limits.history };
  const shown = new Map<string, number>();
  const rows = new ResultList();
  let top: ResultItem | undefined;
  for (const { item, final } of ranked) {
    const n = shown.get(item.kind) ?? 0;
    if (n >= (limit[item.kind] ?? Infinity)) continue;
    shown.set(item.kind, n + 1);
    if (!rows.items.length && final >= TOP_HIT) top = item;
    rows.add(item);
  }

  const webSearch: ResultItem = { kind: "search", title: query, action: t("actionSearch") };
  if (looksLikeUrl(query)) {
    const url = toUrl(query);
    const typed: ResultItem = { kind: "url", title: shortUrl(url), url, icon: favicon(url), action: t("actionOpen") };
    return [typed, ...rows.items.filter((r) => r.url !== url), webSearch];
  }
  if (top) return [top, webSearch, ...rows.items.slice(1)];
  return [webSearch, ...rows.items];
}

/**
 * Experimental scopes: "> text" ranks every command, "settings text" every Chrome settings page —
 * the whole catalog, without the caps of the ordinary list. Nothing typed after the prefix lists all.
 */
async function scopedSearch(scope: Scope, rest: string, query: string, host: chrome.tabs.Tab, overlay: boolean, settings: Settings): Promise<ResultItem[]> {
  const all = commandCandidates(await commandTarget(host, overlay), settings.features.chromeSettings);
  const candidates = scope === "commands" ? all : all.filter((c) => c.source === "page" || c.id === "cmd:settings");
  const rows = rest
    ? rank(rest, candidates, { uncapped: true, cyrillicLayout: uiLanguage(settings).startsWith("ru") }).slice(0, 20).map((r) => r.item)
    : candidates.map((c) => c.item);
  // "settings" is also an ordinary word: keep searching the web for it possible.
  return scope === "settings" ? [...rows, { kind: "search", title: query, action: t("actionSearch") }] : rows;
}

function uiLanguage(settings: Settings): string {
  return settings.appearance.language === "auto" ? chrome.i18n.getUILanguage() : settings.appearance.language;
}

const titleAndUrl = (title: string, url: string): Field[] => [
  { text: title, weight: 1 },
  { text: url, weight: 0.9, url: "host" },
  { text: url, weight: 0.6, url: "path" },
];

async function tabCandidates(host: chrome.tabs.Tab, now: number): Promise<Candidate<ResultItem>[]> {
  const action = t("actionSwitchTab");
  return (await chrome.tabs.query({})).filter((tab) => isSearchableTab(tab, host)).map((tab) => {
    const item = tabRow(tab, action);
    return {
      item, source: "tab", fields: titleAndUrl(item.title, tab.url!), title: item.title, id: tab.url!,
      frecency: tabFrecency(tab.lastAccessed ?? 0, now), learned: 0, recency: tab.lastAccessed ?? 0,
    };
  });
}

async function bookmarkCandidates(query: string): Promise<Candidate<ResultItem>[]> {
  return (await chrome.bookmarks.search(query)).filter((b) => b.url).map((b) => {
    const item = pageRow("bookmark", b.title, b.url!);
    return { item, source: "bookmark", fields: titleAndUrl(item.title, b.url!), title: item.title, id: b.url!, frecency: 0, learned: 0, recency: b.dateAdded ?? 0 };
  });
}

async function historyCandidates(query: string, now: number): Promise<Candidate<ResultItem>[]> {
  const visits = await chrome.history.search({ text: query, startTime: 0, maxResults: 50 });
  return visits.filter((h) => h.url).map((h) => {
    const item = pageRow("history", h.title, h.url!);
    const last = h.lastVisitTime ?? 0;
    return {
      item, source: "history", fields: titleAndUrl(item.title, h.url!), title: item.title, id: h.url!,
      frecency: historyFrecency(h.visitCount ?? 0, last, now), learned: 0, recency: last,
    };
  });
}

/** One failing source (e.g. history API error) must not empty the whole list. */
async function safely(source: string, find: () => Promise<ResultItem[]>): Promise<ResultItem[]> {
  try {
    return await find();
  } catch (error) {
    log.error("search", `${source} search failed`, error);
    return [];
  }
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
  const action = t("actionSwitchTab");
  return tabs
    .filter((t) => isSearchableTab(t, host))
    .map((t) => ({ t, relevance: query ? score(query, t.title, t.url) : 1 }))
    .filter((x) => x.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || (b.t.lastAccessed ?? 0) - (a.t.lastAccessed ?? 0))
    .slice(0, limit)
    .map(({ t }) => tabRow(t, action));
}

function isSearchableTab(t: chrome.tabs.Tab, host: chrome.tabs.Tab): boolean {
  return t.id !== host.id && !!t.url && !t.url.startsWith(PALETTE_URL) && !t.url.startsWith("about:") && !isGuardTab(t);
}

function tabRow(t: chrome.tabs.Tab, action: string): ResultItem {
  return {
    kind: "tab",
    title: t.title || shortUrl(t.url!),
    url: t.url,
    icon: favicon(t.url!, t.favIconUrl),
    tabId: t.id,
    windowId: t.windowId,
    action,
  };
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
export function favicon(pageUrl: string, favIconUrl?: string): string {
  if (favIconUrl && /^(https?|data):/.test(favIconUrl)) return favIconUrl;
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", pageUrl);
  u.searchParams.set("size", "32");
  return u.toString();
}
