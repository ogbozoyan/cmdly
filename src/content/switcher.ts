/**
 * Tab switcher UI (Arc's Ctrl+Tab), part of the always-on content script (top frame only).
 * The background sends "switcher-show" on every press: the first one opens it, the next ones move
 * the selection. Releasing the modifier, Enter or a click switches; Esc or a click outside cancels.
 *
 * Built for speed: no script injection per press, styles inlined (no stylesheet to wait for),
 * no animations, and the background answers from its in-memory preview cache.
 */
import css from "./switcher.css";
import { setLanguage, t } from "../i18n/index.ts";
import { send } from "../shared/messages.ts";
import type { Settings } from "../shared/settings.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { fitCount, initialIndex, step, type SwitcherMessage, type SwitcherTab } from "../shared/switcher.ts";

const HOST_ID = "cmdly-switcher";

type TrackedWindow = Window & {
  /** Set by content/index.ts; undefined = unknown, treated as held. */
  __cmdlyModifierHeld?: boolean;
};

interface OpenSwitcher {
  move(delta: number): void;
  commit(): void;
}

let current: OpenSwitcher | null = null;
/** Read ahead of time so opening doesn't wait for storage. */
let settings: Settings | null = null;

export function watchSwitcherSettings(): void {
  settingsRepository.get().then((s) => (settings = s));
  settingsRepository.onChange((s) => (settings = s));
}

export function handleSwitcherMessage(message: SwitcherMessage): void {
  if (message.type === "switcher-release") {
    (window as TrackedWindow).__cmdlyModifierHeld = false;
    current?.commit();
    return;
  }
  if (current) return current.move(message.delta);
  // The modifier is already up: a quick tap means "previous tab", like Arc — no UI at all.
  if ((window as TrackedWindow).__cmdlyModifierHeld === false) {
    quickSwitch();
    return;
  }
  current = mount(message.delta === -1);
}

async function quickSwitch(): Promise<void> {
  const tabs = await send({ type: "switcher-tabs" });
  const target = tabs?.[initialIndex(tabs.length)];
  if (target && target !== tabs[0]) await send({ type: "switch-tab", tabId: target.tabId });
}

function mount(backwards: boolean): OpenSwitcher {
  // The command bar and the switcher are never on screen together (and the bar would end up in previews).
  (document.getElementById("cmdly-overlay") as (HTMLElement & { cmdlyClose?: () => void }) | null)?.cmdlyClose?.();
  const previousFocus = document.activeElement as HTMLElement | null;
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = css;
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.tabIndex = -1;
  panel.setAttribute("role", "listbox");
  const list = document.createElement("ul");
  panel.append(list);
  wrap.append(panel);
  shadow.append(style, wrap);

  const s = settings;
  const overflow = s?.switcher.overflow ?? "fit";
  if (s) {
    setLanguage(s.appearance.language);
    const a = s.appearance;
    const dark = a.theme === "dark" || (a.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    wrap.classList.toggle("light", !dark);
    wrap.style.setProperty("--accent", a.accent);
  }
  wrap.classList.add(`overflow-${overflow}`);
  panel.setAttribute("aria-label", t("switcherLabel"));

  let tabs: SwitcherTab[] | null = null;
  let index = 0;
  /** Presses that came before the tab list did. */
  let queuedMoves = 0;
  /** Released before the tab list arrived — switch as soon as it does. */
  let released = false;
  let closed = false;
  let pointer: { x: number; y: number } | null = null;

  const select = (next: number) => {
    if (!tabs) return;
    list.children[index]?.classList.remove("active");
    list.children[index]?.setAttribute("aria-selected", "false");
    index = next;
    list.children[index]?.classList.add("active");
    list.children[index]?.setAttribute("aria-selected", "true");
    list.children[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const move = (delta: number) => {
    if (tabs) select(step(index, tabs.length, delta));
    else queuedMoves += delta;
  };

  const close = () => {
    if (closed) return;
    closed = true;
    current = null;
    host.remove();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    clearTimeout(hiddenTimer);
    clearInterval(focusTimer);
    send({ type: "switcher-state", open: false });
    previousFocus?.focus?.();
  };

  const commit = () => {
    if (!tabs) {
      released = true;
      return;
    }
    const target = tabs[index];
    close();
    if (target && index !== 0) send({ type: "switch-tab", tabId: target.tabId });
  };

  /** Cards per row: 1-step moves when the cards are on one line, a row when they wrap. */
  const columns = () => {
    const cards = [...list.children] as HTMLElement[];
    const perRow = cards.filter((li) => li.offsetTop === cards[0]?.offsetTop).length;
    return perRow < cards.length ? perRow : 1;
  };

  // Window capture listeners: they run before the page's own handlers, even if focus stays in an iframe.
  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      Tab: () => move(e.shiftKey ? -1 : 1),
      ArrowRight: () => move(1),
      ArrowLeft: () => move(-1),
      ArrowDown: () => move(columns()),
      ArrowUp: () => move(-columns()),
      Enter: commit,
      Escape: close,
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    action();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (["Control", "Alt", "Meta"].includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.stopImmediatePropagation();
      commit();
    }
  };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  // Another app or the address bar took focus. A hidden page is different: Ctrl+Tab makes Chrome
  // show the neighbour tab for a moment before the background brings this one back.
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  let hiddenAt = 0;
  // blur comes before visibilitychange, so decide a moment later.
  const onBlur = () =>
    setTimeout(() => {
      if (!document.hidden && Date.now() - hiddenAt > 500) close();
    }, 50);
  const onVisibility = () => {
    clearTimeout(hiddenTimer);
    if (document.hidden) hiddenAt = Date.now();
    if (document.hidden) hiddenTimer = setTimeout(close, 700);
    else panel.focus();
  };
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);
  // Clicking the address bar or another browser UI doesn't always fire `blur` on the page (never if
  // the page didn't have focus when the switcher opened), so also watch the focus itself.
  let hadFocus = document.hasFocus();
  const focusTimer = setInterval(() => {
    if (document.hasFocus()) hadFocus = true;
    else if (hadFocus && !document.hidden && Date.now() - hiddenAt > 500) close();
  }, 150);
  wrap.addEventListener("mousedown", (e) => {
    if (!panel.contains(e.target as Node)) close();
  });

  // Hidden until the cards arrive: an empty panel would flash first.
  wrap.hidden = true;
  document.documentElement.appendChild(host);
  panel.focus();
  send({ type: "switcher-state", open: true });

  send({ type: "switcher-tabs" }).then((result) => {
    if (closed) return;
    if (!result || result.length < 2) return close();
    tabs = overflow === "fit" ? result.slice(0, fitCount(window.innerWidth)) : result;
    list.append(...tabs.map((tab, i) => card(tab, i)));
    wrap.hidden = false;
    const first = backwards ? tabs.length - 1 : initialIndex(tabs.length);
    index = first;
    select(step(first, tabs.length, queuedMoves));
    if (released) commit();
  });

  function card(tab: SwitcherTab, i: number): HTMLLIElement {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.title = tab.title;

    const preview = document.createElement("div");
    preview.className = "preview";
    if (tab.thumbnail) {
      const shot = document.createElement("img");
      shot.className = "shot";
      shot.src = tab.thumbnail;
      shot.alt = "";
      preview.append(shot);
    } else {
      preview.classList.add("empty");
      preview.append(icon(tab.icon, "big"));
    }

    const label = document.createElement("div");
    label.className = "label";
    const title = document.createElement("span");
    title.textContent = tab.title;
    label.append(icon(tab.icon, "favicon"), title);

    li.append(preview, label);
    // Only a real pointer move selects: Chrome also fires mousemove when the tab is shown again
    // (after Ctrl+Tab) or when a card appears under a resting cursor.
    li.addEventListener("mousemove", (e) => {
      const moved = pointer !== null && (pointer.x !== e.screenX || pointer.y !== e.screenY);
      pointer = { x: e.screenX, y: e.screenY };
      if (moved && index !== i) select(i);
    });
    li.addEventListener("click", () => {
      select(i);
      commit();
    });
    return li;
  }

  return { move, commit };
}

function icon(src: string, className: string): HTMLImageElement {
  const img = document.createElement("img");
  img.className = className;
  img.src = src;
  img.alt = "";
  return img;
}
