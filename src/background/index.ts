/**
 * Background service worker — entry point. Only wires Chrome events to services;
 * all logic lives in the *-service.ts files.
 */
import type { Request } from "../shared/messages.ts";
import { openBar } from "./bar-service.ts";
import { watchBarState } from "./bar-state-service.ts";
import { watchKeepOpen } from "./keep-open-service.ts";
import { route } from "./router.ts";

// "Keep window open": closing the last tab doesn't close the window.
watchKeepOpen();

// The bar survives a page reload and keeps what was typed (Arc behaviour).
watchBarState();

// Messages from the command bar, content scripts and extension pages.
chrome.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
  if (!sender.tab) return false;
  route(request, sender.tab).then(sendResponse, (error) => {
    console.error(`[cmdly] ${request.type} failed`, error);
    sendResponse(null);
  });
  return true; // keep the channel open for the async response
});

// Toolbar button and the optional shortcut from chrome://extensions/shortcuts.
chrome.action.onClicked.addListener(openBar);
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "open-bar") openBar(tab);
});

// Chrome doesn't add content scripts to tabs that were open before install/update — inject them now.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // First install: the settings page explains the one-time ⌘T setup that removes the new tab flash.
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) chrome.runtime.openOptionsPage();

  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*", "file://*/*"] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id!, allFrames: true }, files: ["content.js"] })
      .catch(() => {}); // tab closed or restricted page
  }
});
