import { t, tp } from "../i18n/index.ts";
import { atLeast, formatEntry, LIVE_VIEW_KB, LOG_TAIL_PORT, LogRing, type LogEntry, type LogLevel, type LogTailMessage } from "../shared/log.ts";

/**
 * Settings → Diagnostics: the log as it happens, like `oc logs -f`.
 *
 * Bounded on purpose — the page can stay open for hours:
 *  - the view holds at most LIVE_VIEW_KB of entries (a LogRing); each entry dropped from the ring
 *    removes its line from the page, so the DOM never grows past it;
 *  - the port to the background is open only while the section is visible, and closed on pagehide;
 *  - lines are added in one batch per animation frame, however fast entries arrive.
 */

const RECONNECT_MS = 1000;

export interface LogViewElements {
  view: HTMLElement;
  status: HTMLElement;
  level: HTMLSelectElement;
  filter: HTMLInputElement;
  pause: HTMLButtonElement;
}

export class LogView {
  private readonly ring = new LogRing(LIVE_VIEW_KB * 1024);
  private port: chrome.runtime.Port | null = null;
  private active = false;
  private paused = false;
  /** Entries that arrived while paused (already in the ring, not yet on the page). */
  private missed = 0;
  private pending: LogEntry[] = [];
  private frame = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly el: LogViewElements;

  constructor(el: LogViewElements) {
    this.el = el;
    el.level.addEventListener("change", () => this.applyFilter());
    el.filter.addEventListener("input", () => this.applyFilter());
    el.pause.addEventListener("click", () => this.setPaused(!this.paused));
    window.addEventListener("pagehide", () => this.setActive(false));
  }

  /** Follows the log only while the Diagnostics section is on screen. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (active) this.connect();
    else this.disconnect();
  }

  private connect(): void {
    clearTimeout(this.reconnectTimer);
    const port = chrome.runtime.connect({ name: LOG_TAIL_PORT });
    this.port = port;
    port.onMessage.addListener((message: LogTailMessage) => this.receive(message));
    // Chrome stops an idle service worker, which closes the port: follow it when it comes back.
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      this.port = null;
      this.renderStatus();
      if (this.active) this.reconnectTimer = setTimeout(() => this.active && this.connect(), RECONNECT_MS);
    });
    this.renderStatus();
  }

  private disconnect(): void {
    clearTimeout(this.reconnectTimer);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pending = [];
    const port = this.port;
    this.port = null;
    port?.disconnect();
  }

  private receive(message: LogTailMessage): void {
    switch (message.type) {
      case "snapshot":
        // A reconnect sends the tail again: start over from it instead of duplicating lines.
        this.ring.clear();
        for (const entry of message.entries) this.ring.push(entry);
        this.missed = 0;
        this.renderAll();
        return;
      case "cleared":
        this.ring.clear();
        this.missed = 0;
        this.renderAll();
        return;
      case "entry":
        if (this.paused) {
          this.ring.push(message.entry);
          this.missed++;
          this.renderStatus();
          return;
        }
        this.pending.push(message.entry);
        this.frame ||= requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    this.frame = 0;
    const { view } = this.el;
    const follow = view.scrollHeight - view.scrollTop - view.clientHeight < 24;
    const batch = document.createDocumentFragment();
    let dropped = 0;
    for (const entry of this.pending) {
      dropped += this.ring.push(entry);
      batch.append(this.line(entry));
    }
    this.pending = [];
    view.append(batch);
    // Every entry the ring dropped had a line on the page; the batch may be longer than the ring.
    for (let i = 0; i < dropped && view.firstChild; i++) view.firstChild.remove();
    if (follow) view.scrollTop = view.scrollHeight;
  }

  private renderAll(): void {
    const { view } = this.el;
    view.replaceChildren(...this.ring.toArray().map((entry) => this.line(entry)));
    view.scrollTop = view.scrollHeight;
    this.renderStatus();
  }

  private line(entry: LogEntry): HTMLElement {
    const div = document.createElement("div");
    div.className = `line ${entry.level}`;
    div.textContent = formatEntry(entry); // text, never HTML
    div.dataset.level = entry.level;
    if (!this.matches(div)) div.classList.add("hidden");
    return div;
  }

  private matches(line: HTMLElement): boolean {
    const min = this.el.level.value as LogLevel;
    const needle = this.el.filter.value.trim().toLowerCase();
    return atLeast(line.dataset.level as LogLevel, min) && (!needle || line.textContent!.toLowerCase().includes(needle));
  }

  private applyFilter(): void {
    for (const line of this.el.view.children) line.classList.toggle("hidden", !this.matches(line as HTMLElement));
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.el.pause.textContent = t(paused ? "optLogResume" : "optLogPause");
    if (!paused && this.missed) {
      this.missed = 0;
      this.renderAll();
    }
    this.renderStatus();
  }

  private renderStatus(): void {
    const { status } = this.el;
    status.classList.toggle("paused", this.paused);
    status.classList.toggle("offline", !this.port && this.active);
    if (!this.port && this.active) status.textContent = t("optLogReconnecting");
    else if (this.paused) status.textContent = this.missed ? tp("optLogPausedNew", this.missed) : t("optLogPaused");
    else status.textContent = t("optLogLive");
  }
}
