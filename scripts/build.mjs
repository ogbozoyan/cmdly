// Builds the extension into dist/: bundles every entry point and copies static files.
// Usage: node --experimental-strip-types scripts/build.mjs [--watch]  (npm run build)
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { LOCALES, toChromeMessages } from "../src/i18n/locales.ts";

const watch = process.argv.includes("--watch");

// Each entry becomes one self-contained file in dist/ (Chrome can't import modules in content scripts).
const entryPoints = {
  background: "src/background/index.ts", // service worker
  overlay: "src/content/overlay.ts", // injected on demand: the command bar over a page
  content: "src/content/index.ts", // always-on content script: keyboard shortcuts, tab switcher
  palette: "src/pages/palette.ts", // standalone command bar page
  newtab: "src/pages/newtab.ts", // Cmd+T handler
  options: "src/pages/options.ts", // settings page
  "keep-open": "src/pages/keep-open.ts", // pinned guard tab (keep window open)
};

rmSync("dist", { recursive: true, force: true });
cpSync("static", "dist", { recursive: true, filter: (src) => !src.endsWith(".svg") });

// Translations: src/i18n/*.ts → dist/_locales/<locale>/messages.json (chrome.i18n format).
// Changes to translations need a rebuild — watch mode doesn't regenerate them.
for (const [locale, messages] of Object.entries(LOCALES)) {
  mkdirSync(`dist/_locales/${locale}`, { recursive: true });
  writeFileSync(`dist/_locales/${locale}/messages.json`, JSON.stringify(toChromeMessages(messages), null, 2) + "\n");
}

const options = {
  entryPoints,
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
  // CSS imported from TS is inlined as text (the switcher sets it without waiting for a stylesheet).
  loader: { ".css": "text" },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
