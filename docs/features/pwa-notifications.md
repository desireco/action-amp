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
Twitter, notes) surfaces ActionAmp in the share sheet; selecting it saves the
shared content to the inbox.

**Flow:**

1. User shares from another app → Android opens the PWA at `/share` with a
   POSTed form (`title` / `text` / `url`).
2. `POST /api/share` composes a single string (`Title — url` precedence — see
   `composeShareText`) and saves it via `createInboxItemCore` — the same core
   `⌘K` capture and the CLI use.
3. The route 303-redirects:
   - logged in, success → `/share?id=<itemId>` (confirmation page)
   - logged in, empty payload → `/share?error=empty`
   - logged in, save fails → `/share?error=server`
   - logged out → `/login` (the share is **not** preserved; re-share after
     sign-in — see the spec's "Logged-out path" for the rationale)
4. `/share` shows the captured item (parsed chips + text) and auto-dismisses
   in ~3s (closing the window back to the source app on Android, else landing
   on `/app`). Error states render their own copy + a recovery link and do not
   auto-dismiss.

**Wiring:**

- `webapp/public/manifest.json` — the `share_target` block (action `/share`,
  method POST, enctype `application/x-www-form-urlencoded`).
- `webapp/src/share/` — `shareCapture.ts` (route handler),
  `composeShareText.ts` (field composition), `shareRouteMiddleware.ts`
  (urlencoded parsing), `SharePage.tsx` (confirmation page).
- `webapp/src/inbox/operations.ts` — `getInboxItem` query (single-item fetch
  for the confirmation page, ownership-gated).

**iOS gap.** `share_target` is Android/Chrome only. iOS Safari ignores the
manifest block — the feature simply doesn't appear in the iOS share sheet.
iOS requires a native Share Extension (a post-PMF native-shell concern; see
`docs/ROADMAP.md` Icebox). iOS users continue to use `⌘K` / paste capture.

**Spec + plan.** `docs/superpowers/specs/2026-07-25-pwa-share-target-design.md`
+ `docs/superpowers/plans/2026-07-25-pwa-share-target.md`.
