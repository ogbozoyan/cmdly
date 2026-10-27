/**
 * Look of the bar inside a feature (see src/features). A palette is a set of the bar's
 * CSS variables, so adding a feature's look is data only. Pure: no DOM, no chrome.*.
 */

export interface Palette {
  panel: string;
  text: string;
  muted: string;
  rowActive: string;
  chip: string;
  chipText: string;
  accent: string;
  border: string;
  divider: string;
}

export interface ModeTheme {
  /** Used when the bar is dark (system theme or setting); `light` otherwise. */
  dark: Palette;
  light: Palette;
}

/** Palette key → CSS variable on the bar's root. */
export const PALETTE_VARS: Record<keyof Palette, string> = {
  panel: "--panel",
  text: "--text",
  muted: "--muted",
  rowActive: "--row-active",
  chip: "--chip",
  chipText: "--chip-text",
  accent: "--accent",
  border: "--border",
  divider: "--divider",
};
