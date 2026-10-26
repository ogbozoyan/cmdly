/**
 * Look of the bar in a Tab mode ("html", "md", "swagger" + Tab). A palette is a set of the bar's
 * CSS variables, so adding a mode's look is data only. Pure: no DOM, no chrome.*.
 */
import type { MarkupKind } from "../tools/markup.ts";

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

export const MODE_THEMES: Record<MarkupKind, ModeTheme> = {
  // Paper: grey-white in both system themes, the way a page looks.
  html: {
    dark: { panel: "#f1f1ef", text: "#1c1c1e", muted: "#74747a", rowActive: "#e2e2df", chip: "#1c1c1e", chipText: "#ffffff", accent: "#6b6b72", border: "rgba(0,0,0,0.1)", divider: "rgba(0,0,0,0.08)" },
    light: { panel: "#fbfbfa", text: "#1c1c1e", muted: "#7a7a80", rowActive: "#ececea", chip: "#1c1c1e", chipText: "#ffffff", accent: "#6b6b72", border: "rgba(0,0,0,0.1)", divider: "rgba(0,0,0,0.07)" },
  },
  // Graphite: near-black on dark, silver on light.
  markdown: {
    dark: { panel: "#111111", text: "#e8e8e8", muted: "#7b7b7b", rowActive: "#222222", chip: "#e8e8e8", chipText: "#111111", accent: "#a8a8a8", border: "rgba(255,255,255,0.09)", divider: "rgba(255,255,255,0.07)" },
    light: { panel: "#dedee0", text: "#161616", muted: "#6c6c70", rowActive: "#cfcfd2", chip: "#161616", chipText: "#f2f2f2", accent: "#4a4a4f", border: "rgba(0,0,0,0.12)", divider: "rgba(0,0,0,0.09)" },
  },
  // Swagger Editor: its deep blue-teal header (#173647) and the Swagger green (#89bf04).
  openapi: {
    dark: { panel: "#173647", text: "#e6f0f5", muted: "#8aa7b6", rowActive: "#21485f", chip: "#89bf04", chipText: "#10242f", accent: "#89bf04", border: "rgba(137,191,4,0.28)", divider: "rgba(255,255,255,0.09)" },
    light: { panel: "#eef3f6", text: "#3b4151", muted: "#6f808b", rowActive: "#dce6ec", chip: "#173647", chipText: "#ffffff", accent: "#5f8a00", border: "rgba(23,54,71,0.18)", divider: "rgba(23,54,71,0.1)" },
  },
};
