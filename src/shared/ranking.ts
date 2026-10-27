/**
 * Relevance of a row for a typed query, on one scale for every source (tabs, history, commands…).
 * Pure: unit-tested in Node. Used by background/search-service.ts when `experimental.ranking` is on.
 *
 * Short terms match only at word starts — like Chrome's omnibox, "mar" must not find "Bookmark".
 * Tiers and recency weights follow Chromium's HistoryQuickProvider and Shortcuts provider; the
 * thresholds are tuned by tests/shared/ranking.test.ts.
 */

export interface Field {
  text: string;
  weight: number;
  /** The text is a URL: match its host or its path segments instead of words. */
  url?: "host" | "path";
}

export interface MatchOptions {
  /** Also try a Latin query as if typed on the Russian layout (Russian UI only). */
  cyrillicLayout?: boolean;
}

/** Leading words of grouped command titles ("Settings: Fonts"): never enough on their own. */
export const NAMESPACE_WORDS = new Set(["settings", "настройки", "设置", "einstellungen", "parametres"]);
const NAMESPACE_CAP = 45;

const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]/u;
const CYRILLIC_ONLY = /^[\p{sc=Cyrillic}\s]+$/u;
const RU = "йцукенгшщзхъфывапролджэячсмитьбю";
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";

/** Case- and accent-insensitive form: "Ёлка Café" → "елка cafe" (й stays й). */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[иИ]̆/g, (c) => (c[0] === "и" ? "й" : "Й"))
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

let segmenter: Intl.Segmenter | undefined;

export function tokens(text: string): string[] {
  const n = normalize(text);
  if (CJK.test(n)) {
    segmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
    return [...segmenter.segment(n)].filter((s) => s.isWordLike).map((s) => s.segment);
  }
  return n.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function urlTokens(url: string): { host: string[]; path: string[] } {
  try {
    const u = new URL(url);
    return {
      host: normalize(u.hostname.replace(/^www\./, "")).split(".").filter(Boolean),
      path: normalize(decodeURIComponent(u.pathname)).split(/[/\-_.]+/).filter(Boolean),
    };
  } catch {
    return { host: [], path: tokens(url) };
  }
}

// Commands are scored on every keystroke with the same titles: keep their tokens.
const cache = new Map<string, string[]>();

function fieldTokens(field: Field): string[] {
  const key = (field.url ?? "") + "\u0000" + field.text;
  let toks = cache.get(key);
  if (!toks) {
    if (cache.size > 3000) cache.clear();
    toks = field.url ? urlTokens(field.text)[field.url] : tokens(field.text);
    cache.set(key, toks);
  }
  return toks;
}

/** Best score of one query term against a field's tokens, and the token it hit. */
function termScore(term: string, toks: string[]): [number, number] {
  const midWord = term.length >= 4 || CJK.test(term);
  let best = 0;
  let at = -1;
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    let s = 0;
    if (tok === term) s = 100;
    else if (tok.startsWith(term)) s = 80 + (20 * term.length) / tok.length;
    else if (term.length >= 2 && isAcronym(term, toks, i)) s = 70;
    else if (midWord && tok.includes(term)) s = 40;
    if (!s) continue;
    s -= Math.min(i, 5) * 2;
    // Only the leading word is a namespace ("Settings: Fonts"); in "Open Settings" it's the content.
    if (i === 0 && NAMESPACE_WORDS.has(tok)) s = Math.min(s, NAMESPACE_CAP);
    if (s > best) [best, at] = [s, i];
  }
  return [best, at];
}

function isAcronym(term: string, toks: string[], from: number): boolean {
  if (from + term.length > toks.length) return false;
  for (let k = 0; k < term.length; k++) if (toks[from + k][0] !== term[k]) return false;
  return true;
}

function score(query: string, fields: Field[]): number {
  const terms = tokens(query);
  if (!terms.length) return 0;
  let total = 0;
  let inOrder = terms.length > 1;
  let field = -1;
  let last = -1;
  for (const term of terms) {
    let best = 0;
    let bestField = -1;
    let bestAt = -1;
    fields.forEach((f, i) => {
      const [s, at] = termScore(term, fieldTokens(f));
      if (s * f.weight > best) [best, bestField, bestAt] = [s * f.weight, i, at];
    });
    if (!best) return 0;
    total += best;
    if (field !== -1 && (bestField !== field || bestAt <= last)) inOrder = false;
    [field, last] = [bestField, bestAt];
  }
  return total / terms.length + (inOrder ? 5 : 0);
}

function swapLayout(query: string, from: string, to: string): string {
  return [...query.toLowerCase()].map((c) => (from.includes(c) ? to[from.indexOf(c)] : c)).join("");
}

/** 0 = no match; ~40 mid-word, 70 acronym, 80–100 word start / exact (times the field weight). */
export function matchScore(query: string, fields: Field[], options: MatchOptions = {}): number {
  const direct = score(query, fields);
  if (direct >= 70) return direct;
  let swapped = 0;
  if (CYRILLIC_ONLY.test(query.trim())) swapped = score(swapLayout(query, RU, EN), fields);
  else if (options.cyrillicLayout && /^[a-z\s[\];',.]+$/i.test(query.trim())) swapped = score(swapLayout(query, EN, RU), fields);
  return Math.max(direct, swapped * 0.9);
}

// ---------- blending sources into one list ----------

export type Source = "tab" | "bookmark" | "history" | "command" | "page";

export interface Candidate<T> {
  item: T;
  source: Source;
  fields: Field[];
  /** 0..20: how often/recently it was used (historyFrecency, tabFrecency). */
  frecency: number;
  /** 0..25: the user picked it for this query before (shared/learned.ts). */
  learned: number;
  title: string;
  /** Last use, ms — a tie-break. */
  recency: number;
  id: string;
}

export interface Ranked<T> {
  item: T;
  final: number;
  match: number;
}

/** Same match: an open tab is likelier the target than a bookmark, a bookmark than history. */
export const PRIOR: Record<Source, number> = { tab: 4, bookmark: 2, history: 0, command: 0, page: 0 };
/** A row this strong replaces web search as the first row (owns Enter). */
export const TOP_HIT = 110;
const MIN_MATCH = 50;
const BELOW_BEST = 45;
const CAPS: Record<Source, number> = { tab: 3, bookmark: 3, history: 3, command: 2, page: 1 };

export interface RankOptions extends MatchOptions {
  /** Inside a scope the user asked for the catalog: no per-source caps, no minimum length. */
  uncapped?: boolean;
}

export function rank<T>(query: string, candidates: Candidate<T>[], options: RankOptions = {}): Ranked<T>[] {
  const length = query.trim().length;
  const scored = candidates
    .filter((c) => options.uncapped || (c.source === "page" ? length >= 4 : c.source === "command" ? length >= 2 : true))
    .map((c) => {
      const match = matchScore(query, c.fields, options);
      return { c, match, final: match + PRIOR[c.source] + c.frecency + c.learned };
    })
    .filter((x) => x.match >= MIN_MATCH)
    .sort((a, b) => b.final - a.final || b.match - a.match || a.c.title.length - b.c.title.length
      || b.c.recency - a.c.recency || (a.c.id < b.c.id ? -1 : 1));
  const best = scored[0]?.final ?? 0;
  const used = new Map<string, number>();
  const out: Ranked<T>[] = [];
  for (const { c, match, final } of scored) {
    if (final < best - BELOW_BEST) break;
    // Bookmarks and history share one cap: both are "pages you've seen".
    const group = c.source === "bookmark" ? "history" : c.source;
    const n = used.get(group) ?? 0;
    if (!options.uncapped && n >= CAPS[group]) continue;
    used.set(group, n + 1);
    out.push({ item: c.item, final, match });
  }
  return out;
}

const DAY = 86_400_000;
// Chrome's HistoryQuickProvider recency weights (age in days → weight), linear in between.
const RECENCY: [number, number][] = [[0, 1], [4, 1], [14, 0.7], [31, 0.5], [90, 0.3], [365, 0.1]];

function recencyWeight(days: number): number {
  for (let i = 1; i < RECENCY.length; i++) {
    const [d1, w1] = RECENCY[i];
    if (days <= d1) {
      const [d0, w0] = RECENCY[i - 1];
      return w0 + ((w1 - w0) * (days - d0)) / (d1 - d0);
    }
  }
  return 0.1;
}

/** 0..12 from visit count (capped at 20) and how long ago the last visit was. */
export function historyFrecency(visitCount: number, lastVisit: number, now: number): number {
  return (recencyWeight(Math.max(0, now - lastVisit) / DAY) * Math.min(visitCount, 20) * 12) / 20;
}

/** A tab used within the last hour is probably what the user is switching back to. */
export function tabFrecency(lastAccessed: number, now: number): number {
  return now - lastAccessed < 3_600_000 ? 6 : 0;
}

// ---------- scopes (experimental) ----------

export type Scope = "commands" | "settings";

/** "> pin" → only commands; "settings fonts" (any UI language) → only Chrome settings pages. */
export function parseScope(query: string): { scope: Scope | null; rest: string } {
  const q = query.trimStart();
  if (q.startsWith(">")) return { scope: "commands", rest: q.slice(1).trim() };
  const [first = "", ...rest] = q.split(/\s+/);
  if (NAMESPACE_WORDS.has(normalize(first).replace(/[:：]$/, ""))) return { scope: "settings", rest: rest.join(" ").trim() };
  return { scope: null, rest: query };
}
