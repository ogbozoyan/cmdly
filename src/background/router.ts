import type { Request, ResponseMap } from "../shared/messages.ts";
import { dismissPalettePage, handleNewTab, openBar } from "./bar-service.ts";
import { runCommand } from "./command-service.ts";
import { open } from "./navigation-service.ts";
import { search } from "./search-service.ts";
import { restoreClosedTab } from "./tab-service.ts";

/**
 * Message router — the "controller" of the background.
 * Maps each request type (see src/shared/messages.ts) to a service call.
 * `sender` is the tab the message came from: the page with the overlay or the palette page.
 */
export async function route(request: Request, sender: chrome.tabs.Tab): Promise<ResponseMap[Request["type"]]> {
  switch (request.type) {
    case "search":
      return search(request.query, sender, request.overlay);
    case "open":
      return open(request, sender);
    case "command":
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
  }
}
