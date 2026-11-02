import { log } from "../shared/log.ts";

/**
 * Puts a Cmdly UI host on the page so that it shows over a fullscreen element (a video, a player).
 * Chrome draws that element above everything else on the page: an ordinary element, a popover or a
 * non-modal dialog stays underneath. Only a modal dialog is drawn above it.
 *  - A player container takes children: the UI goes inside it and the page stays interactive.
 *  - A <video> or an <iframe> draws only its own content: the UI goes into a modal dialog, so the rest
 *    of the page is inert while it is shown.
 * The host is a <div> (a <dialog> can't hold a shadow root), so it sits inside a <dialog> frame that
 * carries the modal state. Take a host off the page with removeUi().
 */
const CONTENT_ONLY = new Set(["video", "iframe", "img", "canvas", "embed", "object"]);

export function showUi(host: HTMLElement): void {
  const frame = document.createElement("dialog");
  frame.setAttribute("data-cmdly-frame", "");
  // The frame never takes clicks; the host does. A toast in the corner must not block the page.
  frame.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
  frame.append(host);

  const fullscreen = document.fullscreenElement;
  if (!fullscreen) {
    document.documentElement.append(frame);
    frame.show();
    return;
  }
  // A shadow host renders light-DOM children only if its shadow tree has a <slot>: treat it like a video.
  if (!(fullscreen instanceof HTMLElement) || CONTENT_ONLY.has(fullscreen.localName) || fullscreen.shadowRoot) {
    // Escape closes a modal dialog by itself; the UI handles Escape on its own.
    frame.addEventListener("cancel", (e) => e.preventDefault());
    document.documentElement.append(frame);
    frame.showModal();
    holdEscape();
    return;
  }
  fullscreen.append(frame);
  frame.show();
  holdEscape();
  returnWhenFullscreenEnds(frame, host);
}

export function removeUi(host: HTMLElement): void {
  (host.closest("dialog") ?? host).remove();
  releaseEscape();
}

interface KeyboardLock {
  lock(keyCodes: string[]): Promise<void>;
  unlock(): void;
}

/** Keyboard Lock is Chrome's; the TypeScript DOM library doesn't declare it. */
function keyboard(): KeyboardLock | undefined {
  return (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
}

/**
 * Chrome leaves fullscreen on Esc before the page sees the key. While Cmdly's UI is shown over a
 * fullscreen element, Esc is held for the page instead: the UI closes first, the next Esc leaves
 * fullscreen. (Chrome always lets a long press of Esc through.)
 */
function holdEscape(): void {
  watchEscape();
  releasePending = false;
  keyboard()?.lock(["Escape"]).catch((error: unknown) => log.warn("ui", "Esc not held over fullscreen", error));
}

/**
 * Chrome decides what an Esc press does on key-down and again on key-up. The UI usually closes on the
 * key-down itself, so the lock is released only after that key-up; released earlier, the key-up leaves
 * fullscreen.
 */
let escapeDown = false;
let releasePending = false;
let watching = false;

function watchEscape(): void {
  if (watching) return;
  watching = true;
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") escapeDown = true;
  }, true);
  window.addEventListener("keyup", (e) => {
    if (e.key !== "Escape") return;
    escapeDown = false;
    // Chrome looks at an Esc the page left unhandled once the page has answered: that is after the lock is gone.
    if (releasePending) e.preventDefault();
    flushRelease();
  }, true);
}

function flushRelease(): void {
  if (!releasePending || escapeDown) return;
  releasePending = false;
  keyboard()?.unlock();
}

function releaseEscape(): void {
  if (!document.fullscreenElement || document.querySelector("[data-cmdly-frame]")) return;
  releasePending = true;
  // Next task: by then the key-down that may have closed the UI has been dispatched completely.
  setTimeout(flushRelease, 0);
}

/** Fullscreen can end while the UI is open (Esc): the frame then moves back to the page's top level. */
function returnWhenFullscreenEnds(frame: HTMLElement, host: HTMLElement): void {
  const back = () => {
    if (!frame.isConnected) {
      document.removeEventListener("fullscreenchange", back);
      return;
    }
    if (document.fullscreenElement || frame.parentElement === document.documentElement) return;
    const focused = host.shadowRoot?.activeElement as HTMLElement | null | undefined;
    document.documentElement.append(frame);
    focused?.focus();
  };
  document.addEventListener("fullscreenchange", back);
}
