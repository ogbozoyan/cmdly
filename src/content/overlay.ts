/**
 * Injected into a web page on demand (bar-service.showOverlay).
 * Draws the command bar inside a shadow root, so page styles can't break it and it can't break the page.
 * Running it again while the bar is open closes it (toggle).
 */
import { send } from "../shared/messages.ts";
import { CommandBar } from "../ui/command-bar.ts";
import { log } from "../shared/log.ts";
import { initLogging } from "../shared/log-runtime.ts";

const HOST_ID = "cmdly-overlay";

initLogging("overlay");

type HostElement = HTMLElement & { cmdlyClose?: () => void };

function toggleOverlay(): void {
  const existing = document.getElementById(HOST_ID) as HostElement | null;
  if (existing) {
    existing.cmdlyClose?.();
    return;
  }

  const previousFocus = document.activeElement as HTMLElement | null;
  const host: HostElement = document.createElement("div");
  host.id = HOST_ID;
  // Hidden until the stylesheet loads — avoids a flash of unstyled content.
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; visibility: hidden;";

  const shadow = host.attachShadow({ mode: "open" });
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("ui.css");
  shadow.append(stylesheet);

  // Keystrokes in the bar must not reach the page's own shortcuts (YouTube "k", GitHub "/"…).
  for (const type of ["keydown", "keyup", "keypress", "input"]) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  let closed = false;
  const close = (restoreFocus = true) => {
    if (closed) return;
    closed = true;
    host.remove();
    clearInterval(focusTimer);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    clearTimeout(hiddenTimer);
    send({ type: "overlay-state", open: false });
    // Not when the user went to the address bar: that would pull the focus back from it.
    if (restoreFocus) previousFocus?.focus?.();
  };
  host.cmdlyClose = () => close();

  // Clicking the address bar or other browser UI leaves the page without any click on it. Only
  // counts once the page had focus: the bar may be opened while the address bar still holds it.
  let hadFocus = document.hasFocus();
  const checkFocus = () => {
    if (document.hasFocus()) hadFocus = true;
    else if (hadFocus && !document.hidden) close(false);
  };
  const onBlur = () => setTimeout(checkFocus, 50);
  // Switching to another tab ends the bar's session: coming back must not show a stale bar. Only once
  // the page was visible — the ⌘T fallback injects the bar while the previous tab is still hidden.
  let seenVisible = !document.hidden;
  // A reload or navigation hides the page too, and the bar must come back after a reload (see
  // bar-state-service.ts): wait a moment — a page that is going away never gets to the timer.
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  const onVisibility = () => {
    clearTimeout(hiddenTimer);
    if (!document.hidden) seenVisible = true;
    else if (seenVisible) hiddenTimer = setTimeout(() => document.hidden && close(false), 150);
  };
  document.addEventListener("visibilitychange", onVisibility);
  const focusTimer = setInterval(checkFocus, 150);
  window.addEventListener("blur", onBlur);

  document.documentElement.appendChild(host);
  const bar = new CommandBar(shadow, { overlay: true, close: () => close() });
  log.debug("overlay", "opened");
  send({ type: "overlay-state", open: true });

  stylesheet.onload = () => {
    host.style.visibility = "visible";
    bar.input.focus(); // some pages grab focus while loading
  };
}

toggleOverlay();
