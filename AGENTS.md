# AGENTS.md

Guide for AI coding agents (Claude Code, Codex, OpenCode…) and humans working on Cmdly.
`CLAUDE.md` is a symlink to this file — edit `AGENTS.md` only.

## What this is

Cmdly is a Chrome extension (Manifest V3): an Arc-style command bar. `Cmd+T` shows a search bar
over the current page that finds open tabs, bookmarks and history, runs browser commands
(Copy URL, Pin Tab…), and has small tools (calculator, UUID, Base64/URL, JWT).
It also adds shortcuts: `⇧⌘C` copies the page URL, `⌘Z` reopens a closed tab.

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
npm run package      # check + zip dist/ for the Chrome Web Store
```

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
```

- **Overlay** = the bar injected into a web page inside a shadow root (`src/content/overlay.ts`).
- **Palette page** = the same bar as a standalone tab (`static/palette.html`), used where Chrome
  forbids scripts (chrome://, Web Store).
- The UI never calls `chrome.tabs` etc. directly — it sends a typed message (`send()` in
  `src/shared/messages.ts`) and the background does the work.
- Instant results (calculator, UUID, encoders, JWT) are computed in the UI by
  `src/tools/local-results.ts`; tabs/bookmarks/history/commands come from `search-service.ts`.

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
- Code comments explain *why*, not *what*. Match the existing style.

## Testing

- Unit: `tests/**/*.test.ts` mirror `src/` folders. Run `npm test`.
- E2E: `scripts/e2e.mjs` loads `dist/` into Chrome for Testing via puppeteer-core and checks
  overlay, ⌘T flow, ⇧⌘C, ⌘Z, options. Branded Chrome can't load unpacked extensions from the
  command line, hence Chrome for Testing:
  `npx @puppeteer/browsers install chrome@stable` → `export CHROME_PATH=…`.
- Run `npm run check` before committing; run `npm run e2e` after touching background/content/UI.

## Known limitations (by Chrome design)

- Chrome doesn't let extensions intercept `⌘T`. Cmdly overrides the new tab page, closes it and
  shows the overlay on the previous tab — the new tab flashes for a split second. A shortcut
  assigned at `chrome://extensions/shortcuts` avoids the flash.
- Extensions can't run on `chrome://` pages and the Web Store: no overlay, no page shortcuts there.
- Split View: the overlay appears only in the focused pane (each pane is a separate tab).
