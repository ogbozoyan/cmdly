/**
 * Tab switcher (Arc's Ctrl+Tab): recent tabs as cards, hold the modifier and press the key again
 * to move, release to switch. Pure helpers shared by the background and the switcher UI.
 */

/** One card in the switcher. */
export interface SwitcherTab {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  icon: string;
  /** Downscaled JPEG data URL of the page as it looked last time; absent if none or previews are off. */
  thumbnail?: string;
}

/** Cards shown at most — older tabs are still reachable from the command bar. */
export const MAX_SWITCHER_TABS = 10;

/** Thumbnail width in pixels: enough for a sharp card on a Retina screen, small in memory. */
export const THUMBNAIL_WIDTH = 360;

interface RecentTab {
  id?: number;
  active?: boolean;
  lastAccessed?: number;
}

/** Most recently used first; the active tab always leads, so the second card is "the previous tab". */
export function recentFirst<T extends RecentTab>(tabs: T[], limit = MAX_SWITCHER_TABS): T[] {
  return [...tabs]
    .sort((a, b) => Number(!!b.active) - Number(!!a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
    .slice(0, limit);
}

/** Moves the selection by `delta` cards, wrapping around both ends. */
export function step(index: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/** Card the switcher starts on: the previous tab, or the only one. */
export function initialIndex(count: number): number {
  return count > 1 ? 1 : 0;
}

/**
 * Chrome's Ctrl+Tab / Ctrl+Shift+Tab move to the neighbouring tab, wrapping around.
 * Returns +1 / -1 for such a move from `from` to `to`, or 0 if the tabs aren't neighbours.
 */
export function neighbourDirection(from: number, to: number, count: number): 1 | -1 | 0 {
  if (count < 2 || from === to) return 0;
  if (to === (from + 1) % count) return 1;
  if (to === (from - 1 + count) % count) return -1;
  return 0;
}

/** Size that fits `width`×`height` into `maxWidth`, keeping the aspect ratio and never upscaling. */
export function thumbnailSize(width: number, height: number, maxWidth = THUMBNAIL_WIDTH): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}
