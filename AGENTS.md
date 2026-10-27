# AGENTS.md

Guide for AI coding agents (Claude Code, Codex, OpenCode…) and humans working on Cmdly.
`CLAUDE.md` is a symlink to this file — edit `AGENTS.md` only.

## What this is

Cmdly is a Chrome extension (Manifest V3): an Arc-style command bar. `Cmd+T` shows a search bar
over the current page that finds open tabs, bookmarks and history, runs browser commands
(Copy URL, Pin Tab…), and has small tools (calculator, UUID, Base64/URL, JWT, JSON/YAML viewer).
It also adds shortcuts: `⇧⌘C` copies the page URL, `⌘Z` reopens a closed tab, and can keep a
window open when its last tab is closed.

## Commands

```bash
npm install          # once
npm run build        # src/ + static/ → dist/  (load dist/ as an unpacked extension)
npm run watch        # rebuild on change (static/ is copied only on start)
npm run typecheck    # tsc --noEmit
npm test             # unit tests (node:test, no browser)
npm run check        # typecheck + test + build — run before every commit
npm run e2e          # real Chrome smoke test, needs CHROME_PATH (see scripts/e2e.mjs)
npm run e2e -- --screenshots   # also refreshes docs/screenshots/
npm run demo         # re-record docs/demo/*.gif (CHROME_PATH + ffmpeg)
npm run package      # check + zip dist/ for the Chrome Web Store
npm run release      # bump version (patch | -- minor | -- major), commit, tag vX.Y.Z, push
```

### CI / releases (GitHub Actions)

- `.github/workflows/ci.yml` — every push to main and every PR: `npm ci` + `npm run check`
  (typecheck, unit tests, build) + manifest/package version match. `dist/` is uploaded as an artifact.
- `.github/workflows/release.yml` — **every push to main is a release**: bumps the minor version via
  `scripts/version.mjs`, commits "Release vX.Y.Z" as github-actions[bot], tags, runs `npm run package` and
  publishes a GitHub release with `cmdly-X.Y.Z.zip`; the notes start with a changelog (commit subjects since the
  previous release), so write commit messages as release notes. **Run workflow** picks another bump; a pushed tag
  `vX.Y.Z` (`npm run release`) verifies tag = manifest = package version and publishes it (its release commit on
  main is skipped, no double release). Don't push to main you don't want released.
- The version only goes up and is never edited by hand: `scripts/version.mjs` is the single place
  that changes it (manifest.json, package.json, package-lock.json).
- E2E is not in CI (needs Chrome for Testing, real sites, macOS keys) — run `npm run e2e` locally.

After `npm run build`, reload the extension at `chrome://extensions` (↻) and refresh open tabs.

## Architecture

Think of it as a small backend + frontend in one package:

| Layer | Folder | Role | Spring analogy |
|---|---|---|---|
| Background | `src/background/` | Service worker. Owns all `chrome.*` tab/history/bookmark logic | backend |
| ├ entry | `index.ts` | Wires Chrome events to the router/services. No logic | `@SpringBootApplication` |
| ├ router | `router.ts` | Maps a message `type` to a service call | `@RestController` |
| └ services | `*-service.ts` | Business logic | `@Service` |
| Shared | `src/shared/` | Types and helpers used by every layer | common module / DTOs |
| ├ contract | `messages.ts` | Every request the UI can send + response types | API contract |
| ├ model | `model.ts` | `ResultItem`, `CommandResult` | DTOs |
| ├ settings | `settings.ts` | `Settings` type, defaults, merge, export/import (pure) | `@ConfigurationProperties` |
| └ repository | `settings-repository.ts` | The only code touching `chrome.storage` | `@Repository` |
| i18n | `src/i18n/` | UI strings: `en.ts` is the source of keys, one file per language | `messages.properties` |
| Tools | `src/tools/` | Pure functions: calculator, dev tools. No `chrome.*` | utility classes |
| Features | `src/features/` | What the bar can enter or do on Tab (HTML/Markdown/OpenAPI, …); pure | strategy beans + registry |
| UI | `src/ui/` | The command bar component (`CommandBar` class) | frontend |
| Content | `src/content/` | Scripts that run inside web pages | — |
| Pages | `src/pages/` | Entry scripts of extension pages (options, palette, new tab) | — |
| Static | `static/` | `manifest.json`, HTML, CSS, icons — copied to `dist/` as is | `resources/` |

### Runtime flow

```
⌘T ─▶ newtab.html ─▶ background.handleNewTab ─▶ inject overlay.js into previous tab
                                                  └─ (chrome:// page) ─▶ palette.html tab
overlay.js / palette.js ─▶ CommandBar (src/ui) ──send()──▶ router ─▶ search / command / navigation service
chrome command "copy-url" ─▶ background ─▶ message to content.js (top frame) ─▶ copy + toast (ui/toast.ts: own stack, independent of the bar)
content.js (every page) ─▶ ⇧⌘C copy URL · ⌘Z reopen tab · custom "open bar" shortcut
"tab-switcher" command / Chrome's Ctrl+Tab ─▶ switcher-service ─▶ message "switcher-show" to content.js (cards, release Ctrl → switch)
tab/window events ─▶ keep-open-service ─▶ planKeepOpen (pure) ─▶ add/remove pinned guard, open bar
```

- **Overlay** = the bar injected into a web page inside a shadow root (`src/content/overlay.ts`).
- **Palette page** = the same bar as a standalone tab (`static/palette.html`), used where Chrome
  forbids scripts (chrome://, Web Store).
- The UI never calls `chrome.tabs` etc. directly — it sends a typed message (`send()` in
  `src/shared/messages.ts`) and the background does the work.
- Instant results (calculator, UUID, encoders, JWT, JSON/YAML) are computed in the UI by
  `src/tools/local-results.ts`; tabs/bookmarks/history/commands come from `search-service.ts`.
  Tool rows go first, but the regular results (web search, tabs, history) are always shown below them.
- **Markup preview** (`tools/markup.ts`, `markdown.ts`, `openapi.ts`; AsyncAPI documents pasted into the same `swagger` mode go to
  `asyncapi.ts`, both on the shared `api-schema.ts`): the rendered preview exists only inside a mode
  (`html`/`md`/`swagger` + Tab, or Tab/Enter on the hint row "Open in … mode" that a recognized paste produces; the
  text is kept). The row's `Preview.language` is `"html"` — `content` is a complete document shown in
  `<iframe sandbox="" srcdoc>` (no scripts, CSP `default-src 'none'`; `features.markupRemote` opens img/font/style
  over http(s)). A paste never gets a preview in the ordinary list, only the hint.
  Markdown/OpenAPI renderers escape everything first — never pass raw pasted HTML through them.
- **Features and Tab** (`src/features/`): the bar is in `common` state or inside one feature
  (`BarState`). A `Feature` is assembled from strategies, not inherited: a `Recognizer` (notices the
  format in the text and offers a row; its optional `score` 0..1 says how sure it is: `registry.recognize` shows a row
  from `AUTO_MIN`, after the feature's own trigger word from `PREFIX_MIN`, and keeps only the most sure member of a group), an optional `Presentation` (palette, chip, hint, rows once
  entered: only the pasted text is shown) and `TabBehavior[]` (what Tab does; the first that applies
  runs: `enterOnTrigger`, `togglePanel`, `cycleVariant`). `bar-state.ts` is a pure reducer
  (key event → state + effects); `CommandBar` only feeds it and runs the effects. Features: `markup/`
  (HTML, Markdown, OpenAPI: own view and palette), `data-viewer/` (JSON, YAML, JWT: a code panel),
  `uuid/` (Tab cycles the version). Rows produced by a feature carry its id (`ResultItem.feature`),
  which is how Tab finds the owner; the calculator and encoders stay in `tools/local-results.ts`
  and rows without a feature fall back to `FALLBACK_TAB`. Esc inside a feature goes back to the
  ordinary bar and keeps the text.
- A row with `preview` (see `Preview` in `model.ts`) gets an expand button; <kbd>Tab</kbd> opens the
  viewer panel under the results (`CommandBar.renderPreview`, highlighting in `src/ui/highlight.ts`).
- **Keep window open**: `keep-open-plan.ts` is a pure planner (windows snapshot → actions), unit-tested;
  `keep-open-service.ts` reads Chrome state, debounces events and applies the actions. The guard is
  Cmdly's own pinned `keep-open.html` — never `chrome://newtab`, which Cmdly itself replaces.
  Helpers that pick "the previous tab" must skip it (`isGuardTab` in `tab-service.ts`).
- **Tab switcher** (`switcher-service.ts`, UI `src/content/switcher.ts`, pure parts `shared/switcher.ts`):
  Ctrl+Tab is reserved by Chrome, so pages never see it. Content scripts report Ctrl down/up
  (`ctrl-state`); if the tab with Ctrl down is replaced by its neighbour, the background switches back
  and shows the switcher (`Settings.switcher.ctrlTab`). The switcher lives in the always-on content
  script (`content/switcher.ts` + `switcher.css`, inlined by esbuild): a press is one `SwitcherMessage`
  (`shared/switcher.ts`), not a script injection, so it opens without lag. `Settings.switcher.overflow`:
  `fit` (default: only the cards that fit, at most 5 — `fitCount`), `scroll` (one line) or `wrap` (rows).
  The `tab-switcher` command (`⌃Q`) does the same without the flash. MRU order uses a `lastAccessed` snapshot taken on Ctrl down, so the neighbour's
  brief activation doesn't count. Previews: `captureVisibleTab` after activation → downscaled JPEG in
  `chrome.storage.session` (`thumb:<tabId>`), never in incognito, never while Cmdly UI is on screen.
- **Bar state** (`bar-state-service.ts`, `chrome.storage.session`): the typed text is a draft that
  survives closing the bar and reloads until something is run (then `clearDraft`); an overlay that
  was open when its page reloaded is injected again (same URL only). `open`/`command` messages clear
  the mark first so "Reload tab" doesn't resurrect the bar.
- **Search suggestions** are a separate `suggest` message: the UI draws tabs/history first, then
  merges suggestion rows (`withSuggestions`) when the network answers — at the end of the list by default, or
  under the web-search row (`Settings.suggest.position`).
- **Chrome settings commands**: every chrome://settings section is a command built from the data table in
  `background/chrome-pages.ts` (title keys `pg*`, toggle `features.chromeSettings`).
- **Experimental** (`Settings.experimental`, options panel "Experimental", all off by default): with every flag
  off the classic path in `search-service.ts` (`score()`, fixed group order) runs unchanged.
  `ranking` → `rankedSearch`: all sources become `Candidate`s and `rank()` (`shared/ranking.ts`) puts them on one
  scale (word-start matching, NFKD, wrong keyboard layout, source priors, frecency, per-source caps); a row with
  `final ≥ TOP_HIT` goes above web search and owns Enter. `learned` → `choice-service.ts` records "typed text →
  picked row" in `chrome.storage.local` (pure part `shared/learned.ts`, never incognito, cleared by the button or
  by turning it off). `scopes` → `parseScope`: `>` ranks every command, `settings …` (any UI language) every
  settings page.
- A row with `variant` (see `Variant` in `model.ts`) shows a chip; <kbd>Tab</kbd> calls
  `CommandBar.cycleVariant`, which stores the next value in `Settings.tools` and re-renders.
  Used for the UUID version (`src/tools/uuid.ts`: v4, v7, v1).
- The input is single-line and would drop line breaks on paste; `CommandBar` keeps the raw pasted
  text (`pasted`) so YAML survives. Use `rawQuery()` when analyzing input.

## How to…

- **Add a language** → `src/i18n/<chrome_locale>.ts` (copy `de.ts`, set `localeCode`), register it in
  `src/i18n/locales.ts`. The build writes `dist/_locales/<locale>/messages.json`; Chrome picks the
  locale from the browser language. Name ≤ 75 and description ≤ 132 chars (tested).

- **Add a browser command** → one entry in `COMMANDS` in `src/background/command-service.ts`.
  Need a new icon? Add it to `GlyphName` (`src/shared/model.ts`) and `GLYPHS` (`src/ui/icons.ts`).
- **Add a feature** (something with its own view or a Tab action) → a file in its group under
  `src/features/` built from existing parts (see `markup/shared.ts`), one line in `registry.ts`,
  palette in the feature file, strings in all 5 languages. `command-bar.ts` stays untouched.
- **Add a tool** (e.g. a converter) → pure function in `src/tools/`, hook it into
  `localResults()`, add a feature flag to `Settings.features` + defaults + a toggle in
  `static/options.html`, add tests in `tests/tools/`.
- **Add a setting** → field in `Settings` and `DEFAULT_SETTINGS` (`src/shared/settings.ts`),
  a control with `data-path="section.key"` inside the matching `<section class="panel">` of `static/options.html` (panels: General, Shortcuts, Search, Tools, Tab switcher, Appearance, Backup, About; the sidebar, settings search and "Reset this section" work off the markup, no JS). Numeric ranges go in `RANGES` (`settings.ts`).
- **Add a message type** → `Request` + `ResponseMap` in `src/shared/messages.ts`, a `case` in
  `src/background/router.ts`. TypeScript will flag a missing case.

## Rules

- TypeScript strict. Type-only imports use `import type`. No enums/namespaces/parameter
  properties (tests run through Node's type stripping — `erasableSyntaxOnly` enforces this).
- Imports use explicit `.ts` extensions.
- `src/tools/` and pure parts of `src/shared/` must not touch `chrome.*` — they are unit-tested in Node.
- Every bundle in `dist/` is self-contained (content scripts can't import modules). Entry points
  are listed in `scripts/build.mjs`.
- Never hard-code company/internal URLs: the repo is public. User-specific values go to Settings.
- Privacy: no analytics, nothing goes to the developer. The only network request is search
  suggestions (`background/suggest-service.ts`, toggle `sources.suggestions`): no cookies, never in
  incognito, and `maySuggest` (`shared/suggestions.ts`) keeps pasted data/tokens local. Never add
  other requests without a setting. Keep `PRIVACY.md` true when adding features.
- **No hard-coded UI text.** Every user-visible string is a key in `src/i18n/en.ts` used via `t()` /
  `tp()` (plurals) from `src/i18n/index.ts`, or `data-i18n` in static HTML (`localizePage()`).
  Add the same key to `ru.ts`, `zh_CN.ts`, `de.ts`, `fr.ts` — TypeScript and `tests/i18n` fail otherwise.
  Not translated on purpose: command keywords (English search aliases), GitHub issue templates.
- Anything inserted with `innerHTML` must go through `escapeHtml` (`src/ui/highlight.ts`): the bar
  runs inside other people's pages and renders pasted text.
- **Logging**: use `log.error/warn/info/debug(scope, message, error?)` from `src/shared/log.ts`, never bare
  `console.*`. Never put user text (queries, pasted data, URLs) in a log message: the log can end up in a public
  issue. Every entry point calls `initLogging(scope)` (`log-runtime.ts`; the background uses `startLogging()`), which
  also records uncaught errors and unhandled rejections. Entries go to a size-limited `LogRing` (`Settings.logs.maxKb`,
  1 MB by default) flushed to `chrome.storage.session` in batches (`background/log-service.ts`); "Copy log" / "Save
  to file…" turn it into a report. `debug` is the trace — entering a service, which branch was taken, with facts as
  `kv({ tab, win, state })`: ids, counts, states, never text. It is kept only with `logs.verbose`. The router traces
  every request with its duration; `window-watch-service.ts` logs window state changes (fullscreen ↔ normal) at
  `info`. Settings → Diagnostics (`logs.panel`) follows the log live through the `log-tail` port
  (`pages/log-view.ts`): the view keeps `LIVE_VIEW_KB` on screen and disconnects when hidden.
  A fallback that hides an error (`catch {}`) should log at `debug`/`info` with the error.
- Code comments explain *why*, not *what*. Match the existing style.

## Testing

- Unit: `tests/**/*.test.ts` mirror `src/` folders. Run `npm test`.
- E2E: `scripts/e2e.mjs` loads `dist/` into Chrome for Testing via puppeteer-core and checks
  overlay, ⌘T flow, ⇧⌘C, ⌘Z, JSON/YAML viewer, keep window open, options. Branded Chrome can't load unpacked extensions from the
  command line, hence Chrome for Testing:
  `npx @puppeteer/browsers install chrome@stable` → `export CHROME_PATH=…`.
- Run `npm run check` before committing; run `npm run e2e` after touching background/content/UI.
- UI changes: refresh the README media with `npm run e2e -- --screenshots` and `npm run demo`.

## Known limitations (by Chrome design)

- `⌘T` as a manifest `suggested_key` is rejected by Chrome (the command stays unbound), but a user
  can assign it at `chrome://extensions/shortcuts`. With it assigned, `⌘T` fires the `open-bar`
  command (no new tab, no flash) and `handleNewTab` treats new tabs as the "+" button (bar opens
  in that tab). Without it, the fallback overrides the new tab page, closes it and shows the overlay
  on the previous tab — the new tab flashes. The options page shows a setup banner until it's done.
- CDP (puppeteer) key events never reach browser accelerators, so `⌘T` itself can't be e2e-tested;
  the e2e test assigns the command via `chrome.developerPrivate` from chrome://extensions instead.
- Extensions can't run on `chrome://` pages and the Web Store: no overlay, no page shortcuts there.
- Ctrl+Tab can't be intercepted: Chrome switches first, Cmdly undoes it — the neighbour tab flashes.
  On chrome:// pages the switcher can't be shown (the command falls back to "previous tab").
- Split View: the overlay appears only in the focused pane (each pane is a separate tab).
