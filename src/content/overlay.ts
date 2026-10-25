/**
 * Injected into a web page on demand (bar-service.showOverlay).
 * Draws the command bar inside a shadow root, so page styles can't break it and it can't break the page.
 * Running it again while the bar is open closes it (toggle).
 */
import { send } from "../shared/messages.ts";
import { CommandBar } from "../ui/command-bar.ts";

const HOST_ID = "cmdly-overlay";

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

  const close = () => {
    host.remove();
    send({ type: "overlay-state", open: false });
    previousFocus?.focus?.();
  };
  host.cmdlyClose = close;

  document.documentElement.appendChild(host);
  const bar = new CommandBar(shadow, { overlay: true, close });
  send({ type: "overlay-state", open: true });

  stylesheet.onload = () => {
    host.style.visibility = "visible";
    bar.input.focus(); // some pages grab focus while loading
  };
}

toggleOverlay();
