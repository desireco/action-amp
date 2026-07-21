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
