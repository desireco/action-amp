# S12 — Push + PWA / share target (parity notes)

> P0 pre-study for the platform switch. Source of truth read: `webapp/src/share/`
> (`SharePage.tsx`, `shareCapture.ts`, `shareRouteMiddleware.ts`, `composeShareText.ts`,
> `pendingShare.ts`), `webapp/src/notifications/` (`operations.ts`, `client.ts`,
> `dailyReminderJob.ts`), `webapp/public/{manifest.json,service-worker.js,version.json}`,
> `webapp/src/app/PreferencesPage.tsx` (reminder UI), `webapp/src/app/AppShell.tsx`
> (SW registration), `webapp/main.wasp.ts`, `webapp/schema.prisma` (PushSubscription),
> `docs/features/pwa-notifications.md` (verified 2026-07-29),
> `docs/superpowers/specs/2026-07-25-pwa-share-target-design.md` (note: spec describes
> the older text-only design; the shipped image flow is the manifest doc + code).
> These notes are the checklist the port is verified against. The reminder **job**
> infrastructure (PgBoss schedule, idempotence) is owned by S14; the push payload
> contract lives here.

## 1. Routes / screens / assets

| Surface | Where | Notes |
|---|---|---|
| `/share` (ShareRoute, `authRequired: false`) | `share/SharePage.tsx` | Review-and-confirm page. Renders during session resolution and after a logged-out → `/login` bounce; handles its own auth awareness via `useQuery`. |
| `POST /share` (same-origin, **not** a server route) | intercepted by the service worker | The manifest `share_target` action. SW parses the multipart form, stashes it in IndexedDB, 303s to `/share?pending=<id>`. |
| `POST /api/share` (`shareCapture`, `auth: false` + `shareRouteMiddleware`) | `share/shareCapture.ts` | Text-only urlencoded fallback / SW-bridge path (`?response=json` → `200 {redirect}`). Same-origin server route on the API host. |
| `/manifest.json`, `/service-worker.js`, `/version.json`, icons | `webapp/public/` | Static assets served at the app origin root. |
| Daily Today reminder UI | `/do/settings/preferences` (`PreferencesPage.tsx`) | Toggle + local time picker. |
| PWA head metas | `main.wasp.ts` `head` | `<link rel=manifest>`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `theme-color #008AC0`, apple-touch-icon. `display: standalone` in the manifest is what exempts the installed PWA from WebKit ITP's 7-day localStorage cap (why install is promoted). |

## 2. Operations / endpoints

Wasp ops (→ oRPC endpoints in the port):

| Op | Kind | Contract |
|---|---|---|
| `getNotificationPreferences` | query (auth) | `{ dailyReminderEnabled, dailyReminderTime, dailyReminderTimeZone, vapidPublicKey }` — the VAPID public key is surfaced to the client from `process.env`. |
| `savePushSubscription` | action (auth) | `{ endpoint, p256dh, auth }` → **upsert** `PushSubscription` keyed by unique `endpoint` (create with userId / update userId+keys). Invalid args → `"Invalid push subscription."`. |
| `saveDailyReminder` | action (auth) | `{ enabled, time, timeZone }`. `time` must match `/^([01]\d|2[0-3]):[0-5]\d$/`; `timeZone` trimmed, required, ≤100 chars. Sets `dailyReminderTime(Zone)` + `dailyReminderEnabled`; sets `User.timeZone` **only if currently null** (never silently replaces an existing account time zone). |
| `sendDailyTodayReminder` | job (PgBoss) | Full job contract in S14 §3. |
| (shared with other slices) | | SharePage confirm uses the normal `createInboxItem` action, `createListItem`, `createResource`, and `getProjectsForResolver` (destination dropdown source — all-lens projects, most-recently-active first). |

## 3. Behaviors + data flows

### 3.1 Manifest (`public/manifest.json`)
`name/short_name "ActionAmp"`, description "One task at a time.", `start_url /do`,
`scope /`, `display standalone`, `background_color #0e1419`, `theme_color #008AC0`,
`orientation portrait-primary`. App-icon **shortcuts**: Capture `/do?capture=1`,
Next task `/do`, Today `/do/today`. Icons: `/icon-192.png` (any), `/icon-512.png`
(any), `/icon-512-maskable.png` (maskable). **`share_target`**: `action /share`,
`method POST`, `enctype multipart/form-data`, params `title/text/url` + `files:
[{name: "images", accept: image/* + jpeg/jpg/png/webp/gif/heic/heif extensions}]`.

### 3.2 Service worker (`public/service-worker.js`)
- **Caches nothing.** Authenticated data is never cached (shared-device privacy +
  stale-data avoidance). Wasp's client bundle owns the network experience.
- `push` → `showNotification(payload.title || "ActionAmp", { body: payload.body ||
  "Choose what matters today.", icon+badge /icon-192.png, tag "daily-today",
  renotify false, data.url = payload.url || "/do/today", actions: capture / next /
  today })`. Payload is JSON from the server job: `{ title, body, url }`.
- `notificationclick` → close; action map `{ capture: "/do?capture=1", next: "/do",
  today: "/do/today" }`, else `notification.data.url`, else `/do/today`; focus an
  existing same-origin window (navigate it) or `openWindow`.
- **Update flow:** no auto-activate. New worker installs and *waits*; the app posts
  `{type: "SKIP_WAITING"}` from the update banner; `controllerchange` → reload.
  (Auto-activating raced the banner and caused reload loops in installed Android PWAs.)
- **Share-target fetch handler:** intercepts same-origin `POST /share` →
  `request.formData()` → string fields `title/text/url` + `images` Files filtered to
  `image/*` → IndexedDB `actionamp-share` / store `pending` (keyPath `id`, uuid)
  record `{ id, fields, files: [{blob, filename ("Shared image" fallback),
  mimeType, size}], createdAt }` → `Response.redirect(/share?pending=<id>, 303)`.
  Any failure → redirect `/share?error=server`.

### 3.3 Share review page (`SharePage.tsx`)
1. `?pending=<id>` → `getPendingShare` from IndexedDB (`pendingShare.ts`); title
   pre-filled from `composeShareCapture(fields).title`, description from `.content`.
   Missing/unreadable → error copy "Couldn't find that capture." No fields AND no
   files → "Nothing to capture."
2. Preview: source link (hostname+path label, original kept visible on non-URL
   parse failure) + image previews as **data: URLs, not object URLs** (deploy host
   CSP allows `data:` images, not `blob:`). Unreadable blob → no preview, not an error.
3. Optional edits: title input, description textarea, destination `<select>`:
   Inbox (default, "decide later") / Projects / Simple lists (grouped separately,
   from `getProjectsForResolver`).
4. Confirm → per destination:
   - **Inbox** → `createInboxItem({ text (or first filename / "Shared image"),
     title?, content?, sourceUrl?, projectId? (only when destination was a standard
     project — legacy combined path), attachments, timeZone: Intl tz })` → navigate
     `/do/inbox?item=<id>` (`?item=` is InboxPage's highlight contract).
   - **Project (standard)** → `createResource` — reference material, **skips triage**.
     URL must be `http(s)`, else it folds into `notes` (Android `content://`/`intent://`
     shares). Title falls back text → first filename → "Shared item".
   - **Simple list** → `createListItem` — also skips triage.
   - Both direct paths carry image attachments (base64) and are **entitlement-gated
     on the destination's Lens** (assertLensAllowed inside the cores).
   - Uses the normal authenticated actions (never the cross-origin share API) so a
     confirmed item can't be written under a different stale cookie session.
5. On success: `clearPendingShare(id)` + targeted query invalidations
   (getInboxItems/getAppData or getProject/getProjects/getSimpleList); direct saves
   navigate to `/do/projects/:permalink`. **Not now** → clear + `/do`.
6. **Nothing reaches the server until the user confirms** — the SW stash is the
   only pre-confirm persistence.

### 3.4 Field composition (`composeShareText.ts`, pure)
Each field trimmed, capped at **2000 chars + "…"**. Composition rules:
`title+url → "Title — url"`; `title only`; `url only`; `text+url → "text — url"`;
`title+text+url → "Title: text — url"`; empty all → `""` (caller → error).
**Android title-dedup:** `text === title` → drop text; `text` startsWith `"Title "`
→ strip prefix; if the remainder is a bare `http(s)` URL and no url field existed,
promote it to `url`. `composeShareCapture` also returns structured
`{title, content (=text), url, text (composed)}` for the review UI.

### 3.5 Direct route `POST /api/share` (`shareCapture.ts`)
Auth via **session cookie only**: `auth: false` + `shareRouteMiddleware`
(`express.urlencoded({extended:true})` + `attachSessionFromCookie` +
`sessionAuthMiddleware`) — a top-level form POST carries `wasp_session`
(SameSite=lax) and no Bearer header; Wasp's `auth:true` handler would run before
route middleware and never see the cookie lift. Outcomes: logged out → `303 /login`;
all fields empty (after compose) → `303 /share?error=empty`; core throw → log +
`303 /share?error=server`; success → saves via **`createInboxItemCore`** (the same
pure core as the app action and `POST /api/cli/capture`) → `303 /share?id=<itemId>`
(id encodeURIComponent'd). `?response=json` swaps 303 for `200 {redirect}` (the
service-worker bridge mode). Repeated-key form values may arrive as arrays → dropped.

### 3.6 Push subscription + reminder UI (`PreferencesPage.tsx`)
Enable flow: `supportsPushNotifications()` (serviceWorker + PushManager +
Notification present) → require `vapidPublicKey` from prefs (absent → "Notifications
are not configured on this ActionAmp server yet.") → `Notification.requestPermission()`
(denied → error) → `pushManager.subscribe({ userVisibleOnly: true,
applicationServerKey: urlBase64ToUint8Array(publicKey) })` → `savePushSubscription`
→ `saveDailyReminder({enabled, time, timeZone: Intl tz || "UTC"})`. Disabling only
calls `saveDailyReminder` (subscription row stays; harmless).

### 3.7 Client SW utilities (`notifications/client.ts`)
- `registerServiceWorker()` — AppShell calls on mount; registration failure non-fatal.
- `useServiceWorkerUpdate()` — surfaces the update banner when a new worker waits
  (updatefound → installed while a controller exists, or a pre-waiting worker on
  load); `applyUpdate` posts SKIP_WAITING; reload on controllerchange.
- `useDeployedVersionUpdate()` — polls `/version.json` (first at 60s, then every
  5 min, paused while hidden, immediate re-check on visibility) and flags when the
  deployed SHA ≠ build-time `__APP_VERSION__`; plain reload applies it. Non-fatal
  everywhere; skipped when `__APP_VERSION__ === "dev"`.

## 4. Data model

`PushSubscription { id uuid, endpoint unique, p256dh, auth, createdAt, updatedAt,
userId → User (cascade), @@index([userId]) }`. Reminder state lives on `User`:
`dailyReminderEnabled Boolean @default(false)`, `dailyReminderTime @default("09:00")`,
`dailyReminderTimeZone @default("UTC")`, `lastDailyReminderAt DateTime?`.

## 5. Env vars / keys (names only)

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto: or https:
  contact URI). Generate once: `npx web-push generate-vapid-keys`. Any one missing →
  the job returns `{sent: 0}` and the prefs query returns `vapidPublicKey: null`
  (UI keeps reminders off with the "not configured" explanation).
- Build-time: `__APP_VERSION__` (git SHA) + a `/version.json` `{version}` emitted
  by the build (vite.config.ts) — the deploy-banner poll depends on both.

## 6. Edge cases

- **iOS**: `share_target` is Chromium-only; iOS Safari ignores it (native share
  extension is post-PMF icebox). iOS fallback = ⌘K capture with paste/drop images.
  iOS notification taps still route correctly where Web Push is supported.
- Invalid IANA tz in `User.dailyReminderTimeZone` → the job skips that user
  (try/catch `continue`), never crashes the run.
- Dead subscriptions: `sendNotification` rejected with 404/410 → delete the
  `PushSubscription` row; other rejections just don't count as sent.
- `lastDailyReminderAt` is stamped after an **attempted** delivery whenever the user
  has ≥1 subscription — a failed provider response is not retried later that day
  (calm over retry; see S14).
- IndexedDB pending record is same-origin and short-lived; a pending share that
  survives to a logged-out session shows the error copy (no auth leakage).
- CSP: previews must use `data:` URLs (`blob:` renders broken in production).
- Entitlement violations on project/list destinations surface as errors on the
  review page (submitError), pending record kept.

## 7. Tests pinning behavior

- `share/composeShareText.test.ts` — every composition rule + Android dedup +
  2000-char truncation + whitespace trim.
- `share/shareCapture.test.ts` — /login redirect, error=empty, save + `?id=`
  redirect (id encoded), error=server on core throw, JSON bridge mode.
- `share/manifest.test.ts` — manifest registers Android's generic `image/*` MIME
  intent (+ specific types/extensions).
- `notifications/dailyReminderJob.test.ts` — truncate/buildReminderBody contracts
  (owned by S14).

## 8. Parity bar

**Switch-day (100%):** manifest + SW push/notificationclick + install metas (the
PWA install is the storage-eviction mitigation and a retention pillar); VAPID-gated
prefs query + `savePushSubscription` upsert semantics; the reminder job's
schedule/idempotence (S14); `/api/share` route with cookie-session auth + redirects;
`composeShareText` rules (pure, port as-is); IndexedDB pending flow + `/share`
review page with the three destinations (this is the Android mobile-capture path —
a daily-use surface for phone users). **Long-tail (can lag):** `?response=json` SW
bridge mode (legacy), deploy-version poll (`/version.json`), update-banner waiting
protocol niceties. **Not ported:** nothing — no dead code in this slice except the
JSON bridge mode.
