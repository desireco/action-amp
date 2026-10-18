# Add to ActionAmp — the Chrome extension

The toolbar capture: click the ActionAmp button (or press Alt+Shift+A) on
any page and it opens `/share?title=&text=&url=` — the same review page the
PWA share target and the `bookmarklet/` use, where you add a note, pick a
destination (Inbox / Project / Simple list), and confirm. Nothing is
captured until you confirm there.

This exists because browsers refuse favicons for `javascript:` bookmarks —
the bookmarklet can never wear the ActionAmp icon on the bar; the extension
can (#22).

## Install (Load unpacked — no store yet)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this `extension/` folder.
3. Pin **Add to ActionAmp** from the puzzle-piece menu so the button sits
   on the toolbar.

Works the same in Edge (edge://extensions) and other Chromium browsers.

## Point it at localhost for testing

Right-click the toolbar button → **Options** → set the ActionAmp address
(default `https://app.actionamp.com`; for local dev use
`http://localhost:5174`). Saved in `chrome.storage.sync`.

## Files

- `manifest.json` — MV3; permissions are only `activeTab` + `scripting` +
  `storage` (the tab you clicked on — no broad host access).
- `background.js` — the click/command handler: reads the active tab's
  title/URL, injects a one-liner for the selection, opens the share tab.
- `capture.js` — the share-URL builder (unit-tested in `capture.test.js`,
  run with `bun test extension` from the repo root).
- `options.html`/`options.js` — the target-origin setting.

## Known limits

- On pages that block script injection (chrome://, the Chrome Web Store,
  file:// without the file-access grant), the capture still opens with
  title + URL — just no selection text.
- Alt+Shift+A is a *suggested* shortcut; Chrome may have it taken by
  another extension — change it at `chrome://extensions/shortcuts`.
- Web Store publication (listing, screenshots, review) is tracked in #22
  as a follow-up once the flow is proven.

Be logged in to ActionAmp (same browser) — the review page needs your
session to confirm.
