import { shortUrl } from "../shared/url.ts";

/**
 * Relevance of a title/url for a query. Every word of the query must match somewhere,
 * otherwise the score is 0 (= hidden). Title prefix matches rank highest.
 */
export function score(query: string, title = "", url = ""): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const t = title.toLowerCase();
  const u = url.toLowerCase();
  let total = 0;
  for (const w of words) {
    let s = 0;
    if (t.startsWith(w)) s = 5;
    else if (t.includes(" " + w)) s = 4;
    else if (t.includes(w)) s = 3;
    else if (shortUrl(u).startsWith(w)) s = 4;
    else if (u.includes(w)) s = 2;
    if (!s) return 0;
    total += s;
  }
  return total;
}
