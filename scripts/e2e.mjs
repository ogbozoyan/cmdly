// End-to-end smoke test: loads dist/ into Chrome for Testing and drives the real extension.
//
//   npm run e2e                      # run checks
//   npm run e2e -- --screenshots     # also refresh docs/screenshots/*.png
//
// Needs Chrome for Testing (branded Chrome no longer loads unpacked extensions from the command line):
//   npx @puppeteer/browsers install chrome@stable
//   export CHROME_PATH="<path printed by the command above>"
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME_PATH = process.env.CHROME_PATH;
if (!CHROME_PATH) {
  console.error("Set CHROME_PATH to a Chrome for Testing binary (see the header of this file).");
  process.exit(1);
}
const SCREENSHOTS = process.argv.includes("--screenshots");
const SHOTS_DIR = resolve("docs/screenshots");
const DIST = resolve("dist");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- tiny local site to run the overlay on ----------

const DEMO_PAGE = `<!doctype html><html><head><title>Cmdly demo page</title><style>
  body { margin: 0; font: 17px/1.6 Georgia, serif; color: #222; background: #fafaf7; }
  main { max-width: 720px; margin: 0 auto; padding: 64px 24px; }
  h1 { font: 700 40px/1.2 -apple-system, sans-serif; margin: 0 0 16px; }
  p { margin: 0 0 18px; } .muted { color: #777; font: 14px -apple-system, sans-serif; }
  </style></head><body><main>
  <p class="muted">Engineering blog · 6 min read</p>
  <h1>Keyboard-first browsing</h1>
  <p>Every time your hand leaves the keyboard to find a tab, you lose a little bit of focus.
  A command bar puts tabs, history, bookmarks and browser actions one shortcut away.</p>
  <p>Press a key, type a few letters, hit Enter. That's the whole interface — and it scales from
  three tabs to three hundred.</p>
  <p>The same bar can do small things you would otherwise open a website for: add numbers,
  generate a UUID, decode a token or a Base64 string.</p>
  <input id="field" placeholder="A text field on the page" style="font:16px sans-serif;padding:8px;width:320px">
  </main></body></html>`;

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(DEMO_PAGE);
}).listen(0);
const SITE = `http://localhost:${server.address().port}/`;

// ---------- browser ----------

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  defaultViewport: null,
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    "--window-size=1280,800",
    "--hide-scrollbars",
    "--no-first-run",
  ],
});

const worker = await (await browser.waitForTarget((t) => t.type() === "service_worker")).worker();
const extensionId = new URL(worker.url()).host;
const inWorker = (fn, ...args) => worker.evaluate(fn, ...args);

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function openPage(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

async function tabIdOf(page) {
  const url = page.url();
  return inWorker(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
}

async function openOverlay(page) {
  await page.bringToFront();
  const tabId = await tabIdOf(page);
  await inWorker(async (id) => {
    await chrome.tabs.update(id, { active: true });
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ["overlay.js"] });
  }, tabId);
  await page.waitForFunction(() => {
    const host = document.getElementById("cmdly-overlay");
    return host && host.style.visibility === "visible";
  });
}

async function typeInBar(page, text) {
  await page.evaluate((value) => {
    const input = document.getElementById("cmdly-overlay").shadowRoot.querySelector("input");
    input.value = value;
    input.dispatchEvent(new Event("input"));
  }, text);
  await sleep(400);
}

// A ⌘V paste event with line breaks intact. Synthetic paste events don't insert text by themselves,
// so single-line text (which Cmdly leaves to the browser) is typed instead.
async function pasteInBar(page, text) {
  if (!text.includes("\n")) return typeInBar(page, text);
  await page.evaluate((value) => {
    const input = document.getElementById("cmdly-overlay").shadowRoot.querySelector("input");
    input.focus();
    const data = new DataTransfer();
    data.setData("text/plain", value);
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  await sleep(400);
}

/** Visible preview code, or null when the panel is collapsed. */
const previewText = (page) =>
  page.evaluate(() => {
    const panel = document.getElementById("cmdly-overlay").shadowRoot.querySelector(".preview");
    return panel.hidden ? null : panel.querySelector("pre").textContent;
  });

const SAMPLE_JSON = JSON.stringify(
  {
  service: "checkout",
  version: "2.4.1",
  replicas: 3,
  healthy: true,
  endpoints: [{ path: "/api/orders", method: "POST", timeoutMs: 1500 }, { path: "/api/orders/{id}", method: "GET", timeoutMs: 500 }],
  owner: null,
  },
  null,
  2
);

const rowTitles = (page) =>
  page.evaluate(() =>
    [...document.getElementById("cmdly-overlay").shadowRoot.querySelectorAll("li .title")].map((el) => el.firstChild.textContent)
  );

async function shot(page, name) {
  if (!SCREENSHOTS) return;
  await sleep(300); // let CSS transitions finish
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}

// Real tabs make the result list look like real usage.
const BACKGROUND_TABS = [
  "https://github.com/",
  "https://developer.mozilla.org/en-US/",
  "https://news.ycombinator.com/",
  "https://en.wikipedia.org/wiki/Command-line_interface",
];

console.log("Cmdly e2e");

try {
  for (const url of BACKGROUND_TABS) await openPage(url).catch(() => {});
  const page = await openPage(SITE);
  await sleep(1500);

  await check("overlay opens over the page and lists open tabs", async () => {
    await openOverlay(page);
    const titles = await rowTitles(page);
    expect(titles.length >= 3, `expected open tabs, got ${JSON.stringify(titles)}`);
    await shot(page, "overlay");
  });

  await check("calculator", async () => {
    await typeInBar(page, "200+15%");
    const titles = await rowTitles(page);
    expect(titles[0] === "= 230", `first row: ${titles[0]}`);
    await shot(page, "calculator");
  });

  await check("commands", async () => {
    await typeInBar(page, "copy");
    const titles = await rowTitles(page);
    expect(titles.includes("Copy URL"), `rows: ${JSON.stringify(titles)}`);
    await shot(page, "commands");
  });

  await check("JWT decoder", async () => {
    await typeInBar(page, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsIm5hbWUiOiJBbm4iLCJleHAiOjE3MDAwMDAwMDB9.c2ln");
    const titles = await rowTitles(page);
    expect(titles[0].includes('"sub":"42"'), `first row: ${titles[0]}`);
  });

  await check("JSON paste: viewer rows first, web search still offered, Tab expands", async () => {
    await typeInBar(page, "");
    await pasteInBar(page, SAMPLE_JSON);
    const titles = await rowTitles(page);
    expect(titles.slice(0, 3).join() === "Format JSON,Minify JSON,Convert to YAML", `rows: ${JSON.stringify(titles)}`);
    const kinds = await page.evaluate(() =>
      [...document.getElementById("cmdly-overlay").shadowRoot.querySelectorAll("li .action")].map((el) => el.textContent)
    );
    expect(kinds.includes("Search"), `no web search row: ${JSON.stringify(kinds)}`);
    await page.keyboard.press("Tab");
    const code = await previewText(page);
    expect(code?.startsWith('{\n  "service": "checkout"'), `preview: ${code?.slice(0, 60)}`);
    await shot(page, "json-viewer");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    expect((await previewText(page))?.startsWith("service: checkout"), "YAML preview follows the selection");
    await page.keyboard.press("Escape");
    expect((await previewText(page)) === null, "Esc collapses the viewer first");
  });

  await check("palette page: pasted JSON still offers web search", async () => {
    const palette = await openPage(`chrome-extension://${extensionId}/palette.html`);
    await palette.waitForSelector("input");
    await palette.evaluate((value) => {
      const input = document.querySelector("input");
      const data = new DataTransfer();
      data.setData("text/plain", value);
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, '{\n  "sub": "1234567890",\n  "name": "John Doe",\n  "admin": true,\n  "iat": 1516239022\n}');
    await sleep(500);
    const actions = await palette.$$eval("li .action", (els) => els.map((el) => el.textContent));
    await palette.close();
    expect(actions.slice(0, 3).every((a) => a === "Copy") && actions.includes("Search"), `actions: ${JSON.stringify(actions)}`);
  });

  await check("YAML paste → Convert to JSON", async () => {
    await typeInBar(page, "");
    await pasteInBar(page, "server:\n  port: 8080\n  hosts:\n    - a.local\n    - b.local\n");
    const titles = await rowTitles(page);
    expect(titles.slice(0, 2).join() === "Format YAML,Convert to JSON", `rows: ${JSON.stringify(titles)}`);
  });

  await check("JWT row expands with readable dates", async () => {
    await typeInBar(page, "");
    await pasteInBar(page, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsIm5hbWUiOiJBbm4iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMH0.c2ln");
    await page.keyboard.press("Tab");
    const notes = await page.evaluate(() => document.getElementById("cmdly-overlay").shadowRoot.querySelector(".preview-notes").textContent);
    expect(/Issued .*Expires .*\(expired\)/.test(notes), `notes: ${notes}`);
    await shot(page, "jwt");
    await page.keyboard.press("Escape");
  });

  await check("UUID and Base64", async () => {
    await typeInBar(page, "uuid");
    expect(/^[0-9a-f-]{36}$/.test((await rowTitles(page))[0]), "uuid row");
    await typeInBar(page, "b64 hello");
    expect((await rowTitles(page))[0] === "aGVsbG8=", "base64 row");
  });

  await check("Esc closes the overlay", async () => {
    await typeInBar(page, "");
    await page.keyboard.press("Escape");
    await sleep(200);
    expect(!(await page.$("#cmdly-overlay")), "overlay still present");
  });

  await check("Cmd+T (new tab) turns into the overlay on the previous page", async () => {
    await page.bringToFront();
    await inWorker(() => chrome.tabs.create({}));
    await page.waitForSelector("#cmdly-overlay", { timeout: 5000 });
    const newTabs = await inWorker(async () => (await chrome.tabs.query({})).filter((t) => (t.url || t.pendingUrl || "").includes("newtab")).length);
    expect(newTabs === 0, "the temporary new tab was not closed");
    await page.keyboard.press("Escape");
  });

  await check("⇧⌘C copies the page URL and shows a toast", async () => {
    await page.bringToFront();
    await page.click("h1");
    await page.keyboard.down("Meta");
    await page.keyboard.down("Shift");
    await page.keyboard.press("KeyC");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Meta");
    await page.waitForSelector("#cmdly-toast", { timeout: 2000 });
    const text = await page.evaluate(() => document.getElementById("cmdly-toast").shadowRoot.querySelector("div").textContent);
    expect(text === "URL copied", `toast: ${text}`);
  });

  await check("⌘Z reopens the last closed tab, but not inside a text field", async () => {
    const victim = await openPage("https://example.com/");
    await victim.close();
    await sleep(300);
    const before = (await browser.pages()).length;

    await page.bringToFront();
    await page.click("#field");
    await page.keyboard.down("Meta");
    await page.keyboard.press("KeyZ");
    await page.keyboard.up("Meta");
    await sleep(800);
    expect((await browser.pages()).length === before, "⌘Z in a text field must not reopen tabs");

    await page.click("h1");
    await page.keyboard.down("Meta");
    await page.keyboard.press("KeyZ");
    await page.keyboard.up("Meta");
    await sleep(1500);
    const urls = (await browser.pages()).map((p) => p.url());
    expect(urls.some((u) => u.startsWith("https://example.com")), `example.com not restored: ${urls.join(", ")}`);
  });

  await check("keep window open: closing the last tab leaves the window with the command bar", async () => {
    const result = await inWorker(async (site) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const tabsOf = async (windowId) =>
        (await chrome.tabs.query({ windowId })).map((t) => ({ id: t.id, pinned: t.pinned, url: t.url || t.pendingUrl }));
      const isGuard = (t) => t.url.endsWith("/keep-open.html");
      const isPalette = (t) => t.url.endsWith("/palette.html");
      const settings = async (keepOpen) => {
        const { settings = {} } = await chrome.storage.sync.get("settings");
        await chrome.storage.sync.set({ settings: { ...settings, windows: { keepOpen } } });
      };

      await settings("every");
      const win = await chrome.windows.create({ url: site });
      await wait(1200);
      const withOneTab = await tabsOf(win.id);

      const page = withOneTab.find((t) => !isGuard(t));
      await chrome.tabs.remove(page.id);
      await wait(1200);
      const windowSurvived = (await chrome.windows.getAll()).some((w) => w.id === win.id);
      const afterClose = windowSurvived ? await tabsOf(win.id) : [];

      await chrome.tabs.create({ windowId: win.id, url: site });
      await wait(1200);
      const withTwoTabs = await tabsOf(win.id);

      // Cmd+T in a one-tab window must not make the guard disappear and reappear.
      await chrome.tabs.remove(withTwoTabs.find(isPalette).id);
      await wait(1200);
      const guardBefore = (await tabsOf(win.id)).find(isGuard)?.id;
      await chrome.tabs.create({ windowId: win.id });
      await wait(1500);
      const guardAfter = (await tabsOf(win.id)).find(isGuard)?.id;

      await settings("off");
      await chrome.windows.remove(win.id);
      return { withOneTab, windowSurvived, afterClose, withTwoTabs, guardBefore, guardAfter };
    }, SITE);

    const guards = (tabs) => tabs.filter((t) => t.url.endsWith("/keep-open.html"));
    expect(guards(result.withOneTab).length === 1 && guards(result.withOneTab)[0].pinned, `one tab → pinned guard: ${JSON.stringify(result.withOneTab)}`);
    expect(result.windowSurvived, "window closed together with its last tab");
    expect(result.afterClose.some((t) => t.url.endsWith("/palette.html")), `bar not opened: ${JSON.stringify(result.afterClose)}`);
    expect(guards(result.withTwoTabs).length === 0, `guard not removed with 2 tabs: ${JSON.stringify(result.withTwoTabs)}`);
    expect(result.guardBefore && result.guardBefore === result.guardAfter, `guard flickered on ⌘T: ${result.guardBefore} → ${result.guardAfter}`);
  });

  await check("⌘T assigned in Chrome: no flash setup, + opens the bar in the new tab", async () => {
    const options = await openPage(`chrome-extension://${extensionId}/options.html`);
    await sleep(500);
    const before = await options.$eval(".banner-title", (el) => el.textContent);
    expect(/one-time setup/.test(before), `banner before: ${before}`);

    // Same call chrome://extensions/shortcuts makes when the user presses ⌘T in the field.
    const shortcuts = await openPage("chrome://extensions/shortcuts");
    await sleep(500);
    await shortcuts.evaluate((id) => chrome.developerPrivate.updateExtensionCommand({ extensionId: id, commandName: "open-bar", keybinding: "Command+T" }), extensionId);
    await shortcuts.close();

    await options.bringToFront();
    await options.evaluate(() => window.dispatchEvent(new Event("focus")));
    await sleep(300);
    const after = await options.$eval(".banner-title", (el) => el.textContent);
    expect(after === "⌘T opens Cmdly instantly", `banner after: ${after}`);
    await shot(options, "options");
    await options.close();

    // "+" button / menu → Chrome opens our new tab page → the bar stays in that tab.
    await page.bringToFront();
    const result = await inWorker(async () => {
      const opened = await chrome.tabs.create({});
      await new Promise((r) => setTimeout(r, 1500));
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const active = tabs.find((t) => t.active);
      return { activeUrl: active.url, index: active.index, openedIndex: opened.index };
    });
    expect(result.activeUrl.endsWith("/palette.html") && result.index === result.openedIndex, `new tab: ${JSON.stringify(result)}`);
    expect(!(await page.$("#cmdly-overlay")), "overlay must not appear on the previous page");

    const cleanup = await openPage("chrome://extensions/shortcuts");
    await sleep(300);
    await cleanup.evaluate((id) => chrome.developerPrivate.updateExtensionCommand({ extensionId: id, commandName: "open-bar", keybinding: "" }), extensionId);
    await cleanup.close();
    await inWorker(async () => {
      for (const t of await chrome.tabs.query({})) if (t.url?.endsWith("/palette.html")) await chrome.tabs.remove(t.id);
    });
  });

  await check("options page renders shortcuts and saves changes", async () => {
    const options = await openPage(`chrome-extension://${extensionId}/options.html`);
    await options.waitForSelector('[data-shortcut="copyUrl"]');
    await sleep(300);
    const label = await options.$eval('[data-shortcut="copyUrl"]', (el) => el.textContent);
    expect(label === "⇧⌘C" || label === "Ctrl+Shift+C", `copyUrl label: ${label}`);

    await options.click('[data-shortcut-clear="copyUrl"]');
    await sleep(300);
    const saved = await inWorker(async () => (await chrome.storage.sync.get("settings")).settings?.shortcuts?.copyUrl);
    expect(saved === "", `copyUrl after "Off": ${JSON.stringify(saved)}`);
    await options.click('[data-shortcut-reset="copyUrl"]');
    await options.close();
  });
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
