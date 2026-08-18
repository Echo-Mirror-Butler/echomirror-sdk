# EchoMirror — Chrome extension

A Manifest V3 extension for a two-click daily mood check-in, backed by the
EchoMirror JS SDK (`@echomirror/core` + `@echomirror/mood`).

- **Popup** — score slider, optional note and tags, submitted through the SDK.
- **Service worker** — a `chrome.alarms` alarm at your chosen time; if no mood
  was logged that day it raises a single `chrome.notifications` reminder.
- **Options page** — API key, network, reminder time, and a reminder opt-out.
- **Storage** — everything lives in `chrome.storage.local` behind a small
  validated wrapper ([`src/lib/storage.ts`](src/lib/storage.ts)); service
  workers are suspended between events and have no `localStorage`.

## Build

```bash
# from the repo root — builds the SDK packages the bundle depends on
npm install
npm run build -w packages/js/core -w packages/js/mood

cd extensions/chrome
npm run build      # -> dist/  (load unpacked)
npm run dev        # same, plus source maps and rebuild on change
npm run package    # -> dist-zip/echomirror-chrome-<version>.zip
npm test           # unit tests (storage, reminder logic, API, manifest, zip)
```

`dist/` is the unpacked extension: bundled ES modules, HTML/CSS, generated
icons and `manifest.json`. Nothing is fetched at runtime — MV3 forbids remotely
hosted code, and the CSP (`script-src 'self'`) enforces it.

### Loading it in Chrome

1. `npm run build`
2. Visit `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select `extensions/chrome/dist`.
4. Open the extension options, paste an API key from
   [echomirror.dev/developers](https://echomirror.dev/developers), save.
5. Click the toolbar icon and log a mood.

## Permissions

The extension requests three permissions and one host. Each is justified inline
in [`scripts/manifest.mjs`](scripts/manifest.mjs), which is the source of truth
for `manifest.json`:

| Permission | Why |
| --- | --- |
| `storage` | API key, reminder preferences, and the local "logged today" marker. |
| `alarms` | Wakes the suspended service worker at the reminder time. |
| `notifications` | The reminder itself — at most one per day. |
| `https://api.echomirror.dev/*` | The only host contacted; mood entries and streaks. |

No `tabs`, no `scripting`, no content scripts, no analytics. The API key is
stored in the browser profile and sent only to `api.echomirror.dev`.

## Architecture

```
src/
  background.ts     service worker: schedules the alarm, decides on reminders
  popup.ts          check-in form
  options.ts        settings page
  lib/
    api.ts          SDK client construction + user-facing error messages
    reminder.ts     pure scheduling logic (next alarm, "is a reminder due?")
    settings.ts     persisted shapes, defaults, validation
    storage.ts      chrome.storage.local wrapper
    format.ts       score faces and streak labels
  ui/               popup.html, options.html, CSS
scripts/
  manifest.mjs      manifest source of truth (permissions carry comments)
  build.mjs         esbuild bundle + assets -> dist/
  zip.mjs           dependency-free ZIP writer -> dist-zip/
  icons.mjs         generates the PNG icons at build time
```

The reminder decision is a pure function (`shouldRemind`) evaluated against the
wall clock rather than trusting the alarm to be punctual — Chrome delivers
missed alarms late, after the browser restarts.

## Manual QA checklist

Verified against Chrome 140 with the API mocked at `api.echomirror.dev`:

1. Load unpacked — the service worker registers with no console errors
   (`chrome://extensions` → *service worker* → Inspect).
2. Options → save an API key → **Test connection** reports the current streak.
3. `chrome.alarms.get('echomirror.reminder')` in the worker console shows the
   alarm scheduled at the configured time.
4. Popup → pick a score, add a note and tags → **Log mood** posts to
   `/v1/mood/entries` and the toolbar badge dot clears.
5. Clear `lastLoggedDate` in `chrome.storage.local` and re-fire the alarm — one
   reminder notification appears; clicking it opens the check-in.

## Publishing

See [`store/listing.md`](store/listing.md) for the Web Store listing copy,
permission justifications, privacy disclosures and the submission checklist.
`npm run package` produces the upload artifact.
