import { setLanguage } from "../i18n/index.ts";
import type { Request, ResponseMap } from "../shared/messages.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { dismissPalettePage, handleNewTab, openBar } from "./bar-service.ts";
import { loadDraft, markOverlay, saveDraft } from "./bar-state-service.ts";
import { runCommand } from "./command-service.ts";
import { open } from "./navigation-service.ts";
import { search } from "./search-service.ts";
import { suggest } from "./suggest-service.ts";
import { setCtrlState, setSwitcherState, switchTab, switcherTabs } from "./switcher-service.ts";
import { restoreClosedTab } from "./tab-service.ts";

/**
 * Message router — the "controller" of the background.
 * Maps each request type (see src/shared/messages.ts) to a service call.
 * `sender` is the tab the message came from: the page with the overlay or the palette page.
 */
export async function route(request: Request, sender: chrome.tabs.Tab): Promise<ResponseMap[Request["type"]]> {
  // The service worker can restart at any time: apply the chosen UI language on every request.
  setLanguage((await settingsRepository.get()).appearance.language);
  switch (request.type) {
    case "search":
      return search(request.query, sender, request.overlay);
    case "suggest":
      return suggest(request.query, sender);
    case "draft-save":
      return saveDraft(request.draft);
    case "draft-get":
      return loadDraft();
    case "overlay-state":
      return markOverlay(sender, request.open);
    // Running something ends the bar's session: a "Reload tab" must not bring it back.
    case "open":
      await markOverlay(sender, false);
      return open(request, sender);
    case "command":
      await markOverlay(sender, false);
      return runCommand(request.id, sender, request.overlay);
    case "newtab-opened":
      return handleNewTab(sender);
    case "dismiss-page":
      return dismissPalettePage(sender);
    case "restore-tab":
      return restoreClosedTab();
    case "open-bar":
      return openBar(sender);
    case "tab-url":
      return sender.url ?? null;
    case "switcher-tabs":
      return switcherTabs(sender);
    case "switch-tab":
      return switchTab(request.tabId);
    case "ctrl-state":
      return setCtrlState(sender, request.held);
    case "switcher-state":
      return setSwitcherState(sender, request.open);
  }
}
