# GTA 6 Spoiler Shield

A Chrome extension that hides YouTube videos and Shorts whose **titles** suggest GTA VI content, so you can avoid spoilers until you can play the game yourself.

- **YouTube only.** It has no access to any other website.
- **Aggressive by design.** Strict mode is the default, and standalone "GTA" is blocked, so an occasional GTA V video disappears too.
- **Fully local.** No servers, no analytics, no remote code, no external requests.
- **Reversible.** Hidden videos are restored instantly when you turn the extension off.

## Install

1. Open `chrome://extensions/`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `GTA-6-Spoiler-Shield` folder (the one containing `manifest.json`).
5. Click the puzzle-piece icon in Chrome's toolbar and **pin** GTA 6 Spoiler Shield.
6. **Reload any YouTube tabs that were already open.** Chrome only injects the extension into pages loaded after it was installed.

No build step, no dependencies. Keep the folder where it is, because Chrome loads the extension from it.

## Using it

**Toolbar popup**: master ON/OFF switch, current mode (you can switch it here), videos blocked this browser session, videos hidden on the current page, number of active keywords, and a clear "filtering is active / off" indicator. The toolbar icon shows `OFF` while filtering is disabled.

**Settings** (popup → *Open settings*, or right-click the icon → *Options*):

| Section | What you can do |
|---|---|
| Filtering | Choose Balanced, Strict or Custom. Custom lets you switch keyword categories on and off and set sensitivity (low, medium, high). |
| Display and behavior | Optional placeholder ("Video hidden by GTA 6 Spoiler Shield."), optional "Show anyway" button (off by default), and skipping past hidden Shorts. |
| Keywords | Search, add, edit, delete, enable or disable any keyword. Deleted defaults can be restored. Combination rules can be switched on and off. |
| Test titles | Paste titles and see what Balanced, Strict and Custom would each do, and which keyword triggered it. |
| Statistics | Total blocked, session total, top keywords, per-category counts, reset. |
| Backup and reset | Export or import your configuration as JSON, restore defaults. |

Keyword edits and additions apply in **every** mode. Category switches and sensitivity apply only in **Custom** mode.

## The three modes

| | Balanced | Strict (default) | Custom |
|---|---|---|---|
| GTA identifiers, locations, unique character names | block | block | per category |
| Common names (Jason, Brian, Raul, Cal, Roxy, Lori) | only with a spoiler-style word such as *death, story, ending, mission, trailer*, or next to another GTA VI term | **always block** | by sensitivity |
| Generic phrases ("Ending Explained", "Full Playthrough", "Easter Eggs") | never on their own | block when a game word also appears (*game, gameplay, campaign, mission…*, Rockstar) or two different generic phrases appear | by sensitivity |
| Rockstar combinations | Rockstar + leak / announcement / delay / release date / new game | adds Rockstar + trailer / teaser / update / rumor, and leak + open world | by sensitivity |
| Obfuscated spellings ("G T A 6", "G.T.A. VI") | no | yes | high only |

Custom sensitivity maps to: low (names need a generic phrase or a second name), medium (Balanced rules), high (Strict rules).

## How matching works

Titles are normalised before matching: case-insensitive, accents and fancy Unicode letters folded (`𝗚𝗧𝗔 𝟲` → `gta 6`), apostrophes and punctuation removed, `-` and `_` treated as spaces, possessives dropped (`Lucia’s` → `lucia`), and `GTA6` / `GTAVI` split into `gta 6` / `gta vi`. Matching is by whole word or phrase, so `Brian` never matches `Brianna`.

**Examples** (verified by the tests): `GTA 6 Gameplay`, `GTA VI Ending Explained`, `Grand Theft Auto 6 Full Story`, `Lucia's Secret`, `Vice City Map Revealed`, `Every GTA 6 Mission` and `Jason's Death Explained` are hidden in both Balanced and Strict. `My Great Adventure`, `Elden Ring ending explained` and `Rockstar Games Launcher not opening fix` stay visible.

**Only titles are read.** Channel names, descriptions and comments are never used. A video from a channel called "GTA News" with an unrelated title stays visible.

## Editing the keyword database

Easiest: the **Keywords** section of Settings.

For bulk edits, open `data/keywords.js`. Each entry is `[text, kind, aliases]`, for example `D('Port Gellhorn')` (always block) or `C('Final Boss')` (needs context). The file header explains every kind. The engine never needs touching. Reload the extension at `chrome://extensions/` after editing the file.

The character and location lists are the ones from your brief. Verify them against Rockstar's official material before relying on them, and add or remove names as you see fit.

## Known false positives (intentional)

- Standalone **GTA** hides GTA V and GTA Online videos.
- **Lucia**, **Vice City**, **Ambrosia** and **Leonida** are blocked in every mode (Saint Lucia travel videos and ambrosia dessert recipes will disappear).
- In Strict, any video about a person called Brian, Jason, Raul, Cal, Roxy or Lori is hidden.

If something bothers you, use Settings → Keywords to disable that single keyword.

## What it cannot reliably catch

Being honest about the limits matters when the goal is "no spoilers":

- **Autoplay.** If a hidden video is YouTube's "Up next" pick, autoplay can still start it. Turn Autoplay off in the player.
- **Direct links.** A GTA video opened from a bookmark, an email, a shared link or a notification is not blocked. Only recommendation, search and listing cards are hidden.
- **Titles with no keyword.** A video titled "You won't believe how it ends" is invisible to a title filter. Thumbnails of videos that do pass the filter can still show spoilers.
- **Comments, descriptions and chapters** are never scanned, so spoilers in the comments of a harmless video can still appear.
- **YouTube search suggestions**, the notifications panel, and Google Search/Reddit/other sites are outside the extension.
- **Player end screens** are filtered on a best-effort basis; YouTube changes those class names often.
- **YouTube changes its page structure regularly.** The extension targets the element names listed at the top of `content/youtube.js` (`CARD_SELECTORS`, `OUTER_SELECTORS`, `TITLE_SELECTORS_*`). If a section of YouTube stops being filtered, that file is the only place to update. Please see "Tested" below for what was and was not verified.
- Desktop `www.youtube.com` only. Not the mobile site, YouTube Music, YouTube Studio or embedded players on other sites.

## Permissions and privacy

- Permission: `storage` only (settings and statistics, in `chrome.storage.local`; the session counter uses `chrome.storage.session`).
- Site access: `https://www.youtube.com/*` only (the content script match pattern). No other host permissions.
- No network requests of any kind, no analytics, no telemetry, no remote scripts, no data collection.

## How it works (for maintainers)

```
manifest.json
data/keywords.js            keyword database (data only)
shared/config.js            settings schema, sanitising, storage, import/export
content/filtering-engine.js normalisation + matching + decisions (pure logic, unit-tested)
content/dom-observer.js     MutationObserver, batching, debounce, SPA navigation
content/youtube.js          YouTube card types, title extraction, hide/restore
content/youtube.css         attribute-driven hiding (inactive until marked)
background/service-worker.js defaults on install, serialised statistics, OFF badge
popup/, options/            UI
shared/theme.css            shared dark theme
tests/                      unit tests and browser end-to-end test
```

- A blocked card gets one attribute, `data-gta6ss`, and CSS does the hiding. YouTube's own nodes are never removed or rewritten, so restoring means removing the attribute. Turning the switch off restores everything, removes placeholders and disconnects the observer. Turning it on rescans immediately.
- New cards are judged on the next animation frame, before the browser paints them. If a card's title has not rendered yet it stays invisible (never longer than 1.5 s), then is judged when the title appears.
- Results are cached per title; each card is re-checked only when its title or your settings change. The observer ignores attribute changes made by the extension, so there is no feedback loop.
- In the Shorts feed a blocked Short keeps its space (YouTube lays that feed out by size) but is invisible and paused, and the feed moves on to the next one.

## Tested

Run the unit tests (needs only Node):

```
node tests/engine.test.js
```

Run the browser test (needs Playwright and a Chromium build):

```
PLAYWRIGHT=/path/to/node_modules/playwright CHROME=/path/to/chrome node tests/e2e.chromium.js
```

The end-to-end test loads the real extension into Chromium and drives a **mock** YouTube page that uses the element names above. It covers hiding and restoring, delayed titles, 600 cards at once, title recycling, SPA navigation, Shorts skipping, ON/OFF, mode switching, placeholder and reveal, custom keywords, statistics, popup, settings (add, edit, delete, import, export, defaults) and persistence across a browser restart.

**Not verified:** behaviour on the live youtube.com. The sandbox the extension was built in has no internet access, so the element names are based on YouTube's known markup, not checked against today's pages. Do a quick check after installing: open the homepage, search for "GTA 6", open a video and look at the sidebar, and open Shorts. If a section is not filtered, see the note above about `content/youtube.js`.

## Troubleshooting

- **Nothing is hidden:** reload the YouTube tab, and check the popup says filtering is active.
- **Too many videos hidden:** switch to Balanced, or disable the offending keyword in Settings. Use *Test titles* to see which keyword fired.
- **Changed `data/keywords.js` but nothing happened:** click the reload icon for the extension at `chrome://extensions/`, then reload YouTube.
