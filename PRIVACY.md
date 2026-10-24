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

## Data Cmdly sends

**None.** Cmdly makes no network requests of its own, has no servers, no analytics, no tracking
and no ads. Web searches you start from the bar are performed by Chrome's default search engine,
exactly as if you typed them into the address bar.

## Permissions

| Permission | Why |
|---|---|
| `tabs` | List and switch to open tabs, run tab commands (pin, mute, close…) |
| `history`, `bookmarks` | Show matching pages in search results |
| `sessions` | Reopen recently closed tabs (`⌘Z`) |
| `search` | Run web searches with your default search engine |
| `favicon` | Show site icons next to results |
| `scripting`, host access to all sites | Show the command bar on top of the page you're on and handle shortcuts there |
| `storage` | Save your settings |

## Contact

Questions or issues: <https://github.com/ogbozoyan/cmdly/issues>
