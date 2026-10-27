import { log } from "../shared/log.ts";
import { pageKind } from "../shared/page-kind.ts";

/**
 * Chrome doesn't add content scripts to tabs that were open before install/update, so inject them now.
 * Tabs where Chrome forbids it are skipped up front; the log gets one summary line, and a failure names
 * the kind of tab (never its address: the log can end up in a public issue).
 */
export async function injectIntoOpenTabs(): Promise<void> {
  const fileAccess = await chrome.extension.isAllowedFileSchemeAccess();
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*", "file://*/*"] });
  const skipped: Record<string, number> = {};
  let injected = 0;
  let failed = 0;

  await Promise.all(
    tabs.map(async (tab) => {
      const kind = pageKind(tab.url ?? "");
      const reason = kind === "webstore" ? "Web Store" : kind === "file" && !fileAccess ? "file access is off" : tab.discarded ? "discarded" : "";
      if (reason) {
        skipped[reason] = (skipped[reason] ?? 0) + 1;
        return;
      }
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id!, allFrames: true }, files: ["content.js"] });
        injected++;
      } catch (error) {
        failed++;
        const state = [tab.status, tab.incognito ? "incognito" : ""].filter(Boolean).join(", ");
        log.debug("install", `content script not injected into a ${kind} tab (${state})`, error);
      }
    }),
  );

  const notes = [...Object.entries(skipped).map(([why, n]) => `${n} skipped: ${why}`), failed ? `${failed} failed` : ""].filter(Boolean);
  log.info("install", `content script injected into ${injected} of ${tabs.length} open tabs${notes.length ? ` (${notes.join(", ")})` : ""}`);
}
