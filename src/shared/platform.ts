/** True on macOS. Decides between Cmd and Ctrl in default shortcuts and in how they are displayed. */
export const IS_MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || globalThis.navigator?.userAgent || "");

/** Primary modifier: Cmd on macOS, Ctrl elsewhere. */
export const MOD = IS_MAC ? "Meta" : "Ctrl";
