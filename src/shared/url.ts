/** URL helpers shared by search and navigation. Pure functions. */

/** "github.com", "localhost:3000", "https://x.io/a" → true; "how to change oil" → false. */
export function looksLikeUrl(text: string): boolean {
  if (/\s/.test(text)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return true;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(text)) return true;
  return /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(text);
}

/** Adds https:// when the scheme is missing. */
export function toUrl(text: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
}

/** "https://www.github.com/" → "github.com" */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}
