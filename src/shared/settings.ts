import { MOD } from "./platform.ts";

/** User settings. Stored in chrome.storage.sync, so they follow the user across devices. */
export interface Settings {
  /** Keyboard shortcuts in Shortcut format (see shortcuts.ts). Empty string = disabled. */
  shortcuts: {
    openBar: string;
    copyUrl: string;
    undoClose: string;
  };
  features: {
    /** Show the bar over the current page instead of a separate tab. */
    overlay: boolean;
    commands: boolean;
    calculator: boolean;
    uuid: boolean;
    encode: boolean;
    jwt: boolean;
  };
  sources: {
    tabs: boolean;
    bookmarks: boolean;
    history: boolean;
  };
  limits: {
    tabs: number;
    bookmarks: number;
    history: number;
  };
  appearance: {
    theme: "dark" | "light" | "system";
    accent: string;
    position: "center" | "top";
    width: number;
  };
}

export type Features = Settings["features"];

export const DEFAULT_SETTINGS: Settings = {
  shortcuts: {
    openBar: `${MOD}+KeyT`,
    copyUrl: `${MOD}+Shift+KeyC`,
    undoClose: `${MOD}+KeyZ`,
  },
  features: {
    overlay: true,
    commands: true,
    calculator: true,
    uuid: true,
    encode: true,
    jwt: true,
  },
  sources: {
    tabs: true,
    bookmarks: true,
    history: true,
  },
  limits: {
    tabs: 5,
    bookmarks: 3,
    history: 4,
  },
  appearance: {
    theme: "dark",
    accent: "#6c8cff",
    position: "center",
    width: 760,
  },
};

/**
 * Deep-merges saved values over defaults. Unknown keys and values of the wrong type are dropped,
 * so old or hand-edited data can never break the extension.
 */
export function mergeSettings(saved: unknown): Settings {
  return mergeInto(DEFAULT_SETTINGS, saved);
}

function mergeInto<T>(base: T, patch: unknown): T {
  if (!isObject(patch)) return structuredClone(base);
  const out = {} as T;
  for (const key of Object.keys(base as object) as (keyof T)[]) {
    const b = base[key];
    const p = patch[key as string];
    if (isObject(b)) out[key] = mergeInto(b, p);
    else out[key] = p === undefined || typeof p !== typeof b ? b : (p as T[keyof T]);
  }
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// ---------- export / import ----------

export interface SettingsFile {
  app: "cmdly";
  version: 1;
  exportedAt: string;
  settings: Settings;
}

export function toExportFile(settings: Settings): SettingsFile {
  return { app: "cmdly", version: 1, exportedAt: new Date().toISOString(), settings: mergeSettings(settings) };
}

/** Parses an export file (or a bare settings object). Throws a user-readable Error on bad input. */
export function fromImportFile(data: unknown): Settings {
  if (!isObject(data)) throw new Error("Not a Cmdly settings file");
  if (data.app !== undefined && data.app !== "cmdly") throw new Error("This file is from another app");
  const settings = data.app === "cmdly" ? data.settings : data;
  if (!isObject(settings)) throw new Error("Settings are missing");
  if (!Object.keys(DEFAULT_SETTINGS).some((key) => key in settings)) {
    throw new Error("No Cmdly settings found in the file");
  }
  return mergeSettings(settings);
}
