import { mergeSettings, type Settings } from "./settings.ts";

/** Persistence for Settings (chrome.storage.sync). The only place that touches settings storage. */
export const settingsRepository = {
  async get(): Promise<Settings> {
    const { settings } = await chrome.storage.sync.get("settings");
    return mergeSettings(settings);
  },

  async save(settings: Settings): Promise<void> {
    await chrome.storage.sync.set({ settings: mergeSettings(settings) });
  },

  async reset(): Promise<void> {
    await chrome.storage.sync.remove("settings");
  },

  /** Calls back whenever settings change in any tab or on another device. */
  onChange(callback: (settings: Settings) => void): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.settings) callback(mergeSettings(changes.settings.newValue));
    });
  },
};
