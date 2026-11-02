import assert from "node:assert/strict";
import { test } from "node:test";

// Just enough of chrome.* to import background modules in Node.
let failStorage = false;
(globalThis as { chrome?: unknown }).chrome = {
  runtime: { getURL: (p: string) => "chrome-extension://x" + p, id: "x" },
  i18n: { getUILanguage: () => "en" },
  storage: {
    sync: { get: async () => ({ settings: { experimental: { ranking: true, learned: true } } }) },
    local: {
      get: async () => { if (failStorage) throw new Error("quota"); return {}; },
      set: async () => { if (failStorage) throw new Error("quota"); },
    },
    session: { get: async () => ({}), set: async () => {} },
    onChanged: { addListener() {} },
  },
};

const { matchCommands } = await import("../../src/background/command-service.ts");
const { recordChoice } = await import("../../src/background/choice-service.ts");
const { favicon } = await import("../../src/background/search-service.ts");

test("classic ranking: 'settings' still finds Open Settings first", () => {
  assert.equal(matchCommands("settings", undefined)[0].commandId, "settings");
});

test("favicons come from Chrome's cache, never from a localhost or LAN address", () => {
  const icon = new URL(favicon("http://192.168.0.1/admin"));
  assert.ok(icon.href.startsWith("chrome-extension://x/_favicon/?"));
  assert.equal(icon.searchParams.get("pageUrl"), "http://192.168.0.1/admin");
});

test("a storage failure while learning never breaks opening a row", async () => {
  failStorage = true;
  await assert.doesNotReject(recordChoice("pin", "cmd:pin", { incognito: false } as chrome.tabs.Tab));
  failStorage = false;
});
