/**
 * "Keep window open" — decides what to do so that closing the last tab doesn't close the window.
 *
 * Idea: when a protected window is down to one real tab, a small pinned "guard" tab
 * (Cmdly's keep-open.html) is added. Closing that last real tab then leaves the guard,
 * the window survives, and Cmdly opens the command bar page as a fresh tab.
 * As soon as the window has 2+ real tabs again the guard is removed to keep the tab bar clean.
 *
 * Inspired by "Don't Close Window With Last Tab" (github.com/moneytoo/DontCloseWindowWithLastTab);
 * this is an independent implementation built around Cmdly's own new tab handling.
 *
 * This file is pure (no chrome.*): it gets a snapshot of windows and returns actions.
 * keep-open-service.ts takes the snapshot and executes the actions.
 */

import type { KeepOpenMode } from "../shared/settings.ts";

export interface TabSnapshot {
  id: number;
  /** Cmdly's pinned keep-open tab. */
  guard: boolean;
  /** A new tab page that Cmdly is about to replace with the bar — not a real tab yet. */
  transient: boolean;
  active: boolean;
  lastAccessed: number;
}

export interface WindowSnapshot {
  id: number;
  tabs: TabSnapshot[];
}

export type KeepOpenAction =
  | { type: "create-guard"; windowId: number }
  | { type: "remove-tab"; tabId: number }
  | { type: "open-bar"; windowId: number }
  | { type: "activate-tab"; tabId: number };

export function planKeepOpen(windows: WindowSnapshot[], mode: KeepOpenMode): KeepOpenAction[] {
  const actions: KeepOpenAction[] = [];

  for (const window of windows) {
    const guards = window.tabs.filter((t) => t.guard);
    const real = window.tabs.filter((t) => !t.guard && !t.transient);
    const protectedWindow = mode === "every" || (mode === "last" && windows.length === 1);

    if (!protectedWindow) {
      // Feature off, or another window still exists: the guard isn't needed.
      // A window holding nothing but the guard is left to close.
      guards.forEach((g) => actions.push({ type: "remove-tab", tabId: g.id }));
      continue;
    }

    // Extra guards (e.g. restored by Chrome after a restart) — keep one.
    guards.slice(1).forEach((g) => actions.push({ type: "remove-tab", tabId: g.id }));
    const guard = guards[0];

    if (real.length === 0) {
      // The user just closed the last tab. Transient tabs will become the bar themselves.
      if (guard && !window.tabs.some((t) => t.transient)) actions.push({ type: "open-bar", windowId: window.id });
      continue;
    }

    if (real.length === 1 && !guard) {
      actions.push({ type: "create-guard", windowId: window.id });
    } else if (real.length >= 2 && guard) {
      actions.push({ type: "remove-tab", tabId: guard.id });
      continue;
    }

    // Never leave the user looking at the guard page while there are real tabs.
    if (guard?.active) {
      const target = [...real].sort((a, b) => b.lastAccessed - a.lastAccessed)[0];
      actions.push({ type: "activate-tab", tabId: target.id });
    }
  }
  return actions;
}
