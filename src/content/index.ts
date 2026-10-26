/**
 * Always-on content script (every page, every frame). Handles Cmdly's own keyboard shortcuts:
 *   - open the command bar (when it is not Cmd+T — that one goes through the new tab page);
 *   - copy the page URL;
 *   - reopen the last closed tab.
 * The top frame also hosts the tab switcher (content/switcher.ts).
 * Shortcuts are configured on the options page and stored in Settings.shortcuts.
 */
import { send } from "../shared/messages.ts";
import { MOD } from "../shared/platform.ts";
import { DEFAULT_SETTINGS, type Settings } from "../shared/settings.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { matchesShortcut } from "../shared/shortcuts.ts";
import { copyText } from "../ui/clipboard.ts";
import { setLanguage, t } from "../i18n/index.ts";
import type { SwitcherMessage } from "../shared/switcher.ts";
import { handleSwitcherMessage, watchSwitcherSettings } from "./switcher.ts";
import { showPageToast } from "./toast.ts";

type GuardedWindow = Window & { __cmdlyContent?: boolean; __cmdlyModifierHeld?: boolean };

function start(): void {
  // onInstalled re-injects this script into open tabs; don't register twice.
  const w = window as GuardedWindow;
  if (w.__cmdlyContent) return;
  w.__cmdlyContent = true;

  let shortcuts: Settings["shortcuts"] = DEFAULT_SETTINGS.shortcuts;
  const apply = (s: Settings) => {
    shortcuts = s.shortcuts;
    setLanguage(s.appearance.language);
  };
  settingsRepository.get().then(apply);
  settingsRepository.onChange(apply);

  // "Copy page URL" assigned at chrome://extensions/shortcuts: Chrome handles the key, the background asks us.
  chrome.runtime.onMessage.addListener((message: { type?: string }) => {
    if (window !== window.top) return;
    if (message?.type === "copy-url") copyPageUrl();
    if (message?.type === "switcher-show" || message?.type === "switcher-release") handleSwitcherMessage(message as SwitcherMessage);
  });
  if (window === window.top) watchSwitcherSettings();

  trackModifiers(w);

  // Capture phase on window = we see the key before any page handler can stop it.
  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.isComposing) return;

    // Cmd+T never reaches web pages, so only a custom open shortcut is handled here.
    if (shortcuts.openBar !== `${MOD}+KeyT` && matchesShortcut(e, shortcuts.openBar)) {
      claim(e);
      send({ type: "open-bar" });
      return;
    }

    if (matchesShortcut(e, shortcuts.copyUrl)) {
      claim(e);
      copyPageUrl();
      return;
    }

    if (matchesShortcut(e, shortcuts.undoClose) && !isTextFieldFocused()) {
      // Decide after the page has handled the key: apps with their own undo
      // (Figma, Miro, Google Docs) call preventDefault and are left alone.
      setTimeout(() => {
        if (!e.defaultPrevented) send({ type: "restore-tab" });
      }, 0);
    }
  }, true);
}

/**
 * The tab switcher shortcut is handled by Chrome, so the switcher (injected later, same isolated
 * world) can't tell a quick tap from "still holding the modifier". The page does see the modifier
 * itself go down and up — remember it here. A tap switches to the previous tab without any UI.
 */
function trackModifiers(w: GuardedWindow): void {
  let ctrl = false;
  // The background needs Ctrl to recognise Chrome's own Ctrl+Tab (see switcher-service.ts).
  const reportCtrl = (held: boolean) => {
    if (held === ctrl) return;
    ctrl = held;
    send({ type: "ctrl-state", held });
  };
  const update = (e: KeyboardEvent) => {
    if (window === window.top) w.__cmdlyModifierHeld = e.ctrlKey || e.altKey || e.metaKey;
    // After Ctrl+Tab the release lands in a tab that never saw Ctrl go down — report it anyway.
    if (e.type === "keyup" && e.key === "Control" && !ctrl) send({ type: "ctrl-state", held: false });
    reportCtrl(e.ctrlKey);
  };
  window.addEventListener("keydown", update, true);
  window.addEventListener("keyup", update, true);
  // Focus left the page (address bar, another app): keys are no longer visible from here.
  // Not when the tab itself was hidden — that is Ctrl+Tab at work, and Ctrl is still down.
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
  });
  window.addEventListener("blur", () => {
    setTimeout(() => {
      // The tab may already be visible again: the background undoes Ctrl+Tab within milliseconds.
      if (document.hidden || Date.now() - hiddenAt < 500) return;
      w.__cmdlyModifierHeld = false;
      reportCtrl(false);
    }, 50);
  });
}

/** Our shortcut wins over the page's and the browser's handlers for the same keys. */
function claim(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopImmediatePropagation();
}

async function copyPageUrl(): Promise<void> {
  // In an iframe location.href is the frame's URL — ask the background for the tab's URL instead.
  const url = window === window.top ? location.href : await send({ type: "tab-url" });
  if (!url) return;
  await copyText(url);
  showPageToast(t("urlCopied"));
}

function isTextFieldFocused(): boolean {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") {
    const nonText = ["button", "checkbox", "radio", "submit", "reset", "image", "file", "range", "color"];
    return !nonText.includes((el as HTMLInputElement).type);
  }
  return false;
}

start();
