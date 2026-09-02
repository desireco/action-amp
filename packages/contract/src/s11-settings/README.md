# S11 — Settings / account (P0 parity notes)

> Pre-study header for the platform-switch port. Sources read:
> `webapp/src/app/SettingsPage.tsx`, `SettingsLayout.tsx`,
> `PreferencesPage.tsx`, `PatSettingsPage.tsx`, `Field.tsx`, `operations.ts`
> (app), `theme.ts`, `useKeyboardShortcuts.ts`, `AppShell.tsx` (settings
> entry + logout), `webapp/src/lenses/LensesPage.tsx` + `operations.ts` +
> `operationsCore.ts`, `webapp/src/notifications/operations.ts`,
> `webapp/src/auth/patRoutes.ts` (`patIssue`/`patRevoke`/`patList`),
> `webapp/src/auth/pat.ts`, `webapp/src/billing/config.ts` (`PRO_LIMITS`),
> `webapp/schema.prisma` (`User` preference fields, `ApiKey`, `Lens`), and the
> settings route block of `webapp/main.wasp.ts`. NO e2e spec exists for this
> surface — this file's §6 checklist is derived from the implementation and is
> the port's only verification basis (be extra careful).
>
> Out of scope here: BillingPage (`/do/settings/billing`) is S16; the admin
> dashboard redirect at `/do/settings/admin` is S17.

## 1. Routes / screens

| Route (`main.wasp.ts`) | Page | Purpose |
|---|---|---|
| `SettingsRoute` → `/do/settings` | `app/SettingsPage.tsx` | **Account** tab: Profile (edit names), Sign-in (read-only email), Session (log out), About (version). |
| `PreferencesRoute` → `/do/settings/preferences` | `app/PreferencesPage.tsx` | Appearance (dark mode), Focus (25/45 min), Today (cap stepper, daily reminder + time, push), Reviews (today/week/month toggles), Feedback stubs. |
| `LensesRoute` → `/do/settings/lenses` | `lenses/LensesPage.tsx` | Lens management (Pro-gated): list with counts, inline edit, create at cap, two-mode delete. |
| `PatSettingsRoute` → `/do/settings/pat` | `app/PatSettingsPage.tsx` | Access tokens (PATs) for the CLI: issue (reveal once), list with last-used, revoke. Pro-gated. |
| `BillingRoute` → `/do/settings/billing` | `app/BillingPage.tsx` | S16 — listed only because the tab nav includes it. |
| `LegacyAdminRoute` → `/do/settings/admin` | `app/AdminRedirectPage.tsx` | Legacy redirect to the admin workspace (S17). |

**Shell (`SettingsLayout.tsx`)** — every tab renders inside it: back link
"Next" → `/do`; `h1` "Settings"; sub-nav tabs in order
`Account (exact match /do/settings) · Billing · Preferences · Lenses · Access
tokens` (`aria-label="Settings"`, active tab `aria-current="page"`); content
column capped at 760px unless `fullWidth` (admin only). Reached from the
AppShell sidebar footer (avatar + `fullName`, `title="Settings"`) and the
mobile-only avatar button (`aria-label="Settings"`); the mobile bottom dock
hides while in settings (`AppShell` `is-in-settings`).

**`Field` primitive** (`app/Field.tsx`) — the label/value row used everywhere:
variants value (read-only), toggle (label + description left, `Toggle`
right), custom (children). Port parity for layout + a11y.

## 2. Operations (→ oRPC endpoints / REST routes)

### Account tab (`app/operations.ts`)

| Op | Kind / registration | Input | Output |
|---|---|---|---|
| `updateProfile` | action, `auth: true` | `{ fullName: string, preferredName: string }` | `{ fullName, firstName, preferredName }` — writes `User.{fullName, firstName, preferredName}`; `firstName = fullName.split(/\s+/)[0]` |
| `useAuth()` / `logout()` | Wasp built-ins | — | me query + session logout |

Validation (`cleanName`): trimmed, required — errors `"Name is required."` /
`"Call me is required."`; ≤ 120 chars — `"Name must be 120 characters or
fewer."` / `"Call me must be 120 characters or fewer."`. Auth email lives in
Wasp `AuthIdentity` — this op only edits app-owned User fields (no email
change exists).

### Preferences tab

| Op | Kind | Input | Output |
|---|---|---|---|
| `getNotificationPreferences` (`notifications/operations.ts`) | query, `auth: true`, entities `[User]` | `void` | `{ dailyReminderEnabled: boolean, dailyReminderTime: string ("HH:mm"), dailyReminderTimeZone: string, vapidPublicKey: string \| null }` (from `VAPID_PUBLIC_KEY` env) |
| `getAppData` (`app/operations.ts`) | query, `auth: true` | `{ lensId?: string \| null }` | `{ lenses[], counts{inbox,today,upcoming,someday,projects,goals}, todayCap, focusSessionMinutes, reviewPreferences{today,week,month}, timeZone }` — settings reads `todayCap`, `focusSessionMinutes`, `reviewPreferences` |
| `saveTodayCap` | action, `auth: true` | `{ todayCap: number }` | `{ ok: true }` |
| `saveFocusSessionMinutes` | action, `auth: true` | `{ minutes: 25 \| 45 }` | `{ ok: true }` |
| `saveReviewPreferences` | action, `auth: true` | `{ today: boolean, week: boolean, month: boolean }` | `{ ok: true }` |
| `saveDailyReminder` | action, `auth: true` | `{ enabled: boolean, time: string, timeZone: string }` | `{ ok: true }` |
| `savePushSubscription` | action, `auth: true`, entities `[User, PushSubscription]` | `{ endpoint, p256dh, auth }` | `{ ok: true }` (upsert on `endpoint`) |

Shared constants (exported from `app/operations.ts`, re-used client-side):
`TODAY_CAP_DEFAULT = 5`, `TODAY_CAP_MIN = 3`, `TODAY_CAP_MAX = 12`;
`FOCUS_SESSION_OPTIONS = [25, 45]`, `FOCUS_SESSION_DEFAULT = 25`
(`normalizeFocusSessionMinutes`: `45` or default `25`).

`getAppData` side effects that ride along on every preferences load (parity
trap — the port's equivalent bootstrap query must keep them): lazy daily
Today→Upcoming rollover (incomplete `TODAY` tasks → `UPCOMING` once per
calendar day in `User.timeZone`, stamps `lastTodayRolloverAt`) and throttled
`lastActiveAt` stamp (15-min window, best-effort, swallowed errors).

### Lenses tab (`lenses/operations.ts` over `lenses/operationsCore.ts`)

| Op | Kind / registration | Input | Output |
|---|---|---|---|
| `getLenses` | query, `auth: true`, entities `[Lens, Goal, Project, Task]` | `{}` | `LensSummary[]` — `{ id, name, isDefault, isIncluded, color: string\|null, purpose: string\|null, hasAnyContent: boolean, blockingProjects: {id,name}[], counts: {goals, projects, tasks} }`; sorted `isIncluded` first, then `isDefault`, then `createdAt` asc; counts are **non-done** rows only |
| `createLens` | action, `auth: true`, entities `[Lens]` | `{ name: string, color?: string\|null, purpose?: string }` | the created lens (summary fields) |
| `updateLens` | action, `auth: true`, entities `[Lens]` | `{ id, name?, purpose?, color? }` | updated lens summary |
| `deleteLens` | action, `auth: true`, entities `[Lens, Goal, Project, Task]` | `{ id, mode: "delete" \| "reassign", targetLensId?: string }` | `{ id }` |

Entitlements: `assertLensConfigAllowed` (whole surface Pro-only) +
`assertUnderCap` at `PRO_LIMITS.lenses = 8` (soft cap; violation feature
string `a 9th lens`, reason `more life contexts unlock with Pro`). The lens
reassignment runs in a real `$transaction` (Goal/Task/Project `updateMany` →
`lens.delete`) via the injectable `lensDb` seam.

### Access tokens tab — REST, not Wasp ops (`auth/patRoutes.ts`)

Called with plain `fetch` (`credentials: "include"`, JSON body, API origin
from `REACT_APP_API_URL`, trailing slash stripped):

| Route | Method | Body/Query | Response |
|---|---|---|---|
| `/api/pat/list` | GET | — | `200 { keys: [{ id, label, createdAt, lastUsedAt: string\|null }] }` ordered `createdAt desc` |
| `/api/pat/issue` | POST | `{ label }` | `201 { token, id, label, createdAt, notice: "This token won't be shown again. Copy it now." }` |
| `/api/pat/revoke` | POST | `{ id }` | `200 { revoked: true, id }` |

Errors (exact bodies): 401 `{ error: "Not authenticated." }`; issue without
label → 400 `{ error: "A label is required." }` (label trimmed, sliced to 80);
FREE plan → 402 `{ error: "<feature> is a Pro feature.", feature, reason }`
(`cliAccessViolation`); revoke unknown/foreign id → 404 `{ error: "No such
token for this account." }`. Token format: `aa_<base64url(32 bytes)>`, stored
SHA-256 hex in `ApiKey.hashedToken`; `lastUsedAt` stamped by CLI auth (S18).
Browser session auth comes from the `wasp_session` cookie (S10's
session-cookie lift) — these routes are the reason the cookie mirror exists.

## 3. Behaviors

### Account tab (`SettingsPage.tsx`)

- **Profile**: fields "Full name" (`autoComplete="name"`, description "Used
  for your account and avatar initials.") and "Display name"
  (`autoComplete="given-name"`, "Short name ActionAmp can use in calmer
  copy."), prefilled `preferredName || firstName`. Submit button "Save
  changes" ("Saving" while in flight) disabled unless changed; on success
  `refetch()` of `useAuth` + "Saved." note; error string surfaced verbatim.
- **Sign-in**: read-only Field "Email address" — value
  `user.identities?.email?.id`, description "Primary sign-in email." /
  "No email login attached.", fallback value "Not connected". No change flow.
- **Session**: Field "Signed in as" (email or `fullName`) with "Log out"
  button → `ConfirmDialog` `title "Log out?"`, `message "You'll be signed out
  and return to the home page."`, confirm "Log out" / cancel "Stay", danger →
  `logout()` then `navigate("/")`.
- **About**: "Version" = `__APP_VERSION__`; "Built By" = Dakic link
  (`https://dakic.com`).

### Preferences tab (`PreferencesPage.tsx`)

- **Dark mode** (live): toggle maps `theme === "dark"`; `applyTheme` sets
  `document.documentElement.dataset.theme` + `localStorage["aa-theme"]`;
  default from `prefers-color-scheme` (`theme.ts`). Client-only — no server op.
- **Focus session**: radio group (`role="radiogroup"` / `role="radio"` /
  `aria-checked`) of "25 min"/"45 min"; commit-on-click via
  `saveFocusSessionMinutes`, then invalidate `getAppData`.
- **Today cap**: stepper (− / number input / +) clamped 3–12, integer;
  description "Today is global across lenses. Cap the day's commitment
  between 3 and 12. Default 5."; a "Save" button appears only when dirty;
  "saving…" `Chip` while in flight; commit → `saveTodayCap` + invalidate
  `getAppData` and `getTodayTasks`.
- **Daily Today reminder**: toggle "One quiet nudge at your chosen local
  time. It opens Today, Next, or Capture." Enabling runs the full Web Push
  flow client-side: `supportsPushNotifications()` check →
  `vapidPublicKey` presence → `Notification.requestPermission()` →
  `serviceWorker.ready` → `pushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey })` → `savePushSubscription({ endpoint, p256dh, auth })`
  → `saveDailyReminder({ enabled: true, time, timeZone:
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" })`. When enabled,
  a "Reminder time" `<input type="time">` commits on blur. Disabling skips the
  push steps and just saves.
- **Reviews**: three toggles (Today/Week/Month) with optimistic update +
  rollback on error; description "Choose which reflection rhythms appear in
  Review. Turning one off hides it; it does not remove completed work or past
  reviews."
- **Feedback stubs**: "Completion sounds" and "Momentum" render `Chip
  "soon"` — honesty-over-fake-toggles; do NOT port as working controls.

### Lenses tab (`LensesPage.tsx`)

- FREE users: entire tab is a `ProGate` (feature "Custom lenses") — no list,
  no edits.
- List rows: color dot (`data-lens-color`), name, purpose, meta
  "N goals · N projects · N tasks" (spans), "Edit" button. Palette (8, exact
  keys): `indigo, emerald, slate, cyan, coral, honey, lime, magenta` —
  free-form hex is a non-goal.
- "+ New lens" (disabled at cap 8, title "Soft cap of 8 lenses reached";
  cap note "You've reached the soft cap of 8 lenses. Delete one to add
  another."). Create form defaults color `coral`, placeholder
  "e.g. Studio, Board, Side project"; name required for submit.
- Edit form: Name, "Purpose (Optional)", color swatches; "Changes save only
  when you select Save changes." cue; "Delete lens" (danger) hidden for
  seeded (`isDefault`) lenses; Cancel + Save ("Saving…").
- Delete dialog `Delete the "<name>" lens`: with content → radio "Move to
  another lens" (select of other lenses; if none: "Create another lens first,
  or empty this lens before deleting it."); empty lens → "This lens is empty.
  Deleting it removes only the lens itself." Confirm label `Delete <name>`
  ("Deleting…"), danger; blocking error "Choose a lens to move content into."
- Server error surfacing: prefers `data.reason` from the response body, then
  `message`, then a fallback ("Couldn't save. Try again." etc.).
- After any lens mutation: invalidate BOTH `getLenses` (page) and `getAppData`
  (sidebar switch + counts).

### Access tokens tab (`PatSettingsPage.tsx`)

- FREE: `ProGate` (feature "CLI and API access", reason "Use ActionAmp from
  the terminal or with an agent with Pro.").
- Issue form: text input `placeholder "Label this token (e.g. laptop, ci)"`,
  `maxLength 80`, `autoComplete="off"`; button "Issue token" ("Issuing"),
  disabled without a non-empty label.
- Issued-once reveal: warning "Copy this token now. It will not be shown
  again."; read-only input (`aria-label "New token <label>"`, select-on-focus)
  + "Copy" button ("Copied" on clipboard success — falls back to manual copy
  in insecure contexts); "Done" dismisses.
- List: `Field` per key with `formatLastUsed` — "Never used" / "Used just
  now" / "Used N min ago" / "Used N hr ago" / "Used N day(s) ago" / absolute
  date (`toLocaleDateString` year/month:"short"/day) beyond 30 days; ghost
  "Revoke" button (`aria-label "Revoke token <label>"`).
- Revoke confirm: `title "Revoke this token?"`, `message "Anything using this
  token will stop working immediately. You can issue a new one any time."`,
  confirm "Revoke" / cancel "Keep", danger.
- Loading/error states: "Loading tokens…", "No tokens yet.", error strings
  from the route bodies.

## 4. Keyboard + UX flows

- **No settings-specific shortcuts.** The global chord set (⌘K capture, ⌘\
  palette, `/` search, ⌘L lens switcher, Space → Next, Shift+I/N/T/G/P/R
  navigation, `?` cheatsheet, Esc close-overlay) is wired app-wide but never
  targets settings; settings is mouse/tap navigation only. Port parity: do
  not invent a settings chord.
- Tab navigation order = the five tabs; "Account" is exact-match active, the
  rest prefix-match (`startsWith`).
- Confirm dialogs gate every destructive action (logout, revoke, delete lens)
  — `ConfirmDialog` with `danger` styling; Enter submits forms; toggles are
  real labeled controls.
- Live regions: status chips ("saving…") and inline `aa-settings-error`
  paragraphs; errors never toast.

## 5. Edge cases

- **Lens name uniqueness** (`@@unique([userId, name])`): Prisma P2002 on
  create/rename → 409 `You already have a lens named "<name>".`
- **Seeded lenses** (`isDefault`): renameable + recolorable but NOT deletable
  → 409 `The "<name>" lens can't be deleted — it's one of your defaults.`
  (the UI hides the delete button; the server is the boundary).
- **Hard delete with content** → 409 `This lens still has content. Move it to
  another lens first, then delete.` (no silent cascade; FKs do cascade any
  stragglers of an empty lens).
- **Reassign collision**: Goal has `@@unique([userId, name])` globally — a
  same-named goal in the target lens → 409 `A goal in this lens shares a name
  with one in the target lens. Rename it first, then retry.`
- **Reassign target invalid**: same id → 400 `Choose a different lens to move
  content into.`; not owned/missing → 404 `Target lens not found.`; lens or
  target not owned → 404 `Lens not found.`
- **Lens field validation**: empty name → `"Lens name is required."` (create)
  / `"Lens name cannot be empty."` (update); unknown color → 400
  `"Unknown lens color."` (closed 8-key palette); purpose trimmed, empty →
  `null`; color nullable.
- **Today cap**: non-integer or out of 3–12 → `"Today cap must be a whole
  number between 3 and 12."` (client clamps + rounds first; stepper buttons
  disable at bounds).
- **Focus minutes**: outside {25, 45} → `"Focus session must be 25 or 45
  minutes."`
- **Review prefs**: non-boolean → `"Review preferences must be true or
  false."`
- **Daily reminder**: time not `HH:mm` 24h (`/^([01]\d|2[0-3]):[0-5]\d$/`) →
  `"Choose a valid reminder time."`; missing/oversized timeZone (> 100) →
  `"Could not determine device time zone."`. Saving a reminder also
  back-fills `User.timeZone` when null (first device zone wins). Push errors
  (exact strings): "This browser does not support push notifications." /
  "Notifications are not configured on this ActionAmp server yet." /
  "Notification permission was not granted." / "Could not create
  notification subscription."
- **Push subscription** upsert keyed on `endpoint` (re-subscribe rebinds to
  the same user); missing fields → `"Invalid push subscription."`
- **updateProfile**: empty/whitespace names and > 120 chars rejected (exact
  messages in §2); `firstName` recomputed from the new `fullName`.
- **PAT**: label required (400), capped at 80 chars; revoke is tenancy-scoped
  (foreign id = 404, not 403 — no existence leak); plaintext shown exactly
  once (hash-only storage); tokens non-expiring, revocation is the safety
  valve.
- **Email change / account deletion / data export: DO NOT EXIST** in
  user-facing settings. There is no danger zone beyond logout + revoke +
  lens delete. (Admin-side user deletion with Stripe-protection is S17;
  `User` rows do cascade-delete their ApiKeys/LoginEvents/etc.) If the port
  adds any of these, that is new scope, not parity.
- **Theme**: `localStorage["aa-theme"]` only ("light"|"dark"); corrupt values
  fall back to system preference; SSR-safe (`globalThis.window` guard).
- **FREE vs Pro rendering**: Lenses + Access tokens tabs render `ProGate`
  instead of content (server also 402s the ops) — both layers must hold in
  the port.

## 6. Impl-derived verification checklist (no e2e exists — this IS the spec)

Account:
1. `/do/settings` renders tabs Account/Billing/Preferences/Lenses/Access
   tokens + back link "Next"; sidebar avatar entry navigates here.
2. Edit Full name + Display name → "Save changes" enables only when changed;
   save persists and re-renders the shell's user name after `useAuth`
   refetch; "Saved." appears; empty or >120-char values are rejected with the
   exact server strings.
3. Email field is read-only and matches `identities.email.id`.
4. Log out → confirm dialog → session cleared (localStorage token +
   `wasp_session` cookie) → navigated to `/` (locally ending on `/login`);
   navigating back to `/do` bounces to login (covered by S10's
   auth-regression spec).
5. About shows the build version.

Preferences:
6. Dark mode toggle flips `data-theme` + `localStorage["aa-theme"]`
   immediately (no server call); first visit follows system preference.
7. Focus session radio commits 25/45 immediately; badge/`getAppData` reflect
   it after invalidation.
8. Today cap stepper: clamps to 3–12, rounds; dirty-only Save button;
   "saving…" chip; `getTodayTasks` invalidated so the Today page cap matches.
9. Daily reminder on: full push-subscription path (permission denied → error
   string, no server write); time input commits on blur; off: saves
   `enabled: false` without touching push.
10. Review toggles: optimistic; a forced server failure rolls the toggle back
    and shows the error; no completion data is ever deleted.

Lenses:
11. FREE account: tabs render ProGate; ops 402.
12. Pro: list order (seeded-first, then createdAt), counts are non-done only;
    edit/rename/recolor persists; rename to an existing name → 409 string.
13. Create at cap 8: button disabled + title; server cap message on a direct
    call.
14. Delete empty lens (non-default) succeeds; delete with content requires
    reassign; reassign moves goals/projects/tasks transactionally and deletes
    the lens; goal-name collision surfaces the 409 guidance string.
15. Default lenses show no Delete control and the server refuses them.

Access tokens:
16. FREE: ProGate; `/api/pat/issue` 402s.
17. Pro: issue with label → 201 + one-time reveal + copy; list ordered desc
    with correct relative "last used" rendering at each boundary (0 min, <60
    min, <24 h, <30 d, ≥30 d); revoke → confirm → row disappears; revoke a
    foreign/unknown id → 404 string.
18. Token round-trips with the CLI (S18 dependency): `aa_` prefix,
    `lastUsedAt` stamps on first CLI call.

Cross-cutting:
19. All ops 401 with `"Not authenticated."` when the session is absent.
20. Settings pages are unreachable logged-out (App gate redirects; covered by
    S10's auth-regression spec).
