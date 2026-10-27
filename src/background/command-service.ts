import type { CommandResult, GlyphName, ResultItem } from "../shared/model.ts";
import { dismissPalettePage } from "./bar-service.ts";
import { en } from "../i18n/en.ts";
import { t, tp, type MessageKey } from "../i18n/index.ts";
import type { Candidate } from "../shared/ranking.ts";
import { CHROME_PAGES } from "./chrome-pages.ts";
import { score } from "./scoring.ts";
import { previousTab, restoreClosedTab } from "./tab-service.ts";

/**
 * Browser commands shown in the bar: "Copy URL", "Pin Tab", "Close Other Tabs"…
 * To add a command, add an entry to COMMANDS — nothing else needs to change.
 */

interface CommandContext {
  /** The tab the command acts on: the page under the overlay, or the tab before the palette page. */
  target: chrome.tabs.Tab | undefined;
  /** The tab hosting the bar (same as target in overlay mode, the palette page otherwise). */
  host: chrome.tabs.Tab;
}

interface CommandOutcome extends CommandResult {
  /** The command focused another tab/window, so the palette page must not re-activate the previous tab. */
  focusMoved?: boolean;
}

interface Command {
  id: string;
  /** Message key of the title (src/i18n); a function for titles that depend on the tab state. */
  title: MessageKey | ((target: chrome.tabs.Tab | undefined) => MessageKey);
  /** Extra English words the command can be found by (the English title always matches too). */
  keywords: string;
  glyph: GlyphName;
  /** Needs a target tab (most do; "New Window" doesn't). */
  needsTab?: boolean;
  run(ctx: CommandContext & { target: chrome.tabs.Tab }): Promise<CommandOutcome | void>;
}

const openPage = (url: string): Command["run"] => async ({ target }) => {
  await chrome.tabs.create({ url, index: (target?.index ?? 0) + 1 });
  return { focusMoved: true };
};

const COMMANDS: Command[] = [
  {
    id: "copy-url", title: "cmdCopyUrl", keywords: "link address share", glyph: "link", needsTab: true,
    run: async ({ target }) => ({ copy: target.url, toast: t("urlCopied") }),
  },
  {
    id: "copy-markdown", title: "cmdCopyMarkdown", keywords: "link md title", glyph: "link", needsTab: true,
    run: async ({ target }) => ({ copy: `[${target.title}](${target.url})`, toast: t("toastMarkdownCopied") }),
  },
  {
    id: "close-tab", title: "cmdCloseTab", keywords: "kill remove", glyph: "close", needsTab: true,
    run: async ({ target }) => { await chrome.tabs.remove(target.id!); },
  },
  {
    id: "duplicate", title: "cmdDuplicate", keywords: "clone copy tab", glyph: "duplicate", needsTab: true,
    run: async ({ target }) => { await chrome.tabs.duplicate(target.id!); return { focusMoved: true }; },
  },
  {
    id: "pin", title: (t) => (t?.pinned ? "cmdUnpin" : "cmdPin"), keywords: "pin unpin favorite", glyph: "pin", needsTab: true,
    run: async ({ target }) => {
      await chrome.tabs.update(target.id!, { pinned: !target.pinned });
      return { toast: t(target.pinned ? "toastUnpinned" : "toastPinned") };
    },
  },
  {
    id: "mute", title: (t) => (t?.mutedInfo?.muted ? "cmdUnmute" : "cmdMute"), keywords: "sound audio silence volume", glyph: "sound", needsTab: true,
    run: async ({ target }) => {
      const muted = !target.mutedInfo?.muted;
      await chrome.tabs.update(target.id!, { muted });
      return { toast: t(muted ? "toastMuted" : "toastUnmuted") };
    },
  },
  {
    id: "reload", title: "cmdReload", keywords: "refresh", glyph: "reload", needsTab: true,
    run: async ({ target }) => { await chrome.tabs.reload(target.id!); },
  },
  {
    id: "hard-reload", title: "cmdHardReload", keywords: "refresh cache bypass", glyph: "reload", needsTab: true,
    run: async ({ target }) => { await chrome.tabs.reload(target.id!, { bypassCache: true }); },
  },
  {
    id: "move-window", title: "cmdMoveWindow", keywords: "detach pop out", glyph: "window", needsTab: true,
    run: async ({ target }) => { await chrome.windows.create({ tabId: target.id }); return { focusMoved: true }; },
  },
  {
    id: "close-others", title: "cmdCloseOthers", keywords: "kill remove clean", glyph: "close", needsTab: true,
    run: ({ target, host }) => closeTabs(target, host, () => true),
  },
  {
    id: "close-right", title: "cmdCloseRight", keywords: "kill remove", glyph: "close", needsTab: true,
    run: ({ target, host }) => closeTabs(target, host, (t) => t.index > target.index),
  },
  {
    id: "bookmark", title: "cmdBookmark", keywords: "save star favorite", glyph: "star", needsTab: true,
    run: async ({ target }) => {
      await chrome.bookmarks.create({ title: target.title, url: target.url });
      return { toast: t("toastBookmarked") };
    },
  },
  {
    id: "reopen", title: "cmdReopen", keywords: "undo restore", glyph: "restore",
    run: async () => { await restoreClosedTab(); return { focusMoved: true }; },
  },
  {
    id: "new-window", title: "cmdNewWindow", keywords: "open", glyph: "window",
    run: async () => { await chrome.windows.create({}); return { focusMoved: true }; },
  },
  {
    id: "incognito", title: "cmdIncognito", keywords: "private", glyph: "incognito",
    run: async () => { await chrome.windows.create({ incognito: true }); return { focusMoved: true }; },
  },
  { id: "history", title: "cmdHistory", keywords: "visited", glyph: "history", run: openPage("chrome://history") },
  { id: "downloads", title: "cmdDownloads", keywords: "files", glyph: "download", run: openPage("chrome://downloads") },
  { id: "bookmarks", title: "cmdBookmarks", keywords: "favorites", glyph: "star", run: openPage("chrome://bookmarks") },
  { id: "extensions", title: "cmdExtensions", keywords: "addons plugins", glyph: "puzzle", run: openPage("chrome://extensions") },
  { id: "settings", title: "cmdSettings", keywords: "preferences options chrome", glyph: "gear", run: openPage("chrome://settings") },
  { id: "clear-data", title: "cmdClearData", keywords: "cache cookies history delete", glyph: "trash", run: openPage("chrome://settings/clearBrowserData") },
  { id: "shortcuts", title: "cmdShortcuts", keywords: "hotkeys keys", glyph: "gear", run: openPage("chrome://extensions/shortcuts") },
  {
    id: "cmdly-settings", title: "cmdCmdlySettings", keywords: "preferences options configure cmdly", glyph: "gear",
    run: async () => { await chrome.runtime.openOptionsPage(); return { focusMoved: true }; },
  },
  ...CHROME_PAGES.map((page): Command => ({
    id: "page-" + page.id, title: page.title, keywords: page.keywords, glyph: page.glyph, run: openPage(page.url),
  })),
];

/** Closes unpinned tabs in the target's window matching `filter`, keeping the target and the bar's own tab. */
async function closeTabs(
  target: chrome.tabs.Tab,
  host: chrome.tabs.Tab,
  filter: (t: chrome.tabs.Tab) => boolean
): Promise<CommandOutcome> {
  const tabs = await chrome.tabs.query({ windowId: target.windowId, pinned: false });
  const ids = tabs.filter((t) => t.id !== target.id && t.id !== host.id && filter(t)).map((t) => t.id!);
  if (ids.length) await chrome.tabs.remove(ids);
  return { toast: tp("toastClosedTabs", ids.length) };
}

// ---------- public API ----------

/** In overlay mode commands act on the host page; on the palette page — on the tab before it. */
export async function commandTarget(host: chrome.tabs.Tab, overlay: boolean): Promise<chrome.tabs.Tab | undefined> {
  return overlay ? chrome.tabs.get(host.id!) : previousTab(host);
}

/** Commands the user can see: the Chrome settings pages are a feature of their own. */
function available(chromeSettings: boolean): Command[] {
  return chromeSettings ? COMMANDS : COMMANDS.filter((c) => !c.id.startsWith("page-"));
}

/** Up to 3 commands matching the query, as result rows (the classic ranking). */
export function matchCommands(query: string, target: chrome.tabs.Tab | undefined, chromeSettings = true): ResultItem[] {
  return available(chromeSettings).map((command) => {
    const key = titleKey(command, target);
    const title = t(key);
    // Localized title, the English one (people often type English commands) and keywords.
    const relevance = Math.max(score(query, title), score(query, en[key]), score(query, command.keywords) - 1)
      // "Settings: …" pages all start with the word, which would push "Open Settings" out of its own query.
      - (command.id.startsWith("page-") ? 1 : 0);
    return { command, title, relevance };
  })
    .filter((x) => x.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3)
    .map(({ command, title }) => commandRow(command, title));
}

/** Every command as a ranking candidate (shared/ranking.ts), for the experimental ranking. */
export function commandCandidates(target: chrome.tabs.Tab | undefined, chromeSettings: boolean): Candidate<ResultItem>[] {
  return available(chromeSettings).map((command) => {
    const key = titleKey(command, target);
    const title = t(key);
    return {
      item: commandRow(command, title),
      source: command.id.startsWith("page-") ? "page" : "command",
      fields: [{ text: title, weight: 1 }, { text: en[key], weight: 1 }, { text: command.keywords, weight: 0.75 }],
      frecency: 0,
      learned: 0,
      title,
      recency: 0,
      id: "cmd:" + command.id,
    };
  });
}

function titleKey(command: Command, target: chrome.tabs.Tab | undefined): MessageKey {
  return typeof command.title === "function" ? command.title(target) : command.title;
}

function commandRow(command: Command, title: string): ResultItem {
  return { kind: "command", commandId: command.id, title, glyph: command.glyph, url: "cmd:" + command.id, action: t("actionRun") };
}

export async function runCommand(id: string, host: chrome.tabs.Tab, overlay: boolean): Promise<CommandResult> {
  const command = COMMANDS.find((c) => c.id === id);
  if (!command) return {};
  const target = await commandTarget(host, overlay);
  if (command.needsTab && !target) return { toast: t("toastNoTab"), closePalette: !overlay };

  const { focusMoved, ...result } = (await command.run({ target: target!, host })) ?? {};
  if (overlay) return result;

  // Palette page: if the UI will show a toast, it closes the page itself afterwards.
  if (result.toast || result.copy) return { ...result, closePalette: true };
  if (focusMoved) await chrome.tabs.remove(host.id!).catch(() => {});
  else await dismissPalettePage(host).catch(() => {});
  return {};
}
