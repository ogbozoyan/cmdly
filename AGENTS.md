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
- `.github/workflows/release.yml` — **Run workflow** (patch/minor/major) or a pushed tag `vX.Y.Z`:
  bumps the version via `scripts/version.mjs` (manual run), verifies tag = manifest = package version,
  runs `npm run package`, commits/tags as github-actions[bot] and publishes a GitHub release with
  `cmdly-X.Y.Z.zip` and generated notes.
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
| UI | `src/ui/` | The command bar component (`CommandBar` class) | frontend |
| Content | `src/content/` | Scripts that run inside web pages | — |
| Pages | `src/pages/` | Entry scripts of extension pages (options, palette, new tab) | — |
| Static | `static/` | `manifest.json`, HTML, CSS, icons — copied to `dist/` as is | `resources/` |

### Runtime flow

```
⌘T ─▶ newtab.html ─▶ background.handleNewTab ─▶ inject overlay.js into previous tab
                                                  └─ (chrome:// page) ─▶ palette.html tab
overlay.js / palette.js ─▶ CommandBar (src/ui) ──send()──▶ router ─▶ search / command / navigation service
content.js (every page) ─▶ ⇧⌘C copy URL · ⌘Z reopen tab · custom "open bar" shortcut
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
- A row with `preview` (see `Preview` in `model.ts`) gets an expand button; <kbd>Tab</kbd> opens the
  viewer panel under the results (`CommandBar.renderPreview`, highlighting in `src/ui/highlight.ts`).
- **Keep window open**: `keep-open-plan.ts` is a pure planner (windows snapshot → actions), unit-tested;
  `keep-open-service.ts` reads Chrome state, debounces events and applies the actions. The guard is
  Cmdly's own pinned `keep-open.html` — never `chrome://newtab`, which Cmdly itself replaces.
  Helpers that pick "the previous tab" must skip it (`isGuardTab` in `tab-service.ts`).
- **Bar state** (`bar-state-service.ts`, `chrome.storage.session`): the typed text is a draft that
  survives closing the bar and reloads until something is run (then `clearDraft`); an overlay that
  was open when its page reloaded is injected again (same URL only). `open`/`command` messages clear
  the mark first so "Reload tab" doesn't resurrect the bar.
- **Search suggestions** are a separate `suggest` message: the UI draws tabs/history first, then
  merges suggestion rows under the web-search row (`withSuggestions`) when the network answers.
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
- **Add a tool** (e.g. a converter) → pure function in `src/tools/`, hook it into
  `localResults()`, add a feature flag to `Settings.features` + defaults + a toggle in
  `static/options.html`, add tests in `tests/tools/`.
- **Add a setting** → field in `Settings` and `DEFAULT_SETTINGS` (`src/shared/settings.ts`),
  a control with `data-path="section.key"` in `static/options.html`. Simple controls need no JS.
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
- Split View: the overlay appears only in the focused pane (each pane is a separate tab).
