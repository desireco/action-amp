# S12+S14 wiring — Push + PWA/share + Emails/cron on the new stack

Slice batch: **S12 (Web Push, service worker, manifest, share target) + S14 (the
daily-reminder job + the welcome/feedback email seams)**. S10 (running
concurrently) owns the magic-login email transport + its `email.ts`; S13/S15
composed around the same files. Deliverables landed as fragments + assets plus
this note; nothing outside the batch's concerns was redesigned.

Parity bar: the s12-push-pwa + s14-emails-cron READMEs are the checklists.
The share target (the Android mobile-capture path), the PWA install surface,
and the reminder job's schedule/idempotence are the switch-day core; both are
100% except the long-tail items in §7.

## 1. Composition lines (applied + verified by this batch's e2e gate)

**`packages/contract/src/router.ts`**

```ts
import { notificationsContract } from "./notifications.js"; // S12
export const contractRouter = {
  // …existing surfaces…
  notifications: notificationsContract,
};
```

**`apps/api/src/router.ts`**

```ts
import { notificationsProcedures } from "./push.js"; // S12
export const router = {
  // …existing surfaces…
  notifications: notificationsProcedures,
};
```

**`packages/contract/src/index.ts`** — additive export: `notificationsContract`.

**`packages/domain/package.json`** — additive export map:
`"./notifications": "./src/notifications/index.ts"`.

**`packages/domain/src/db/*` (additive seam extension)** — the
`PushSubscriptionDelegate` (`upsert` by unique endpoint + `delete`) on the
`Entities` seam: arg types in `seam.ts` (imported from the notifications core —
type-only, no cycle), the Drizzle implementation in `client.ts`
(`insert … onConflictDoUpdate({ target: endpoint })`, `mintId()` + `updatedAt`
on the create leg), and both S12 cores pinned in `seam.checks.ts`.

**`apps/api/src/index.ts`** — two additive mounts:

```ts
import { createShareRoute } from "./share.js";
import { startDailyReminderScheduler } from "./push.js";

app.post("/api/share", createShareRoute({ db, entities })); // before the 404 fallback
const reminderScheduler = startDailyReminderScheduler(db);   // after Bun.serve
// shutdown: reminderScheduler.stop() before db.$client.end()
```

**`apps/web/src/routes/+layout.svelte`** — two additive mounts (AppShell
parity): the PWA head metas (`<svelte:head>`: manifest link, apple-touch-icon,
`apple-mobile-web-app-capable`, status-bar-style, `theme-color #008AC0`) and
`registerServiceWorker()` + the `controllerchange → reload` listener (the
update protocol's client half) in the existing mount `$effect`.

If any line above is ever reverted, these are the whole integration.

## 2. Contract surface

- `/rpc/notifications/savePushSubscription` — `{endpoint, p256dh, auth}` →
  `{ok: true}`; upsert keyed by the unique `endpoint` (create carries userId,
  update rewrites userId + keys). Missing/empty args → 400
  `"Invalid push subscription."` (the webapp's exact string, thrown by the
  domain core, mapped to BAD_REQUEST like every other core Error).
- `prefs.saveDailyReminder` + `prefs.getNotificationPreferences` were already
  S11; the S12 boundary was `vapidPublicKey: null` — now wired to
  `process.env.VAPID_PUBLIC_KEY ?? null` (`apps/api/src/procedures/prefs.ts`).

## 3. The reminder scheduler (the PgBoss replacement) — design

`apps/api/src/push.ts`, started from `index.ts` after listen:

- **Cadence:** `setInterval` at 60_000 ms (the webapp's PgBoss `* * * * *`),
  first tick 10 s after boot. Any user-chosen local HH:mm fires within a
  minute of its wall-clock minute. An overlap guard (`running` flag) keeps a
  pass slower than 60 s from stacking.
- **Once per local day:** per user, `localClock(now, tz)` (Temporal, minutes
  precision) must equal `dailyReminderTime`, and `lastDailyReminderAt`
  resolved in the SAME tz must fall on an earlier local date (invalid tz →
  `continue`, never aborts the run). The webapp's post-attempt
  check-then-stamp was not multi-worker-safe (S14 note), so the stamp became
  an **atomic conditional UPDATE claimed BEFORE sending**:
  `UPDATE "User" SET lastDailyReminderAt = now WHERE id = ? AND
  (lastDailyReminderAt IS NULL OR lastDailyReminderAt < <local midnight>)`
  — 0 rows → another worker claimed the day; skip, never double-send.
  Observable contract preserved: failures still consume the day (calm over
  retry), users with zero subscriptions are never claimed (a later subscribe
  still fires that day).
- **Send:** top-3 open TODAY tasks (`priority desc, order asc`) + total count
  → `buildReminderBody` (48-char truncate, `(+N more)` only past the sample,
  `"Nothing planned yet. Choose what matters."` nudge) → payload
  `JSON.stringify({title:"ActionAmp", body, url:"/do/today"})` to every
  subscription via `allSettled`; fulfilled counts; **404/410 prunes** the
  `PushSubscription` row, other rejections just don't count.
- **VAPID gate:** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
  — any missing → `{sent: 0}`, no error, no scheduler log. This is also the
  dev posture: the loop runs whenever the API runs (skipped under
  `NODE_ENV=test`), but without the env it no-ops, so local dev stays quiet.
  The prefs query surfaces `vapidPublicKey: null` in that state and the UI
  keeps the enable flow on the webapp's exact
  "Notifications are not configured on this ActionAmp server yet."
- Generate keys once: `bunx web-push generate-vapid-keys`.

## 4. The share target

- **`apps/web/static/`** (new SvelteKit static dir, served at the origin
  root): `manifest.json` (verbatim port — share_target POST multipart with
  `title/text/url` + `images` `image/*` + extensions, shortcuts, standalone,
  `theme_color #008AC0`), `service-worker.js` (verbatim port — caches
  NOTHING; `push` → `showNotification` tag `daily-today` with the
  capture/next/today actions; `notificationclick` routing; waiting-worker
  update protocol with the `SKIP_WAITING` message handler; the share-target
  fetch handler → IndexedDB `actionamp-share`/`pending` → 303 to
  `/share?pending=<id>`), icons (`icon-192/512/512-maskable`,
  `apple-touch-icon`), `version.json` (`{"version":"dev"}` placeholder — the
  build-time SHA pipeline is the deploy long-tail, §7).
- **`apps/web/src/routes/share/+page.svelte`** — the review-and-confirm page
  (SharePage.tsx port): `?pending=` pre-fill from `composeShareCapture`,
  data:-URL image previews, title/note edits, the destination select
  (Inbox default / Projects / Simple lists via `inbox.projectsForResolver`),
  and the three confirm paths — Inbox → `inbox.create` (through triage),
  Project → `resources.create` (skips triage; non-http(s) URLs fold into
  notes), Simple list → `tasks.createListItem`. Nothing hits the server
  until confirm; success clears the stash and navigates
  (`/do/inbox?item=<id>` highlight contract; project/list → their permalink
  page). `?error=empty|server` + missing pending ids render the webapp's
  exact error copy. **Note:** the S9-contract `create*` ops carry no image
  attachments yet (see §7).
- **`apps/api/src/share.ts`** — `POST /api/share`, the direct urlencoded
  fallback + `?response=json` SW-bridge: compose → `createInboxItemCore` →
  303 `/login | /share?error=empty | /share?error=server | /share?id=<enc>`,
  JSON mode answers `200 {redirect}`. **Session-cookie auth only, no CSRF
  header** — it's a top-level form POST (SameSite=Lax); deliberately unlike
  the /rpc wrapper. The composer is the canonical copy (unit-tested here);
  the web client keeps a keep-in-sync twin in `apps/web/src/lib/share.ts`
  (the capture-parser precedent) alongside the IndexedDB pending helpers.

## 5. Reminder UI + push client

- `apps/web/src/lib/push.ts` — `supportsPushNotifications`,
  `registerServiceWorker`, `urlBase64ToUint8Array`,
  `enablePushSubscription(vapidPublicKey)` (permission → subscribe under the
  waiting worker → `notifications.savePushSubscription`; throws the webapp's
  exact four strings), `applyServiceWorkerUpdate` (SKIP_WAITING poster, for
  the long-tail banner).
- `preferences/+page.svelte` — the `S12 wiring:` call site S11 left is
  complete: the enable flow now subscribes + saves the subscription between
  the vapid check and `saveDailyReminder`; disabling only calls
  `saveDailyReminder` (the subscription row stays, harmless — webapp parity).

## 6. Emails (S14 remainder; S10 owns magic-login + `email.ts`)

`apps/api/src/emailNotifications.ts` (new; imports S10's `EMAIL_FROM`):

- Transport: Resend HTTPS API via fetch (`RESEND_API_KEY`), from
  `ActionAmp <noreply@actionamp.com>`. Same simplification S10 noted — the
  react-email templates are inlined as static HTML with the same layout
  (title/preview/CTA + "One task. Then the next. · Built By Dakic" footer).
- `sendWelcomeEmail` / `buildWelcomeEmail` — subject **"Your first task is
  waiting"**, name fallback preferredName → firstName → "there", text body
  verbatim. **Call site (to wire): S13's `completeOnboarding`** — once per
  account, wrapped in try/catch (best-effort; onboarding must never fail on
  email). App URL: `APP_CLIENT_URL` (falls back to the webapp's
  `WASP_WEB_CLIENT_URL`, then localhost:5174).
- `sendFeedbackNotificationEmail` / `buildFeedbackEmail` — subject
  **"ActionAmp feedback"**, the exact webapp text lines, recipient
  `ACTIONAMP_ADMIN_EMAIL?.trim() || "zeljko@dakic.com"`, gated to
  `NODE_ENV === "production"` (the gate lives in the send fn, returning
  null). **Call site (to wire): S17's `submitFeedback` op** — call AFTER the
  Feedback row is saved, swallow failures.

## 7. Deferred / notes for review

- **Push-delivery e2e** (a real server → browser notification) needs a
  browser-grant + VAPID harness — V1/manual. The job invariants are
  unit-pinned instead: `apps/api/src/push.test.ts` (gate, zone matching,
  claim/prune semantics) and
  `packages/domain/src/notifications/operationsCore.test.ts` (body contract,
  upsert, clock helpers).
- **SvelteKit form nuance (e2e finding):** the OS share handoff is a native
  top-level POST; SvelteKit's client router intercepts in-page form
  submits, so the e2e exercises the SW interception with a `redirect:
  "manual"` fetch (the SW treats both identically — the fetch handler keys
  on method + path, and the 303 handoff is browser behavior). Production
  share activities bypass the page entirely.
- **Image attachments through the confirm fan-out** are the remaining S12
  long-tail: the SW stashes + previews them (parity), but the S9-era
  contract `create*` ops carry no attachment params (their fragments note
  "attachments are S12's surface"); extending those contracts/procedures for
  base64 attachments is a follow-up that touches other slices' files.
- **Deploy-version poll + update banner UI** (`useDeployedVersionUpdate`,
  the banner rendering `applyServiceWorkerUpdate`) — S12 §8 long-tail. The
  SW-side waiting protocol + client reload listener are live; the build-time
  `__APP_VERSION__`/`/version.json` pipeline needs the deploy story first.
- **Claim-before-send deviation:** the webapp stamped `lastDailyReminderAt`
  AFTER an attempted delivery; the port claims BEFORE (atomic, per §3) —
  required by S14's multi-worker note, same observable behavior otherwise.
- **First-claim reload guard (client half):** the layout attaches
  `controllerchange → reload` only when a controller already exists — the
  webapp's `useServiceWorkerUpdate` explicitly ignored the first-ever
  install (null controller = initial claim, not an update); attaching
  unconditionally reloads every fresh session once the SW first claims and
  races e2e asserts. Same guard, now load-bearing.
- **Pre-existing, not this batch:** `apps/api` `session.test.ts` fails under
  `bun test` (`vi.mocked` is not a function in bun's vitest shim) — auth
  file, untouched per slice boundaries.

## 8. Gates at batch time

- contract `bunx tsc` clean; domain `bunx tsc` clean + vitest **363/363**
  (incl. 18 new notification-core tests); api `bunx tsc` clean + `bun test`
  97/98 (the 1 failure is the pre-existing `session.test.ts` shim issue);
  `bunx svelte-check` 0 errors from this batch's files (one error sits in
  S13's in-flight `OnboardingGate.svelte`); oxlint 0/0 on all 24 slice
  paths; playwright full suite green ×2 (`--workers=1`), share spec 8/8.
- Env for a live check: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
  `VAPID_SUBJECT` on the API; without them everything degrades to the
  designed "not configured" posture (job no-op + UI explanation).
