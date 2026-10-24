// Builds the extension into dist/: bundles every entry point and copies static files.
// Usage: node scripts/build.mjs [--watch]
import * as esbuild from "esbuild";
import { cpSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

// Each entry becomes one self-contained file in dist/ (Chrome can't import modules in content scripts).
const entryPoints = {
  background: "src/background/index.ts", // service worker
  overlay: "src/content/overlay.ts", // injected on demand: the command bar over a page
  content: "src/content/index.ts", // always-on content script: keyboard shortcuts
  palette: "src/pages/palette.ts", // standalone command bar page
  newtab: "src/pages/newtab.ts", // Cmd+T handler
  options: "src/pages/options.ts", // settings page
};

rmSync("dist", { recursive: true, force: true });
cpSync("static", "dist", { recursive: true, filter: (src) => !src.endsWith(".svg") });

const options = {
  entryPoints,
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
