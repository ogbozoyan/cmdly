/**
 * Search suggestions: which engine to ask, whether a query may be sent at all, and how to turn
 * the engine's OpenSearch answer into rows. Pure — the fetch lives in background/suggest-service.ts.
 */
import type { ResultItem } from "./model.ts";
import { looksLikeUrl, shortUrl, toUrl } from "./url.ts";

export const SUGGEST_ENGINES = ["google", "bing", "duckduckgo", "yandex"] as const;
export type SuggestEngine = (typeof SUGGEST_ENGINES)[number];

/** All four answer in the OpenSearch suggestions format: ["query", ["s1", "s2", …], …]. */
export function suggestUrl(engine: SuggestEngine, query: string): string {
  const q = encodeURIComponent(query);
  switch (engine) {
    case "bing":
      return `https://api.bing.com/osjson.aspx?query=${q}`;
    case "duckduckgo":
      return `https://duckduckgo.com/ac/?q=${q}&type=list`;
    case "yandex":
      return `https://suggest.yandex.com/suggest-ff.cgi?part=${q}`;
    default:
      return `https://suggestqueries.google.com/complete/search?client=chrome&q=${q}`;
  }
}

/**
 * Only short, single-line, human-typed text goes to the engine. Pasted JSON, YAML, JWTs, Base64
 * or anything that looks like a secret must never leave the browser.
 */
export function maySuggest(query: string): boolean {
  const q = query.trim();
  if (q.length < 2 || q.length > 80) return false;
  if (/[\n\r{}[\]]/.test(q)) return false;
  if (/^eyJ[\w-]*\.[\w-]+\.?/.test(q)) return false; // JWT
  if (/[\w+/=-]{32,}/.test(q)) return false; // token, hash, key, Base64 blob
  if (/^(b64|unb64|url|unurl|uuid|guid)\b/i.test(q)) return false; // tool commands
  if (/^[\d\s.,+\-*/%^()]+$/.test(q)) return false; // arithmetic
  return true;
}

/** Engine answer → suggestion strings. Anything malformed yields []. */
export function parseSuggestions(body: unknown): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  return body[1].filter((s): s is string => typeof s === "string" && s.trim() !== "");
}

/**
 * Suggestions → rows, without the query itself and without duplicates.
 * A suggestion that is an address ("https://github.com/") becomes an Open row.
 */
export function suggestionRows(query: string, suggestions: string[], limit: number): ResultItem[] {
  const seen = new Set([query.trim().toLowerCase()]);
  const rows: ResultItem[] = [];
  for (const raw of suggestions) {
    const text = raw.trim();
    const key = (looksLikeUrl(text) ? shortUrl(toUrl(text)) : text).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(
      looksLikeUrl(text)
        ? { kind: "url", title: shortUrl(toUrl(text)), url: toUrl(text), action: "Open", suggestion: true }
        : { kind: "search", title: text, action: "Search", suggestion: true },
    );
    if (rows.length >= limit) break;
  }
  return rows;
}

/** Puts suggestion rows right after the main web-search row (or after tool rows if there is none). */
export function withSuggestions(items: ResultItem[], rows: ResultItem[]): ResultItem[] {
  if (!rows.length) return items;
  const titles = new Set(items.filter((i) => i.kind === "search").map((i) => i.title.toLowerCase()));
  const urls = new Set(items.map((i) => i.url).filter(Boolean));
  const fresh = rows.filter((r) => (r.url ? !urls.has(r.url) : !titles.has(r.title.toLowerCase())));
  const search = items.findIndex((i) => i.kind === "search");
  const at = search === -1 ? items.length : search + 1;
  return [...items.slice(0, at), ...fresh, ...items.slice(at)];
}
