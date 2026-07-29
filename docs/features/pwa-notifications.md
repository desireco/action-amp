---
slug: pwa-notifications
title: "PWA install, app-icon shortcuts, and daily Today reminder"
feature_area: app-shell
status: shipped
spec: —
verified: 2026-07-21
---

# PWA notifications

**What.** ActionAmp installs as a standalone PWA. Its app-icon menu offers
Capture, Next task, and Today. Capture uses `/app?capture=1` to open the same
universal capture popover as `⌘K`.

**Daily Today reminder.** Settings → Preferences can request notification
permission and choose a local reminder time. The browser Push subscription is
stored per device; a Wasp PgBoss job runs each minute, sends once per user/day,
and notification actions open Capture, Next, or Today.

**Deployment configuration.** Set all three server environment variables:
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a `mailto:` or
HTTPS contact URI). Generate the key pair once with `npx web-push generate-vapid-keys`.
Without them, Settings keeps reminders off and explains that notifications are
not configured. No authenticated task data is cached by the service worker.

**Browser limits.** Manifest app-icon shortcuts work in supporting installed
PWAs (notably Chromium). Safari/iOS may omit that menu, but notification taps
still route to the right screen where Web Push is supported.

**Files.** `public/manifest.webmanifest`, `public/service-worker.js`,
`src/notifications/`, `src/app/PreferencesPage.tsx`.

## Share target (Android/Chrome)

The installed PWA is a share target. Sharing from another app (browser,
Twitter, notes) surfaces ActionAmp in the share sheet; selecting it opens a
review screen before anything is saved to the inbox.

**Flow:**

1. User shares text, a link, or one image from another app → Android POSTs the form to same-origin
   `/share`. The installed service worker writes the text fields to a
   short-lived, same-origin IndexedDB record and redirects to `/share?pending=`.
2. `/share` separates a shared page's title, body, source link, and image before
   showing **Add to inbox** and **Not now**. The source link is saved as an
   attached-reference property; an image is previewed then saved as an Inbox
   attachment (one image, up to 5 MB). Android's duplicated page titles are removed.
   Nothing reaches the server until the user confirms.
3. **Add to inbox** calls the normal `createInboxItem` action; it uses the same
   authenticated capture path as `⌘K` and is therefore read by Inbox directly.
4. After saving, ActionAmp opens `/app/inbox`, where the new item is first in
   the universal inbox.

**Wiring:**

- `webapp/public/manifest.json` — the `share_target` block (action `/share`,
  method POST, `multipart/form-data`, accepts Android's generic `image/*`
  intent plus common JPEG, PNG, WebP, GIF, and HEIC/HEIF types/extensions).
- `webapp/src/share/` — `shareCapture.ts` (route handler),
  `composeShareText.ts` (field composition), `pendingShare.ts` (short-lived
  pending payload), `shareRouteMiddleware.ts` (urlencoded parsing),
  `SharePage.tsx` (review + acknowledgement page).
- `webapp/src/inbox/operations.ts` — `getInboxItem` query (single-item fetch
  for the confirmation page, ownership-gated).

**iOS gap.** `share_target` is Android/Chrome only. iOS Safari ignores the
manifest block — the feature simply doesn't appear in the iOS share sheet.
iOS requires a native Share Extension (a post-PMF native-shell concern; see
`docs/ROADMAP.md` Icebox). iOS users continue to use `⌘K` / paste capture.

**Spec + plan.** `docs/superpowers/specs/2026-07-25-pwa-share-target-design.md`
+ `docs/superpowers/plans/2026-07-25-pwa-share-target.md`.
