// Records the animated GIFs used in README.md (docs/demo/*.gif) from the real extension.
//
//   CHROME_PATH=… npm run demo
//
// Needs Chrome for Testing (see scripts/e2e.mjs) and ffmpeg (brew install ffmpeg).
// Each scenario is recorded as WebM with Puppeteer's screencast, then converted to an
// optimized GIF with a two-pass ffmpeg palette.
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME_PATH = process.env.CHROME_PATH;
if (!CHROME_PATH) {
  console.error("Set CHROME_PATH to a Chrome for Testing binary (see scripts/e2e.mjs).");
  process.exit(1);
}
const OUT_DIR = resolve("docs/demo");
const DIST = resolve("dist");
const WIDTH = 1200;
const HEIGHT = 720;
const GIF_WIDTH = 960;
const FPS = 15;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEMO_PAGE = `<!doctype html><html><head><title>Keyboard-first browsing</title><style>
  body { margin: 0; font: 18px/1.65 Georgia, serif; color: #222; background: #fafaf7; }
  main { max-width: 720px; margin: 0 auto; padding: 72px 24px; }
  h1 { font: 700 44px/1.15 -apple-system, sans-serif; margin: 0 0 18px; letter-spacing: -0.01em; }
  p { margin: 0 0 20px; } .muted { color: #777; font: 14px -apple-system, sans-serif; }
  </style></head><body><main>
  <p class="muted">Engineering blog · 6 min read</p>
  <h1>Keyboard-first browsing</h1>
  <p>Every time your hand leaves the keyboard to find a tab, you lose a little bit of focus.
  A command bar puts tabs, history, bookmarks and browser actions one shortcut away.</p>
  <p>Press a key, type a few letters, hit Enter. That's the whole interface — and it scales from
  three tabs to three hundred.</p>
  <p>The same bar can do small things you would otherwise open a website for: add numbers,
  generate a UUID, format JSON or decode a token.</p>
  </main></body></html>`;

const SAMPLE_JSON = JSON.stringify(
  {
    service: "checkout",
    version: "2.4.1",
    replicas: 3,
    healthy: true,
    endpoints: [
      { path: "/api/orders", method: "POST", timeoutMs: 1500 },
      { path: "/api/orders/{id}", method: "GET", timeoutMs: 500 },
    ],
    owner: null,
  },
  null,
  2
);

const SAMPLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiI0MiIsIm5hbWUiOiJBbm4iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMH0." +
  "c2lnbmF0dXJl";

// ---------- setup ----------

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(DEMO_PAGE);
}).listen(0);
const SITE = `http://localhost:${server.address().port}/`;

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  defaultViewport: null,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, `--window-size=${WIDTH},${HEIGHT}`, "--hide-scrollbars"],
});
const worker = await (await browser.waitForTarget((t) => t.type() === "service_worker")).worker();

// Real tabs so the result list looks like real usage.
for (const url of ["https://github.com/", "https://developer.mozilla.org/en-US/", "https://news.ycombinator.com/", "https://en.wikipedia.org/wiki/Command-line_interface"]) {
  const tab = await browser.newPage();
  await tab.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
}
for (const p of await browser.pages()) if (p.url() === "about:blank") await p.close();

const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
await page.goto(SITE);
await sleep(1500);

// ---------- helpers ----------

/** On-screen keystroke badge, so viewers see which keys were pressed. */
async function showKeys(label, ms = 1100) {
  await page.evaluate(
    (text, duration) => {
      document.getElementById("demo-keys")?.remove();
      const el = document.createElement("div");
      el.id = "demo-keys";
      el.textContent = text;
      el.style.cssText =
        "position:fixed;left:24px;bottom:24px;z-index:2147483647;padding:10px 16px;border-radius:10px;" +
        "background:rgba(20,20,22,.88);color:#fff;font:600 20px -apple-system,sans-serif;letter-spacing:.08em;" +
        "box-shadow:0 8px 30px rgba(0,0,0,.25)";
      document.documentElement.appendChild(el);
      setTimeout(() => el.remove(), duration);
    },
    label,
    ms
  );
}

async function openBar() {
  await showKeys("⌘ T");
  await sleep(250);
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  await worker.evaluate((id) => chrome.scripting.executeScript({ target: { tabId: id }, files: ["overlay.js"] }), tabId);
  await page.waitForFunction(() => document.getElementById("cmdly-overlay")?.style.visibility === "visible");
  await sleep(500);
}

async function type(text) {
  await page.keyboard.type(text, { delay: 90 });
  await sleep(700);
}

async function press(key, label, pause = 700) {
  if (label) await showKeys(label, 800);
  await page.keyboard.press(key);
  await sleep(pause);
}

// Synthetic paste events don't insert text, so single-line text is put into the input directly
// (that's what a real ⌘V does); multi-line text goes through Cmdly's paste handler.
async function paste(text) {
  await showKeys("⌘ V");
  await page.evaluate((value) => {
    const input = document.getElementById("cmdly-overlay").shadowRoot.querySelector("input");
    if (!value.includes("\n")) {
      input.value = value;
      input.dispatchEvent(new Event("input"));
      return;
    }
    const data = new DataTransfer();
    data.setData("text/plain", value);
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  await sleep(1100);
}

async function clearInput() {
  await page.evaluate(() => {
    const input = document.getElementById("cmdly-overlay").shadowRoot.querySelector("input");
    input.value = "";
    input.dispatchEvent(new Event("input"));
  });
  await sleep(300);
}

async function closeBar() {
  if (await page.$("#cmdly-overlay")) await page.evaluate(() => document.getElementById("cmdly-overlay").cmdlyClose?.() ?? document.getElementById("cmdly-overlay").remove());
  await sleep(300);
}

async function record(name, scenario) {
  mkdirSync(OUT_DIR, { recursive: true });
  const webm = `${OUT_DIR}/${name}.webm`;
  const gif = `${OUT_DIR}/${name}.gif`;
  await page.bringToFront();
  await sleep(300);
  const recorder = await page.screencast({ path: webm });
  await sleep(600);
  await scenario();
  await sleep(600);
  await recorder.stop();
  await closeBar();

  // Two-pass palette: much better colors and size than a direct conversion.
  const filters = `fps=${FPS},scale=${GIF_WIDTH}:-1:flags=lanczos`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-vf",
    `${filters},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, gif]);
  rmSync(webm);
  const kb = Math.round(execFileSync("stat", ["-f%z", gif]).toString() / 1024);
  console.log(`  docs/demo/${name}.gif  ${kb} KB`);
}

// ---------- scenarios ----------

console.log("Recording demos");
try {
  await record("search", async () => {
    await openBar();
    await sleep(600);
    await type("hack");
    await press("ArrowDown", "↓");
    await press("ArrowUp", "↑");
    await clearInput();
    await type("github.com");
    await sleep(500);
    await press("Escape", "esc", 300);
    await press("Escape", "esc", 600);
  });

  await record("commands", async () => {
    await openBar();
    await type("200+15%");
    await press("Enter", "↵", 1400);
    await openBar();
    await type("uuid");
    await press("Enter", "↵", 1400);
    await openBar();
    await type("pin");
    await press("ArrowDown", "↓");
    await press("Enter", "↵", 1400);
  });

  await record("json", async () => {
    await openBar();
    await paste(SAMPLE_JSON);
    await press("Tab", "⇥ tab", 1600);
    await press("ArrowDown", "↓", 900);
    await press("ArrowDown", "↓", 1600);
    await press("Tab", "⇥ tab", 500);
    await clearInput();
    await paste(SAMPLE_JWT);
    await press("Tab", "⇥ tab", 2200);
  });
} finally {
  await browser.close();
  server.close();
}
