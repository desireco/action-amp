# ActionAmp inbox bookmarklet

A bookmarks-bar button that captures the current page — title, URL, and any
text selection — and opens it in ActionAmp's `/share` review page, the same
confirm flow the PWA share target uses. Nothing is written until you confirm
there: add a note, pick a destination (Inbox / Project / Simple list), and
the item goes through the normal authenticated ops.

## Install

Open [`install.html`](install.html) (double-click it — no server needed) and
drag the **Add to ActionAmp** button to your bookmarks bar. A dev twin
pointing at `localhost:5174` sits next to it for local testing.

Can't drag a `javascript:` link (some browsers make this fiddly)? Create a
bookmark manually and paste the one-liner from `install.html` into its URL
field.

## How it works

The bookmarklet (readable source: [`actionamp-share.src.js`](actionamp-share.src.js))
collects `document.title`, `location.href`, and `window.getSelection()`, then
opens `https://app.actionamp.com/share?title=…&text=…&url=…` in a new tab.
The review page composes its capture fields from the query when there's no
`?pending=` id (`web/src/routes/share/+page.svelte`, issue #21).

This handoff shape isn't a preference — it's the only one that works from a
bookmarklet: it can't write the app origin's IndexedDB (where OS shares
stash), and a cross-site POST can't carry SameSite session cookies, so there
is no silent one-click path without CORS + token work (out of scope, #21).

## Limits

- **Be logged in first** — the review page needs your session to confirm;
  logged out, the confirm fails with the standard error copy.
- **After saving** — the tab goes to your Inbox (triage now) or just closes,
  per the **After saving** choice in Settings → Preferences (default: Inbox).
  A tab that can't be script-closed (e.g. the OS share launch) falls back to
  the app home.
- **2000-char field cap** — each field truncates to the app's field cap; a
  very long selection gets cut.
- **Popup blockers** — the capture opens a new tab; a blocker that eats it
  gets the copy-paste fallback above.
- Selections are plain text (no rich formatting, no images — bookmarklets
  can't hand off files).
