import { settingsRepository } from "../shared/settings-repository.ts";
import { openPalettePageIn } from "./bar-service.ts";
import { planKeepOpen, type KeepOpenAction, type WindowSnapshot } from "./keep-open-plan.ts";
import { GUARD_URL, isGuardTab } from "./tab-service.ts";
import { log } from "../shared/log.ts";

/**
 * Runs the "keep window open" plan whenever tabs or windows change.
 * The decisions live in keep-open-plan.ts; this file only reads Chrome state and applies actions.
 */

/** Tab events arrive in bursts (closing a window fires one per tab) — wait for them to settle. */
const DEBOUNCE_MS = 120;

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let rerun = false;

/** Subscribes to tab/window events. Called once from background/index.ts. */
export function watchKeepOpen(): void {
  const schedule = () => scheduleReconcile();
  chrome.tabs.onCreated.addListener(schedule);
  chrome.tabs.onRemoved.addListener(schedule);
  chrome.tabs.onAttached.addListener(schedule);
  chrome.tabs.onDetached.addListener(schedule);
  chrome.tabs.onActivated.addListener(schedule);
  chrome.tabs.onUpdated.addListener((_id, change) => {
    if (change.url || change.pinned !== undefined) schedule();
  });
  chrome.windows.onCreated.addListener(schedule);
  chrome.windows.onRemoved.addListener(schedule);
  chrome.runtime.onStartup.addListener(schedule);
  settingsRepository.onChange(schedule);
  schedule();
}

export function scheduleReconcile(): void {
  clearTimeout(timer);
  timer = setTimeout(reconcile, DEBOUNCE_MS);
}

/** One pass at a time; events that arrive meanwhile trigger exactly one more pass. */
async function reconcile(): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    const { windows } = await settingsRepository.get();
    const actions = planKeepOpen(await snapshot(), windows.keepOpen);
    for (const action of actions) await apply(action);
    // Our own changes fire tab events too; one follow-up pass confirms a stable state.
    if (actions.length) rerun = true;
  } catch (error) {
    log.error("keep-open", "failed", error);
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      scheduleReconcile();
    }
  }
}

async function snapshot(): Promise<WindowSnapshot[]> {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  return windows.map((w) => ({
    id: w.id!,
    tabs: (w.tabs ?? []).map((t) => ({
      id: t.id!,
      guard: isGuardTab(t),
      transient: (t.url || t.pendingUrl || "").startsWith("chrome://newtab"),
      active: t.active,
      lastAccessed: t.lastAccessed ?? 0,
    })),
  }));
}

async function apply(action: KeepOpenAction): Promise<void> {
  try {
    switch (action.type) {
      case "create-guard":
        await chrome.tabs.create({ windowId: action.windowId, url: GUARD_URL, pinned: true, active: false, index: 0 });
        return;
      case "remove-tab":
        await chrome.tabs.remove(action.tabId);
        return;
      case "open-bar":
        await openPalettePageIn(action.windowId);
        return;
      case "activate-tab":
        await chrome.tabs.update(action.tabId, { active: true });
        return;
    }
  } catch (error) {
    log.debug("keep-open", "action skipped", error);
    // The tab or window disappeared in the meantime — the next pass sees the new state.
  }
}
