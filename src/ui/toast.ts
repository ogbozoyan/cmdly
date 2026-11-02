/**
 * Notifications in the top-right corner of a page ("URL copied"). They live in their own shadow root,
 * independent of the command bar: closing or reopening the bar neither removes a toast nor waits for it.
 * Several at once stack: a new one slides in on top and pushes the others down; a finished one collapses
 * and the rest slide back up.
 */
import { removeUi, showUi } from "./mount.ts";

const FADE_MS = 300;
const HOST_ID = "cmdly-toasts";

const STYLE = `
  :host { all: initial; position: fixed; top: 12px; right: 12px; z-index: 2147483647; pointer-events: none; }
  .slot {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows ${FADE_MS}ms ease;
  }
  .slot.shown { grid-template-rows: 1fr; }
  .slot > div { overflow: hidden; min-height: 0; padding: 0 8px; }
  .toast {
    margin: 8px 0 0;
    padding: 12px 20px;
    border-radius: 8px;
    background: rgba(30, 30, 35, 0.95);
    color: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    font: 500 14px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    opacity: 0;
    transform: translateY(-6px);
    transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease;
  }
  .slot.shown .toast { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { .slot, .toast { transition: none; } }
`;

function stackHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${STYLE}</style><div class="stack"></div>`;
    window.addEventListener("keydown", closeOnEscape, true);
    showUi(host);
  }
  return host;
}

/** Over a fullscreen video Esc is held for Cmdly (ui/mount.ts): the toasts go first, then fullscreen. */
function closeOnEscape(e: KeyboardEvent): void {
  const host = document.getElementById(HOST_ID);
  if (!host || e.key !== "Escape" || !document.fullscreenElement) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  dismiss(host);
}

/** A timer of an earlier toast may still run: it only removes the host it was shown in. */
function dismiss(host: HTMLElement): void {
  window.removeEventListener("keydown", closeOnEscape, true);
  removeUi(host);
}

export function showPageToast(text: string, durationMs = 2000): void {
  const host = stackHost();
  const list = host.shadowRoot!.querySelector<HTMLElement>(".stack")!;
  const slot = document.createElement("div");
  slot.className = "slot";
  const inner = document.createElement("div");
  const box = document.createElement("div");
  box.className = "toast";
  box.setAttribute("role", "status");
  box.textContent = text;
  inner.append(box);
  slot.append(inner);
  list.prepend(slot);
  void slot.offsetHeight; // commit the collapsed state so the slide-in animates
  slot.classList.add("shown");

  setTimeout(() => {
    slot.classList.remove("shown");
    setTimeout(() => {
      slot.remove();
      if (!list.children.length && host.isConnected) dismiss(host);
    }, FADE_MS);
  }, Math.max(durationMs - FADE_MS, 0));
}
