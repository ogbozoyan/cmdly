/** What kind of page a URL is, for deciding whether extension scripts can run there. Pure: no chrome.*. */
export type PageKind = "web" | "webstore" | "file" | "browser" | "other";

export function pageKind(url: string): PageKind {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "other"; // empty or unparsable: a tab that has no address yet
  }
  const { protocol, hostname, pathname } = parsed;
  if (protocol === "file:") return "file";
  if (protocol === "chrome:" || protocol === "chrome-error:" || protocol === "about:") return "browser";
  if (protocol !== "http:" && protocol !== "https:") return "other";
  // Chrome forbids extension scripts on its own store, although it is an ordinary https site.
  if (hostname === "chromewebstore.google.com" || (hostname === "chrome.google.com" && pathname.startsWith("/webstore"))) return "webstore";
  return "web";
}
