# Privacy Policy

_Last updated: October 25, 2026_

Cmdly is a command bar for Chrome. It is designed to work entirely inside your browser.

## Data Cmdly accesses

To show search results and run commands, Cmdly reads — **locally, on your device** — your open tabs,
bookmarks, browsing history and recently closed tabs. This data is used only to display results
in the command bar at the moment you search.

## Data Cmdly stores

Only your Cmdly settings (enabled features, shortcuts, appearance). They are saved with
`chrome.storage.sync`, which Chrome may sync between your own devices when Chrome Sync is on.
You can export, import or reset them on the settings page.

Text you typed into the bar but didn't run is kept in Chrome's in-memory session storage for
up to 10 minutes, so it is still there if the bar closes or the page reloads. It never touches disk
and is gone when Chrome quits.

**Tab switcher previews** (on by default, Settings → Keyboard shortcuts → Tab previews): when you
look at a tab, Cmdly takes a small screenshot of it to show in the tab switcher. Previews live in the
same in-memory session storage, are deleted when the tab closes or the option is turned off, are
never taken in incognito windows and never leave your browser.

## Data Cmdly sends

Cmdly has no servers, no analytics, no tracking and no ads. Nothing is ever sent to the developer.

**Search suggestions** (on by default, can be turned off in Settings → Search sources): while you
type, the text is sent to the search engine you picked (Google by default; Bing, DuckDuckGo or Yandex)
to get suggested queries — the same thing Chrome's address bar does. Requests carry no cookies.
They are never made in incognito windows, and never for pasted JSON/YAML, tokens/JWTs, long encoded
strings, tool commands or math.

**HTML / Markdown / OpenAPI preview**: pasted text is rendered locally in a sandboxed frame — scripts never
run and, by default, the preview makes no network requests at all. Only if you turn on
"Load external images and styles" in Settings may the pasted HTML fetch images, fonts and styles it
references (directly from their servers, without cookies). Pasted markup is never sent to search suggestions.

Web searches you start from the bar are performed by Chrome's default search engine,
exactly as if you typed them into the address bar.

## Permissions

| Permission | Why |
|---|---|
| `tabs` | List and switch to open tabs, run tab commands (pin, mute, close…) |
| `history`, `bookmarks` | Show matching pages in search results |
| `sessions` | Reopen recently closed tabs (`⌘Z`) |
| `search` | Run web searches with your default search engine |
| `favicon` | Show site icons next to results |
| `scripting`, host access to all sites | Show the command bar on top of the page you're on and handle shortcuts there; request search suggestions |
| `storage` | Save your settings |
| host access to all sites (`captureVisibleTab`) | Tab switcher previews (see above) |
| `clipboardWrite` | Copy the page URL with a Chrome-level shortcut, even when the page isn't focused |

## Contact

Questions or issues: <https://github.com/ogbozoyan/cmdly/issues>
