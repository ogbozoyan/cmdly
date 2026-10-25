<p align="center">
  <img src="static/icons/128.png" width="96" height="96" alt="Cmdly">
</p>

<h1 align="center">Cmdly</h1>

<p align="center">
  <b>An Arc-style command bar for Chrome.</b><br>
  Press <kbd>⌘</kbd> <kbd>T</kbd> — search tabs, history and bookmarks, run browser commands,
  calculate, decode. Without leaving the page.
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#features">Features</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a> ·
  <a href="#development">Development</a> ·
  <a href="PRIVACY.md">Privacy</a>
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-4c8bf5">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6">
  <img alt="No tracking" src="https://img.shields.io/badge/tracking-none-2ea44f">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-lightgrey">
</p>

<p align="center">
  <img src="docs/demo/search.gif" alt="Cmdly: press ⌘T, the bar appears over the page, type to find tabs" width="860">
</p>

## Why

Arc's command bar was the best part of the browser: one shortcut, type a few letters, Enter.
Arc is being discontinued, Chrome's address bar is not the same thing. Cmdly brings that workflow
to Chrome — the bar appears **on top of the page you're on**, and a new tab is opened only when
you actually navigate somewhere.

## How it works

<table>
  <tr>
    <td width="50%" valign="top">
      <b>Commands, calculator, UUID</b><br>
      <sub>Type what you want to do. Enter runs a command or copies the result.</sub><br><br>
      <img src="docs/demo/commands.gif" alt="Calculator, UUID and Pin Tab command">
    </td>
    <td width="50%" valign="top">
      <b>JSON, YAML and JWT viewer</b><br>
      <sub>Paste data, press <kbd>Tab</kbd> to expand the formatted result below.</sub><br><br>
      <img src="docs/demo/json.gif" alt="Paste JSON, expand the viewer, convert to YAML, decode a JWT">
    </td>
  </tr>
</table>

## Features

|                       |                                                                                                                                                             |
|-----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Search everything** | Open tabs, bookmarks and history in one list. Pick an open tab to switch to it instead of opening a duplicate.                                              |
| **Commands**          | Copy URL, Copy as Markdown, Pin/Unpin, Mute, Duplicate, Close other tabs, Move to new window, Reopen closed tab, Bookmark, open History/Downloads/Settings… |
| **Calculator**        | `2+2`, `200+15%`, `sqrt(16)`, `5!`, `2^10`, `3x4`. Enter copies the result.                                                                                 |
| **JSON / YAML**       | Paste JSON or YAML: format, minify, convert JSON ⇄ YAML. <kbd>Tab</kbd> expands a syntax-highlighted viewer under the results.                              |
| **Dev tools**         | `uuid` / `uuid 5` (v4, v7, v1), `b64 text` / `unb64 …`, `url text` / `unurl …`. Paste a JWT to see payload, header and readable `iat`/`exp` dates.                       |
| **Shortcuts**         | `⇧⌘C` copies the page URL, `⌘Z` reopens the last closed tab — like in Arc. All configurable.                                                                |
| **Settings**          | Turn every feature on/off, rebind shortcuts, pick theme, accent color, position and width. Export / import as JSON.                                         |
| **Private**           | No network requests, no analytics. Everything stays in your browser.                                                                                        |

# Screenshots

#### Commands — type what you want to do

<p>
<img src="docs/screenshots/commands.png" alt="Commands"><p align="center">
</p>

---

#### Calculator — Enter copies the result

<p>
<img src="docs/screenshots/calculator.png" alt="Calculator"><p align="center">
</p>

---

#### Pasted JSON — format, minify or convert to YAML

<p>
<img src="docs/screenshots/json-viewer.png" alt="JSON viewer"><p align="center">
</p>

---

#### JWT payload with readable dates

<p>
<img src="docs/screenshots/jwt.png" alt="JWT decoder"><p align="center">
</p>

---

#### The bar over any page — open tabs first

<p>
<img src="docs/screenshots/overlay.png" alt="Command bar"><p align="center">
</p>

---

#### Settings — features, shortcuts, appearance

<p>
<img src="docs/screenshots/options.png" alt="Settings"><p align="center">
</p>

## Installation

### 1. Chrome Web Store

**Coming soon (TBD).** Until then, use one of the options below — it takes about a minute.

### 2. Download a release

No build tools needed.

1. Download `cmdly-<version>.zip` from the [latest release](https://github.com/ogbozoyan/cmdly/releases/latest)
   and unzip it to a folder you'll keep (Chrome loads the extension from there).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.
4. Press <kbd>⌘</kbd> <kbd>T</kbd> on any web page. If Chrome asks whether to keep the changed new tab page,
   choose **Keep it**.
5. Recommended: make <kbd>⌘</kbd> <kbd>T</kbd> instant — see [Instant ⌘T](#instant-t).

**Update:** download the new zip, unzip it over the same folder, click ↻ on the Cmdly card in
`chrome://extensions`. Your settings are kept.

### 3. Build manually

Requires Node.js 22+.

```bash
git clone https://github.com/ogbozoyan/cmdly.git
cd cmdly
npm install
npm run build
```

Then in `chrome://extensions` → **Developer mode** → **Load unpacked** → select the `dist/` folder.

**Update:** `git pull && npm install && npm run build`, then click ↻ on the Cmdly card.

## Usage

Press <kbd>⌘</kbd> <kbd>T</kbd> and start typing.

| Type                           | You get                                                                        |
|--------------------------------|--------------------------------------------------------------------------------|
| `git`                          | Open tabs, bookmarks and history matching "git"                                |
| `github.com`                   | Open the address in a new tab                                                  |
| `how to ...`                   | Search with your default search engine                                         |
| `copy`, `pin`, `close`, `mute` | Commands for the current tab                                                   |
| `200+15%`                      | `= 230` — Enter copies it                                                      |
| `uuid`, `uuid 5` | Fresh UUID — <kbd>Tab</kbd> switches v4 / v7 / v1 and remembers it; `uuid v7` for a one-off |
| `b64 hello` / `unb64 aGVsbG8=` | Base64 encode / decode                                                         |
| `url a b&c` / `unurl a%20b`    | URL encode / decode                                                            |
| `eyJhbGciOi…`                  | Decoded JWT payload, header and expiry — <kbd>Tab</kbd> to expand              |
| paste `{"a": 1}` or YAML       | Format JSON · Minify JSON · Convert to YAML (or Format YAML · Convert to JSON) |
| `settings`                     | Cmdly Settings, Chrome Settings                                                |

In the bar: <kbd>↑</kbd> <kbd>↓</kbd> select · <kbd>Enter</kbd> open / copy · <kbd>⌘</kbd> <kbd>Enter</kbd> open in
background ·
<kbd>Tab</kbd> expand the viewer · <kbd>Esc</kbd> collapse, clear, then close.

## Keyboard shortcuts

| Shortcut                               | Action                                                     | Configurable         |
|----------------------------------------|------------------------------------------------------------|----------------------|
| <kbd>⌘</kbd> <kbd>T</kbd>              | Open the command bar over the current page                 | ✅                   |
| <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>C</kbd> | Copy the page URL                                          | ✅ can be turned off |
| <kbd>⌘</kbd> <kbd>Z</kbd>              | Reopen the last closed tab (when no text field is focused) | ✅ can be turned off |

On Windows and Linux use <kbd>Ctrl</kbd> instead of <kbd>⌘</kbd>. Change them in **Cmdly Settings**
(right-click the toolbar icon → Options, or type `cmdly settings` in the bar).

## Keep window open

Turn it on in **Cmdly Settings → Behavior → Keep window open**.

While a protected window has a single tab, Cmdly adds a small pinned tab to it. Close the last real
tab — the window stays and the command bar opens as a fresh tab. As soon as the window has two
or more tabs, the pinned tab disappears again, so the tab bar stays clean.

| Mode         | Protects                                                      |
|--------------|---------------------------------------------------------------|
| Off          | Nothing (default)                                             |
| Last window  | Only the last remaining window — other windows close normally |
| Every window | Every window                                                  |

## Instant ⌘T

Out of the box <kbd>⌘</kbd> <kbd>T</kbd> briefly opens a new tab before the bar appears. Chrome only lets
**you** give <kbd>⌘</kbd> <kbd>T</kbd> to an extension, so it's a one-time step (the settings page shows
a reminder until it's done):

1. Open `chrome://extensions/shortcuts`.
2. Find **Cmdly → Open the command bar**, click the field and press <kbd>⌘</kbd> <kbd>T</kbd>.

Now <kbd>⌘</kbd> <kbd>T</kbd> shows the bar over the current page instantly, and the **+** button opens the
bar in a new tab — like Arc.

<details>
<summary>macOS: ⌘T still opens a new tab?</summary>

Chrome's menu item *File → New Tab* may win over the extension. Give the menu item another shortcut:
**System Settings → Keyboard → Keyboard Shortcuts → App Shortcuts → +**, application *Google Chrome*,
menu title `New Tab`, shortcut e.g. <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>T</kbd>. Restart Chrome.
</details>

## Limitations

These come from how Chrome works, not from Cmdly:

- **New tab flash until ⌘T is set up.** Chrome won't let an extension claim <kbd>⌘</kbd> <kbd>T</kbd> by
  default, so out of the box Cmdly replaces the new tab page, closes it and shows the bar on the
  previous page — the new tab flashes for a moment. See [Instant ⌘T](#instant-t) to remove it.
- **chrome:// pages and the Web Store** don't allow extensions: there the bar opens as a separate
  tab and page shortcuts (<kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>C</kbd>, <kbd>⌘</kbd> <kbd>Z</kbd>) don't work.
- **Split View:** the bar appears in the focused pane only.

## Development

```bash
npm install
npm run watch        # rebuild dist/ on every change
npm run check        # typecheck + unit tests + build
npm run e2e          # end-to-end test in Chrome for Testing (see scripts/e2e.mjs)
npm run demo         # re-record the GIFs in docs/demo (needs ffmpeg)
npm run package      # zip for the Chrome Web Store
npm run release      # patch bump (or: -- minor / -- major), tag, push → Actions publishes the release
```

Project layout (details in [AGENTS.md](AGENTS.md)):

```
src/
  background/   service worker: router (controller) + services
  shared/       types, message contract, settings model and repository
  tools/        pure functions: calculator, UUID, Base64, JWT, JSON/YAML
  ui/           the command bar component
  content/      scripts injected into web pages
  pages/        options, palette and new tab pages
static/         manifest.json, HTML, CSS, icons
tests/          unit tests (node:test)
scripts/        build, e2e, packaging, icons
```

Contributions are welcome — open an issue or a pull request. Please run `npm run check` first.

## Privacy

Cmdly reads your tabs, history and bookmarks locally to show results and never sends anything
anywhere. No servers, no analytics. See [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE)
