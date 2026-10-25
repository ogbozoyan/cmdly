import type { ResultItem } from "../shared/model.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { maySuggest, parseSuggestions, suggestionRows, suggestUrl } from "../shared/suggestions.ts";
import { favicon } from "./search-service.ts";

/**
 * Search suggestions from the engine chosen in Settings. Asked separately from search() so a slow
 * network never delays tabs and history: the UI shows those first and adds suggestions when ready.
 */
const cache = new Map<string, string[]>();
const CACHE_SIZE = 100;

export async function suggest(query: string, host: chrome.tabs.Tab): Promise<ResultItem[]> {
  const { sources, suggest, limits } = await settingsRepository.get();
  const q = query.trim();
  // Incognito typing stays private, like Chrome's own omnibox with suggestions off.
  if (!sources.suggestions || host.incognito || !maySuggest(q)) return [];

  const key = `${suggest.engine}:${q.toLowerCase()}`;
  let suggestions = cache.get(key);
  if (!suggestions) {
    try {
      const response = await fetch(suggestUrl(suggest.engine, q), {
        credentials: "omit", // no cookies: the engine can't tie suggestions to the user's account
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) return [];
      suggestions = parseSuggestions(await response.json());
    } catch {
      return []; // offline, timeout, blocked — suggestions are optional
    }
    cache.set(key, suggestions);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  return suggestionRows(q, suggestions, limits.suggestions).map((row) => (row.url ? { ...row, icon: favicon(row.url) } : row));
}
