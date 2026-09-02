# S17 — Admin dashboard + admin routes (P0 parity notes)

> Pre-study header for the platform-switch port. Sources read: `webapp/src/admin/`
> (`operations.ts`, `operationsCore.ts`, `userManagementCore.ts`, `AdminLayout.tsx`,
> `AdminPage.tsx`, `AdminActivityPage.tsx`, `AdminUsersPage.tsx`, `AdminFunnelPage.tsx`,
> `AdminFeedbackPage.tsx`, `AdminRedirectPage.tsx`, `StatusSelect.tsx`), the
> admin-gated PAT routes in `webapp/src/auth/patRoutes.ts` (`cliFeedbackList/Show/Status/Delete`,
> `cliAdminStats`, `cliAdminGrowth`, `cliAdminFeedback`, `requireAdmin`),
> `webapp/src/feedback/operationsCore.ts`, `webapp/src/analytics/operationsCore.ts`
> (`getFunnelStatsCore`, `FunnelStats`), `webapp/main.wasp.ts` (routes + ops + api),
> `webapp/e2e/admin-users.spec.ts`, `docs/superpowers/specs/2026-07-22-admin-dashboard-design.md`,
> `admin-cli/README.md`, `admin-cli/src/` (types, api, commands). This file is the
> checklist the port is verified against.

## 1. Routes / endpoints

### 1.1 In-app admin dashboard (session auth, `user.isAdmin` gate)

| Route (main.wasp.ts) | Page | Purpose |
|---|---|---|
| `/do/admin` + `/do/settings/admin` (legacy) | `AdminRedirectPage` | `<Navigate to="/do/admin/overview" replace>`. |
| `/do/admin/overview` | `AdminPage` | Stats tiles (users/active/tasks/payments/funnel/feedback) + recent-feedback table. |
| `/do/admin/activity` | `AdminActivityPage` | Week-bucketed (Mon–Sun UTC) signups/active/captures/triage/tasks, 8-week trend + current month. |
| `/do/admin/users` | `AdminUsersPage` | User directory: search/filter/sort, per-user 7d/30d activity, manual grants, bulk delete. |
| `/do/admin/funnel` | `AdminFunnelPage` | Growth funnel + acquisition sources + retention. |
| `/do/admin/feedback` | `AdminFeedbackPage` | Feedback triage table (status select + delete), cursor-paged. |

`AdminLayout` is the boundary on the web side: loading → render nothing; no user →
redirect `/login`; `!user.isAdmin` → calm "Admin access required." panel (never a crash);
otherwise the rail nav (Overview · Activity · Users · Funnel · Feedback).

### 1.2 Wasp operations (→ oRPC endpoints; every one starts with `requireAdmin(context)` → `HttpError(403, "Admin only.")`)

| Op | Kind | Input | Output |
|---|---|---|---|
| `getAdminStats` | query | `{ range?: "7d"\|"30d"\|"all" } = {}` (invalid → coerced `"30d"`) | `AdminStats` (§2.1) |
| `getAdminActivityStats` | query | none | `ActivityStats` (§2.2) |
| `getAdminUsers` | query | `{ search?, joined?: "7d"\|"30d", active?: "7d"\|"30d"\|"inactive_30d"\|"never", access?: "free"\|"pro"\|"founder"\|"friend"\|"admin", sort?: "signup_desc"\|"signup_asc"\|"last_login_desc"\|"last_active_desc", cursor?: string\|null, limit?: number }` | `{ total, nextCursor, items: AdminUserRow[] }` (§2.3) |
| `grantAdminUserAccess` | action | `{ targetUserId, grant: "PRO"\|"FOUNDER"\|"FRIEND" }` | void |
| `removeAdminUserAccess` | action | `{ targetUserId }` | void |
| `deleteAdminUser` | action | `{ targetUserId }` | void |
| `deleteAdminUsers` | action | `{ targetUserIds: string[] }` | `{ deletedIds, skipped: [{ targetUserId, reason }] }` |
| `getAdminFunnel` (analytics/operations.ts) | query | `{ range? }` | `FunnelStats` (§2.4) |
| `getRecentFeedback` | query | `{ afterId?: string\|null, limit = 10, statuses?: FeedbackStatus[] }` | `{ items: FeedbackRow[], hasNext: boolean }` |
| `updateFeedbackStatus` | action | `{ id, status: FeedbackStatus }` | `FeedbackRow` |
| `deleteFeedback` | action | `{ id }` | `FeedbackRow` (soft delete) |

`AdminFeedbackPage` calls `getRecentFeedback` with `{ afterId: null, limit: 25, statuses }`.

### 1.3 Admin PAT routes (`/api/cli/*`, Bearer PAT via `patRouteMiddleware`, then `requireAdmin(req.patUser, res)` — 401 if no user, **403 `{ error: "Admin only." }` if `!isAdmin`, checked FIRST, before any DB work**)

| Route | Method | Query/Body | Success (200) |
|---|---|---|---|
| `/api/cli/feedback/list` | GET | `?status=` (validated against `OPEN, IN_PROGRESS, RESOLVED, CLOSED`, else 400 `Invalid status. Must be one of: …`), `?limit=` positive int or `"all"` (absent/`all` → unbounded; non-positive → 400 `limit must be a positive number or 'all'.`) | `{ feedback: FeedbackRow[] }` newest first, `deletedAt: null` only |
| `/api/cli/feedback/show` | GET | `?id=` (required — 400 `id is required.`) | `{ feedback: FeedbackRow }`; none → 404 `{ error: "Feedback not found." }` |
| `/api/cli/feedback/status` | POST | body `{ id, status }` | `{ feedback }`; invalid/missing status → 400; not found → 404 |
| `/api/cli/feedback/delete` | POST | body `{ id }` | `{ feedback }` (soft delete, sets `deletedAt`); 404 when absent/already-deleted |
| `/api/cli/admin/stats` | GET | `?range=` (`"7d"\|"all"` else `"30d"` default) | `{ stats: AdminStats }` |
| `/api/cli/admin/growth` | GET | `?range=` (same coercion) | `FunnelStats` at top level (NOT wrapped in `{stats}`) |
| `/api/cli/admin/feedback` | GET | `?after=`, `?limit=` (default 10, clamped 1–50) | `{ items, hasNext }` top level |

All can also 500 `{ error: "Could not …" }` on core failure. See S18 for the full
route-contract framing.

## 2. Data shapes (exact field names — `actionamp-admin --json` prints these verbatim)

### 2.1 `AdminStats` (admin/operationsCore.ts)

```
{ range: "7d"|"30d"|"all", since: string|null,
  users: { total, signedUpToday, signedUp7d, signedUp30d, activeToday, active7d, active30d,
           selectedSignups, selectedActive,
           deviceActivity: { sevenDays: {mobile,tablet,desktop,unknown}, thirtyDays: {…} } },
  tasks: { created7d, completed7d, total },
  payments: { confirmed, total, checkoutToPaidPct: number|null },
  activity: { captures, triageCompleted, tasksCreated, tasksCompleted, taskCompletionPct: number|null },
  funnel: [{ name, count, fromPreviousPct: number|null, fromLandingPct: number|null }],
  feedback: { byStatus: { OPEN, IN_PROGRESS, RESOLVED, CLOSED }, total } }
```
Windows computed once per call (UTC): today = midnight UTC; 7d/30d = now − N days;
`since` = null for `range:"all"`. `selectedSignups/selectedActive` use the selected
range. `payments.confirmed` = `status:"SUCCEEDED", paidAt >= since`; percentages are
`Math.round(x*1000)/10` (one decimal). `checkoutToPaidPct` = payments/`CHECKOUT_STARTED`
count from the funnel (fallback `paymentsConfirmed`), null when no checkouts. Feedback
counts exclude soft-deleted rows; `byStatus` zero-fills missing statuses. `captures` =
`CAPTURE_CREATED` events, `triageCompleted` = `TRIAGE_COMPLETED` events in range.
`deviceActivity` = distinct userIds per device class from `APP_OPENED` events on
`AnalyticsSession.deviceClass` (7d/30d windows; unknown bucket for null/other).
Payment/Analytics delegates are optional in the core — they degrade to 0/[] when absent.

### 2.2 `ActivityStats` (activity page)

```
{ weeks: ActivityWeek[8] (oldest → newest; last = current week),
  month: { label: "Month YYYY" (en-US, UTC), weeks: ActivityWeek[] } }
ActivityWeek = { weekStart: ISO, weekEnd: ISO (exclusive), isCurrent: boolean,
  signups, activeUsers, captures, triageCompleted, tasksCreated, tasksCompleted }
```
Trend weeks are full ISO weeks (Mon 00:00 UTC → next Mon); month rows are clipped to
the calendar month so they sum to the month's totals. Buckets use `gte`/`lt`.

### 2.3 `AdminUserRow` (userManagementCore.ts `getAdminUsersCore`)

```
{ id, name (=fullName), email (first email AuthIdentity providerUserId, else null),
  signedUpAt (=createdAt), lastLoginAt, lastActiveAt, billedPlan (=plan),
  manualAccessGrant, manualGrantAt, isAdmin,
  logins7d, appOpens7d, tasksCreated7d, projectsCreated7d, goalsCreated7d,
  tasksFinished7d, tasksFinished30d }
```
Wrapped: `{ total (count matching all filters), nextCursor (last row id when more,
else null), items }`. Defaults: `limit 25` (1–50 integer, else `AdminUserInputError
"Invalid user page limit."`), `sort "signup_desc"`. Sorts map: `signup_*` → `createdAt`,
`last_login_desc` → `lastLoginAt`, `last_active_desc` → `lastActiveAt`; always
tie-broken by `id` in the same direction. Cursor = `{ cursor: { id }, skip: 1 }`;
a failed query throws `AdminUserInputError("Stale or invalid user cursor.")`.
Access filters: `free` = `{isAdmin:false, manualAccessGrant:null, plan:"FREE"}`;
`pro` = manual PRO or plan PRO; `founder` = manual FOUNDER or plan FOUNDER; `friend` =
manual FRIEND; `admin` = `{isAdmin:true}`. Search = case-insensitive contains on
`fullName` OR email identity. Joined/active filters are `createdAt`/`lastActiveAt`
windows; `never` = `lastActiveAt: null`; `inactive_30d` = null or `< now−30d`.

### 2.4 `FunnelStats` (analytics/operationsCore.ts)

```
{ range, since: string|null,
  funnel: [{ name, count, fromPreviousPct: number|null, fromLandingPct: number|null }],
  sources: [{ source, sessions, signups, checkouts, payments, conversionPct: number|null }],
  retention: { d1Pct: number|null, d7Pct: number|null, note?: string } }
```

### 2.5 `FeedbackRow` (FEEDBACK_SELECT — shared by feedback + admin cores)

```
{ id (UUID PK), shortId ("XXXX-XXXX" Crockford base32), createdAt, updatedAt,
  deletedAt: Date|null, message, status: "OPEN"|"IN_PROGRESS"|"RESOLVED"|"CLOSED",
  userId, userName: string|null, userEmail: string|null, route: string|null,
  section: string|null, lensId: string|null, lensName: string|null, lensColor: string|null,
  userAgent: string|null, viewport: string|null, timezone: string|null }
```
`FEEDBACK_STATUSES = ["OPEN","IN_PROGRESS","RESOLVED","CLOSED"]` (order is
load-bearing — it's interpolated into error strings). Id resolution (`findFeedbackByRef`):
shortId prefix (case-insensitive, Crockford ambiguity mapping O→0, I/L→1, U→V, dash
re-inserted after 4 chars) OR UUID id prefix, `deletedAt: null`, newest-first — an
ambiguous prefix resolves to the newest match. Statuses validated in the core too
(`Invalid status. Must be one of: OPEN, IN_PROGRESS, RESOLVED, CLOSED.`).

## 3. Behaviors + edge cases

- **Admin gate precedence:** every admin surface checks identity → admin BEFORE any DB
  read. Non-admin 403 body is exactly `{ error: "Admin only." }` on PAT routes;
  `HttpError(403, "Admin only.")` on ops; the layout panel "Admin access required." in
  the browser. No information leak about which ids exist.
- **Manual grants (`grantAdminUserAccessCore`):** target must exist ("User not found."),
  must not be self ("You cannot change your own account."), must not be an admin
  ("Admin accounts cannot be changed here."). FOUNDER grant re-checks the Founding-100
  cap: blocks with "Founding 100 is full." when claimed ≥ 100 and the target isn't
  already a founder. Writes run in a `prisma.$transaction`: `User.update
  ({ manualAccessGrant, manualGrantAt: now })` + `AdminUserAction.create` audit row
  (`action: "GRANT_<G>"`, `previousGrant`, `nextGrant`). Remove mirrors it
  (`action: "REMOVE_MANUAL_GRANT"`, nulls the grant). Manual grants ADD access; they
  never overwrite Stripe `plan`.
- **User deletion (`deleteAdminUserCore` / `deleteAdminUsersCore`):** same target rules;
  if the target has a `stripeCustomerId`, the core queries Stripe
  (`subscriptions.list({ status: "all", limit: 100 })`) and BLOCKS with
  "Active recurring billing must be resolved first." when any sub is
  active/trialing/past_due/unpaid; Stripe-client-missing or call failure →
  "Could not verify recurring billing. Try again.". Transaction: delete
  `MagicLoginChallenge` by email (lowercased), write `AdminUserAction`
  (`action: "DELETE_USER"`), delete the User (Payment rows survive via `SetNull`).
  Bulk: 1–25 distinct ids ("Select between 1 and 25 users to delete."), per-id
  try/catch → `{ deletedIds, skipped: [{targetUserId, reason}] }`.
- **Feedback soft delete:** `deletedAt` stamp; every read core filters `deletedAt: null`;
  re-deleting → "Feedback not found." → 404. Status update always updates by the
  resolved row's full PK (a prefix match can't touch two rows).
- **Recent feedback paging:** fetch `limit + 1` ordered `createdAt desc, id desc`,
  cursor `{ id: afterId, skip: 1 }`; `hasNext` = extra row existed; items trimmed to
  `limit`. Limit clamped 1–50 (default 10).
- **AdminStats optional delegates:** Wasp op entity lists that omit Payment/Analytics
  get 0s/empty arrays rather than errors — the port should just always populate them.
- **Cross-user aggregation precedent:** these are the only in-app queries that
  aggregate across all users; the `isAdmin` gate is the boundary. No row-level user
  data beyond the feedback submitter fields + the Users directory (admin-only).
- **`lastActiveAt` provenance:** written by `getAppData` on app load, throttled to
  1/user/15min, fire-and-forget with `.catch(() => {})`. Admin numbers depend on it.

## 4. e2e assertions

**`webapp/e2e/admin-users.spec.ts` (3 tests):**
1. "admin Users route preserves filter and sort URL state": admin signup →
   `/do/admin/users?sort=last_login_desc&access=friend` → "Users" heading visible;
   Sort select = `last_login_desc`; Access select = `friend` (URL is the state store).
2. "non-admin cannot use the Users directory": plain signup → `/do/admin/users` →
   text `/admin access required|don't have access/i` visible (layout gate).
3. "admin can select visible users and cancel one bulk-delete confirmation": second
   admin → "Select visible users" → "selected on this page" text → "Delete selected"
   → dialog "Delete selected users" appears → Cancel → dialog gone.

## 5. Env vars / secrets (names only)

No admin-specific env vars. Indirect dependencies: `STRIPE_SECRET_KEY` (user-deletion
billing check via the shared Stripe client — unset client = deletions blocked with
"Could not verify recurring billing."), plus the DB + auth env the PAT middleware and
ops already need. The admin-cli side reads `ACTIONAMP_API_URL` / `ACTIONAMP_WEB_URL`
(client-side env, documented in `admin-cli/README.md`).
