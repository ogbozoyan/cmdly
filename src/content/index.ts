/**
 * Always-on content script (every page, every frame). Handles Cmdly's own keyboard shortcuts:
 *   - open the command bar (when it is not Cmd+T — that one goes through the new tab page);
 *   - copy the page URL;
 *   - reopen the last closed tab.
 * Shortcuts are configured on the options page and stored in Settings.shortcuts.
 */
import { send } from "../shared/messages.ts";
import { MOD } from "../shared/platform.ts";
import { DEFAULT_SETTINGS, type Settings } from "../shared/settings.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { matchesShortcut } from "../shared/shortcuts.ts";
import { copyText } from "../ui/clipboard.ts";
import { t } from "../i18n/index.ts";
import { showPageToast } from "./toast.ts";

type GuardedWindow = Window & { __cmdlyContent?: boolean };

function start(): void {
  // onInstalled re-injects this script into open tabs; don't register twice.
  const w = window as GuardedWindow;
  if (w.__cmdlyContent) return;
  w.__cmdlyContent = true;

  let shortcuts: Settings["shortcuts"] = DEFAULT_SETTINGS.shortcuts;
  settingsRepository.get().then((s) => (shortcuts = s.shortcuts));
  settingsRepository.onChange((s) => (shortcuts = s.shortcuts));

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
