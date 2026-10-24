import type { CommandResult, GlyphName, ResultItem } from "../shared/model.ts";
import { dismissPalettePage } from "./bar-service.ts";
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
  title: string | ((target: chrome.tabs.Tab | undefined) => string);
  /** Extra words the command can be found by. */
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
    id: "copy-url", title: "Copy URL", keywords: "link address share", glyph: "link", needsTab: true,
    run: async ({ target }) => ({ copy: target.url, toast: "URL copied" }),
  },
  {
    id: "copy-markdown", title: "Copy URL as Markdown", keywords: "link md title", glyph: "link", needsTab: true,
    run: async ({ target }) => ({ copy: `[${target.title}](${target.url})`, toast: "Markdown link copied" }),
  },
  {
    id: "close-tab", title: "Close Tab", keywords: "kill remove", glyph: "close", needsTab: true,
    run: async ({ target }) => { await chrome.tabs.remove(target.id!); },
  },
  {
    id: "duplicate", title: "Duplicate Tab", keywords: "clone copy tab", glyph: "duplicate", needsTab: true,
    run: async ({ target }) => { await chrome.tabs.duplicate(target.id!); return { focusMoved: true }; },
  },
  {
    id: "pin", title: (t) => (t?.pinned ? "Unpin Tab" : "Pin Tab"), keywords: "pin unpin favorite", glyph: "pin", needsTab: true,
    run: async ({ target }) => {
      await chrome.tabs.update(target.id!, { pinned: !target.pinned });
      return { toast: target.pinned ? "Tab unpinned" : "Tab pinned" };
    },
  },
  {
    id: "mute", title: (t) => (t?.mutedInfo?.muted ? "Unmute Tab" : "Mute Tab"), keywords: "sound audio silence volume", glyph: "sound", needsTab: true,
    run: async ({ target }) => {
      const muted = !target.mutedInfo?.muted;
      await chrome.tabs.update(target.id!, { muted });
      return { toast: muted ? "Tab muted" : "Tab unmuted" };
    },
  },
  {
    id: "reload", title: "Reload Page", keywords: "refresh", glyph: "reload", needsTab: true,
    run: async ({ target }) => { await chrome.tabs.reload(target.id!); },
  },
  {
    id: "hard-reload", title: "Hard Reload Page", keywords: "refresh cache bypass", glyph: "reload", needsTab: true,
    run: async ({ target }) => { await chrome.tabs.reload(target.id!, { bypassCache: true }); },
  },
  {
    id: "move-window", title: "Move Tab to New Window", keywords: "detach pop out", glyph: "window", needsTab: true,
    run: async ({ target }) => { await chrome.windows.create({ tabId: target.id }); return { focusMoved: true }; },
  },
  {
    id: "close-others", title: "Close Other Tabs", keywords: "kill remove clean", glyph: "close", needsTab: true,
    run: ({ target, host }) => closeTabs(target, host, () => true),
  },
  {
    id: "close-right", title: "Close Tabs to the Right", keywords: "kill remove", glyph: "close", needsTab: true,
    run: ({ target, host }) => closeTabs(target, host, (t) => t.index > target.index),
  },
  {
    id: "bookmark", title: "Bookmark Page", keywords: "save star favorite", glyph: "star", needsTab: true,
    run: async ({ target }) => {
      await chrome.bookmarks.create({ title: target.title, url: target.url });
      return { toast: "Bookmarked" };
    },
  },
  {
    id: "reopen", title: "Reopen Closed Tab", keywords: "undo restore", glyph: "restore",
    run: async () => { await restoreClosedTab(); return { focusMoved: true }; },
  },
  {
    id: "new-window", title: "New Window", keywords: "open", glyph: "window",
    run: async () => { await chrome.windows.create({}); return { focusMoved: true }; },
  },
  {
    id: "incognito", title: "New Incognito Window", keywords: "private", glyph: "incognito",
    run: async () => { await chrome.windows.create({ incognito: true }); return { focusMoved: true }; },
  },
  { id: "history", title: "Open History", keywords: "visited", glyph: "history", run: openPage("chrome://history") },
  { id: "downloads", title: "Open Downloads", keywords: "files", glyph: "download", run: openPage("chrome://downloads") },
  { id: "bookmarks", title: "Open Bookmarks", keywords: "favorites", glyph: "star", run: openPage("chrome://bookmarks") },
  { id: "extensions", title: "Open Extensions", keywords: "addons plugins", glyph: "puzzle", run: openPage("chrome://extensions") },
  { id: "settings", title: "Open Settings", keywords: "preferences options chrome", glyph: "gear", run: openPage("chrome://settings") },
  { id: "clear-data", title: "Clear Browsing Data", keywords: "cache cookies history delete", glyph: "trash", run: openPage("chrome://settings/clearBrowserData") },
  { id: "shortcuts", title: "Keyboard Shortcuts", keywords: "hotkeys keys", glyph: "gear", run: openPage("chrome://extensions/shortcuts") },
  {
    id: "cmdly-settings", title: "Cmdly Settings", keywords: "preferences options configure cmdly", glyph: "gear",
    run: async () => { await chrome.runtime.openOptionsPage(); return { focusMoved: true }; },
  },
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
  return { toast: `Closed ${ids.length} tab${ids.length === 1 ? "" : "s"}` };
}

// ---------- public API ----------

/** In overlay mode commands act on the host page; on the palette page — on the tab before it. */
export async function commandTarget(host: chrome.tabs.Tab, overlay: boolean): Promise<chrome.tabs.Tab | undefined> {
  return overlay ? chrome.tabs.get(host.id!) : previousTab(host);
}

/** Up to 3 commands matching the query, as result rows. */
export function matchCommands(query: string, target: chrome.tabs.Tab | undefined): ResultItem[] {
  return COMMANDS.map((command) => {
    const title = typeof command.title === "function" ? command.title(target) : command.title;
    const relevance = Math.max(score(query, title), score(query, command.keywords) - 1);
    return { command, title, relevance };
  })
    .filter((x) => x.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3)
    .map(({ command, title }) => ({
      kind: "command" as const,
      commandId: command.id,
      title,
      glyph: command.glyph,
      url: "cmd:" + command.id,
      action: "Run",
    }));
}

export async function runCommand(id: string, host: chrome.tabs.Tab, overlay: boolean): Promise<CommandResult> {
  const command = COMMANDS.find((c) => c.id === id);
  if (!command) return {};
  const target = await commandTarget(host, overlay);
  if (command.needsTab && !target) return { toast: "No tab to act on", closePalette: !overlay };

  const { focusMoved, ...result } = (await command.run({ target: target!, host })) ?? {};
  if (overlay) return result;

  // Palette page: if the UI will show a toast, it closes the page itself afterwards.
  if (result.toast || result.copy) return { ...result, closePalette: true };
  if (focusMoved) await chrome.tabs.remove(host.id!).catch(() => {});
  else await dismissPalettePage(host).catch(() => {});
  return {};
}
