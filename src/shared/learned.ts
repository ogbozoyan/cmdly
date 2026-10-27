/**
 * "Typed text → chosen row" memory for the experimental ranking (Settings → Experimental).
 * Pure: the storage lives in background/choice-service.ts (chrome.storage.local, never incognito).
 * The boost is Chrome's Shortcuts provider formula, rescaled to the ranking's 0..25.
 */
import { normalize } from "./ranking.ts";

/** query → item key (`cmd:<id>` or a URL) → how often and when it was picked. */
export type Learned = Record<string, Record<string, { hits: number; last: number }>>;

export const MAX_QUERIES = 500;
const MAX_QUERY_LENGTH = 20;
const MAX_BOOST = 25;
const WEEK = 7 * 86_400_000;

const key = (query: string) => normalize(query).trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);

export function record(data: Learned, query: string, item: string, now: number): Learned {
  const k = key(query);
  if (!k) return data;
  const entry = data[k]?.[item];
  const next: Learned = { ...data, [k]: { ...data[k], [item]: { hits: (entry?.hits ?? 0) + 1, last: now } } };
  const queries = Object.keys(next);
  if (queries.length > MAX_QUERIES) {
    const lastUse = (q: string) => Math.max(...Object.values(next[q]).map((e) => e.last));
    delete next[queries.reduce((oldest, q) => (lastUse(q) < lastUse(oldest) ? q : oldest))];
  }
  return next;
}

export function boost(data: Learned, query: string, item: string, now: number): number {
  const typed = key(query);
  if (!typed) return 0;
  let total = 0;
  for (const [stored, items] of Object.entries(data)) {
    const entry = items[item];
    if (!entry || !stored.startsWith(typed)) continue;
    const weeks = Math.max(0, now - entry.last) / WEEK;
    // Picked more often → forgotten more slowly.
    const halfLife = Math.min(0.8 + 0.2 * entry.hits, 5);
    total += MAX_BOOST * Math.sqrt(typed.length / stored.length) * 0.5 ** (weeks / halfLife);
  }
  return Math.min(total, MAX_BOOST);
}
