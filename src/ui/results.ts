import type { ResultItem } from "../shared/model.ts";

/**
 * Any non-empty query always offers a web search, whatever the background returned
 * (an error, an old background script after an update, a disabled source…).
 */
export function withWebSearch(items: ResultItem[], query: string): ResultItem[] {
  if (!query || items.some((item) => item.kind === "search")) return items;
  const search: ResultItem = { kind: "search", title: query, action: "Search" };
  const firstRemote = items.findIndex((item) => !item.copy && item.kind !== "calc" && item.kind !== "tool");
  // Right after the tool rows, before tabs/history.
  const at = firstRemote === -1 ? items.length : firstRemote;
  return [...items.slice(0, at), search, ...items.slice(at)];
}
