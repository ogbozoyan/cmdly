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
npm run release -- 1.2.0   # bump manifest/package version, commit, tag vX.Y.Z, push
```

### CI / releases (GitHub Actions)

- `.github/workflows/ci.yml` — every push to main and every PR: `npm ci` + `npm run check`
  (typecheck, unit tests, build) + manifest/package version match. `dist/` is uploaded as an artifact.
- `.github/workflows/release.yml` — on tag `vX.Y.Z`: verifies the tag equals the manifest version,
  runs `npm run package` and publishes a GitHub release with `cmdly-X.Y.Z.zip` and generated notes.
- Never create releases by hand: use `npm run release -- X.Y.Z` (clean tree, on main).
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
- The input is single-line and would drop line breaks on paste; `CommandBar` keeps the raw pasted
  text (`pasted`) so YAML survives. Use `rawQuery()` when analyzing input.

## How to…

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
- Privacy: no network requests, no analytics. Everything stays in the browser.
  Keep `PRIVACY.md` true when adding features.
- Keep the UI copy in English (the Web Store listing is English).
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
