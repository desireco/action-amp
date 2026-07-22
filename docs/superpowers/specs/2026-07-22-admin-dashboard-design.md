# Admin Dashboard — Design Spec

**Date:** 2026-07-22
**Status:** Approved (design), pending implementation plan
**Scope:** First in-app admin surface — a single stats-first page + admin-cli `stats` command + the data-model + tracking changes required to make user-growth and activity numbers queryable.

---

## 1. Problem & goal

Admin tooling today is CLI-only (`admin-cli` feedback triage). There is no in-app
view of how the product is doing. The goal is a calm, stats-first landing an
admin reaches from their settings, plus a JSON feed for CLI/LLM monitoring.

**What this is:** one page (`/app/settings/admin`), a shared stats core, and an
`actionamp-admin stats` command.

**What this is not (v1):** no charts (no chart lib in the repo), no per-user
drill-down, no triage UI in-page (triage stays in admin-cli), no date-range
picker (windows are fixed: today / 7d / 30d).

## 2. Decisions locked (from brainstorm)

- **Activity data:** add `createdAt` + `lastActiveAt` to `User`. Backfill
  `createdAt` from `Auth`/`AuthIdentity`; leave `lastActiveAt` null for existing
  users. Track `lastActiveAt` going forward via throttled global middleware.
- **Access path:** a new **Settings tab** at `/app/settings/admin`, rendered only
  when `user.isAdmin`. Reuses `SettingsLayout`. No top-level `/admin` route.
- **"Suggestions":** the existing **Feedback** feature (the shell feedback button
  → `Feedback` model). The recent-feedback list shows submissions regardless of
  status, newest first.
- **High-volume feedback:** list defaults to 10, with a **"Show more"** button
  that loads the next batch inline. No full pagination UI in v1.
- **Architecture:** a **shared pure core** (`getAdminStatsCore`) called by both
  the browser (Wasp query) and the admin-cli (PAT route). One source of truth for
  the numbers and the type.
- **CLI JSON:** `actionamp-admin stats --json` emits the exact `AdminStats`
  object so it can be piped to an LLM or monitoring tool.

## 3. Data model change

### 3.1 Schema (`webapp/schema.prisma`, `model User`)

Add two fields:

```prisma
createdAt     DateTime @default(now())
lastActiveAt  DateTime?
```

- `createdAt @default(now())` — new users get it for free.
- `lastActiveAt` nullable — null for everyone at migration time; populated as
  users are seen.
- Migration: `wasp db migrate-dev --name user_activity_fields`.

### 3.2 Backfill script — `webapp/scripts/backfill-user-activity.mjs`

One-off, run once after migrate. For each `User`:

1. Join `Auth` → `AuthIdentity`, take the **earliest** identity-creation
   timestamp as `createdAt` (Wasp writes identity creation time on signup).
2. Write `createdAt` where null. Leave `lastActiveAt` untouched (cannot
   reconstruct historical activity reliably).
3. Log a count of users updated.

Idempotent: only writes where `createdAt IS NULL`. Safe to re-run.

### 3.3 Activity tracking — piggyback on `getAppData`

Global middleware is **already wired** (`main.wasp.ts:155-160` →
`globalMiddlewareConfigFn` in `src/auth/serverMiddleware.ts`), but that function
is a config-time factory with no request access — the wrong place. The session-
cookie middleware in `src/auth/sessionCookie.ts` runs per-request but only has
the `sessionId`, not the userId (the user augmentation isn't visible there).

The cleanest hook is **`getAppData`** in `webapp/src/app/operations.ts`: it runs
on every app load (the truest "user is active" signal — not background API
noise), already has `context.user.id`, and already does a `User.findUnique`
select (line 54). We mirror the existing lazy-write pattern (the daily Today
rollover in the same function):

1. Add `lastActiveAt: true` to the existing `select` on line 56.
2. After the rollover block, add: if `lastActiveAt` is null **or** older than
   **15 minutes**, fire a non-awaited
   `context.entities.User.update({ where:{ id: userId }, data:{ lastActiveAt: now } })`
   with a `.catch(() => {})` swallow (the write must never break an app load).
3. The 15-minute throttle bounds writes to ≤1/user/15min. "Active today" is
   unaffected by the throttle (any app-open in a day flips it). "Active in
   7d/30d" inherits accuracy from the daily touch.

**Failure mode:** if the throttled write throws (DB hiccup), it's swallowed
(fire-and-forget with a `.catch(()=>{})`) — it must never break an app load.

## 4. Shared core — `webapp/src/admin/operationsCore.ts`

Mirrors the `feedback/operationsCore.ts` split: **no `wasp/server` import** (so
it's importable from both the Wasp op and `patRoutes.ts`).

### 4.1 `AdminStats` type (exported, shared source of truth)

```ts
export type FeedbackStatusCounts = Record<
  "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED",
  number
>;

export interface AdminStats {
  users: {
    total: number;
    signedUpToday: number;
    signedUp7d: number;
    signedUp30d: number;
    activeToday: number;
    active7d: number;
    active30d: number;
  };
  tasks: {
    created7d: number;
    completed7d: number;
    total: number;
  };
  feedback: {
    byStatus: FeedbackStatusCounts;
    total: number;
  };
}
```

All values are serializable — no `Date` objects, no `BigInt`. The type is the
single source for both surfaces and for the CLI's type copy.

### 4.2 `getAdminStatsCore(entities): Promise<AdminStats>`

```ts
export async function getAdminStatsCore(
  entities: Record<string, any>,
): Promise<AdminStats>
```

Runs one `Promise.all` of Prisma calls against `User`, `Task`, `Feedback`:

- `User.count()` → `users.total`
- `User.count({ where:{ createdAt:{ gte: today } } })` → `signedUpToday`
- `createdAt >= 7dAgo` / `>= 30dAgo` → `signedUp7d` / `signedUp30d`
- `User.count({ where:{ lastActiveAt:{ gte: today } } })` → `activeToday`
  (and 7d / 30d)
- `Task.count({ where:{ createdAt:{ gte: 7dAgo } } })` → `tasks.created7d`
- `Task.count({ where:{ isDone:true, completedAt:{ gte: 7dAgo } } })` →
  `tasks.completed7d`
- `Task.count()` → `tasks.total`
- `Feedback.groupBy({ by:["status"], _count:{ _all:true } })` → folded into
  `feedback.byStatus` (zero-fill missing statuses)
- `Feedback.count()` → `feedback.total`

Time windows computed once at the top of the function (`startOfTodayUtc`,
`sevenDaysAgo`, `thirtyDaysAgo`). All counts are UTC-relative and consistent
within a single call.

### 4.3 `getRecentFeedbackCore` (cursor paged)

The existing `listFeedbackCore` supports `limit` but not a cursor. Add a small
paged core in the same file:

```ts
export async function getRecentFeedbackCore(
  entities: Record<string, any>,
  { afterId, limit }: { afterId?: string | null; limit: number },
): Promise<{ items: FeedbackRow[]; hasNext: boolean }>
```

- Newest first. `limit` clamped to 1–50 (default 10) by the caller.
- `afterId` = the id of the last item on the current page; the core fetches
  `limit + 1` rows ordered `createdAt desc, id desc` with a cursor
  (`skip: 1, cursor: { id: afterId }`) when `afterId` is present, else the first
  page.
- `hasNext` is true iff the `limit + 1`th row exists (then trimmed before
  return).
- Reuses the existing `FEEDBACK_SELECT` shape (imported from
  `feedback/operationsCore.ts` or re-declared; see §4.4).

### 4.4 Shared feedback row shape

To avoid a cross-file type dependency that `detectServerImports` might flag,
declare a local `FeedbackRow` type in `admin/operationsCore.ts` matching the
`FEEDBACK_SELECT` fields (id, shortId, createdAt, updatedAt, message, status,
userId, userName, userEmail, route, section, lensId, lensName, lensColor,
userAgent). Comment notes it mirrors `feedback/operationsCore.ts`.

## 5. Server surfaces (both call the core)

### 5.1 Browser — `webapp/src/admin/operations.ts`

```ts
import { HttpError } from "wasp/server";
import type { GetAdminStats, GetRecentFeedback } from "wasp/server/operations";
import { getAdminStatsCore, getRecentFeedbackCore } from "./operationsCore";

export const getAdminStats = (async (_args, context) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only.");
  return getAdminStatsCore(context.entities);
}) satisfies GetAdminStats<void, AdminStats>;

export const getRecentFeedback = (async (
  { afterId, limit = 10 }: { afterId?: string | null; limit?: number },
  context,
) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only.");
  return getRecentFeedbackCore(context.entities, {
    afterId: afterId ?? null,
    limit: Math.max(1, Math.min(50, limit)),
  });
}) satisfies GetRecentFeedback<{ afterId?: string | null; limit?: number }>;
```

Registered in `main.wasp.ts`:

```ts
query(getAdminStats, { entities: ["User", "Task", "Feedback"], auth: true }),
query(getRecentFeedback, { entities: ["Feedback"], auth: true }),
```

### 5.2 CLI route — `patRoutes.ts`

**Prerequisite:** add `User: authPrisma.user` to `authEntities` in
`webapp/src/auth/prisma.ts` (currently absent — the admin cores read
`entities.User`, which won't resolve without this). One line.

`GET /api/cli/admin/stats` and `GET /api/cli/admin/feedback?after=<id>&limit=<n>`:

```ts
export const cliAdminStats = async (req, res, _context) => {
  const user = req.patUser;
  if (!requireAdmin(user, res)) return;          // existing helper
  const stats = await getAdminStatsCore(authEntities);
  return res.status(200).json({ stats });
};

export const cliAdminFeedback = async (req, res, _context) => {
  const user = req.patUser;
  if (!requireAdmin(user, res)) return;
  const afterId = queryString(req, "after") || null;
  const limitRaw = Number(queryString(req, "limit") ?? "10");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 10;
  const page = await getRecentFeedbackCore(authEntities, { afterId, limit });
  return res.status(200).json(page);
};
```

Registered in `main.wasp.ts` with `middlewareConfigFn: patRouteMiddleware`,
`auth: false`, `entities: []` — identical pattern to the feedback routes.

## 6. Browser page — `webapp/src/admin/AdminPage.tsx` + `AdminPage.css`

### 6.1 Shell + gate

Renders through `SettingsLayout` (consistent with Billing/Preferences/Pat). First
thing in the component:

```tsx
const { data: user } = useAuth();
if (!user?.isAdmin) {
  return <SettingsLayout><Card padding="lg"><p>You don't have access to this page.</p></Card></SettingsLayout>;
}
```

Belt-and-suspenders: the tab is hidden for non-admins and the query 403s, but a
direct URL hit renders a calm message instead of a crash.

### 6.2 `SettingsLayout` tab

`SettingsLayout.tsx` gains `const { data: user } = useAuth()`, and the rendered
tab list conditionally includes `{ label: "Admin", to: "/app/settings/admin",
exact: false }` when `user?.isAdmin`. Non-admins never see the link.

### 6.3 Layout (stats-first, calm)

Whitespace-forward, no decorative color, teal only where it carries meaning
(state/selection).

1. **Page heading** — `<h2>Admin</h2>` (the shell already renders the
   `<h1>Settings</h1>`). One-line note: "Last refreshed: <relative>" driven by
   the query's `dataUpdatedAt`.

2. **Stat tiles** — a responsive grid of `Card` components. Each tile: big
   number (`--aa-text-2xl`) + label (`--aa-text-sm`, `--aa-text-3`). Grouped:
   - **Users:** Total · Today · 7d · 30d
   - **Active:** Today · 7d · 30d
   - **Tasks (7d):** Created · Completed (+ small "X% completion" sub-line
     where `X = completed7d / created7d`, i.e. completed-within-7d as a fraction
     of created-within-7d — a same-window ratio, not mixed with the all-time
     total)
   - **Feedback:** Open · In progress · Resolved · Closed — as `Chip`-style
     counts with the status color variants.

3. **Recent feedback** — a `Table` (`Table` + `TableColumn`, same idiom as
   `BillingPage`'s payment history):
   - `Status` — `Chip` (teal for RESOLVED, amber for IN_PROGRESS, muted for
     CLOSED, default for OPEN)
   - `Message` — truncated to one line with ellipsis
   - `From` — `userName`/`userEmail` or "Anonymous"
   - `When` — relative time from `createdAt`
   - Below the table: a `Button variant="secondary"` "Show more" that bumps the
     `afterId` cursor and appends the next page. Hidden when `!hasNext`. While
     loading more, the button shows "Loading…" and is disabled.

**Loading state:** while `getAdminStats` is fetching, the tile grid renders
skeleton tiles (muted "—" placeholders) rather than a spinner-only screen. The
feedback table shows the standard `Table` `emptyMessage` while loading.

**Error state:** a single muted `Card` at the top with the message; tiles +
table hidden. (A 403 from a stale admin state would surface here.)

## 7. Admin CLI — `actionamp-admin stats`

New command in `admin-cli/src/commands/stats.ts`, registered in `index.ts`.

- **`actionamp-admin stats`** — `GET /api/cli/admin/stats`, formatted terminal
  output (Users / Active / Tasks / Feedback groups, calm layout matching the
  existing `output.ts` style).
- **`actionamp-admin stats --json`** — emits the raw `AdminStats` object as JSON
  to stdout, ready to pipe to an LLM or a monitor:
  ```
  actionamp-admin stats --json | llm "summarize the health of this product"
  ```
- **`actionamp-admin feedback recent [--limit N] [--after ID]`** — optional, for
  completeness: `GET /api/cli/admin/feedback`. The existing `feedback list`
  already covers full triage; this is just the paged "recent" view. (Can defer
  to a follow-up if scope is tight.)

### 7.1 Type sharing

`admin-cli` is a standalone package with no shared code (per `AGENTS.md`). The
`AdminStats` type is **copied** into `admin-cli/src/types.ts` (mirrors how
`Feedback` is already duplicated there). JSON from the server is the source of
truth; the local type only types the formatter.

## 8. Files touched

**New:**
- `webapp/src/admin/operationsCore.ts` — `AdminStats` type,
  `getAdminStatsCore`, `getRecentFeedbackCore`, `FeedbackRow`.
- `webapp/src/admin/operations.ts` — `getAdminStats`, `getRecentFeedback` Wasp
  queries.
- `webapp/src/admin/AdminPage.tsx` + `AdminPage.css` — the page.
- `webapp/scripts/backfill-user-activity.mjs` — one-off backfill.
- `webapp/migrations/<ts>_user_activity_fields/` — generated.
- `admin-cli/src/commands/stats.ts` — `stats` command.

**Modified:**
- `webapp/schema.prisma` — `User.createdAt` + `User.lastActiveAt`.
- `webapp/main.wasp.ts` — route, two queries, two API routes, import lines.
- `webapp/src/app/SettingsLayout.tsx` — conditional Admin tab.
- `webapp/src/app/operations.ts` (`getAppData`) — throttled `lastActiveAt` write.
- `webapp/src/auth/patRoutes.ts` — `cliAdminStats` + `cliAdminFeedback` route
  handlers.
- `webapp/src/auth/prisma.ts` — add `User: authPrisma.user` to `authEntities`.
- `admin-cli/src/types.ts` — `AdminStats` copy.
- `admin-cli/src/index.ts` — register `stats` command.

**Tests (new):**
- `webapp/src/admin/operationsCore.test.ts` — unit tests for
  `getAdminStatsCore` (window math, groupBy folding, missing-status zero-fill)
  and `getRecentFeedbackCore` (first page, cursor page, `hasNext` boundary) with
  a mock entities object, mirroring `operationsCore.test.ts`.

## 9. Out of scope / future

- **Charts** — no chart library in the repo; v1 is numbers + chips. A later
  iteration could add a sparkline for signups/active over the trailing 30 days
  (would require daily buckets via `groupBy` on a date-truncated field).
- **Date-range picker** — windows are fixed today/7d/30d. Custom ranges if a
  need emerges.
- **Per-user drill-down** — v1 is aggregate only.
- **In-page triage** — feedback status changes stay in admin-cli to avoid
  fragmenting the triage surface. The page is read-only.
- **Revenue stats** — `Payment` model already has what's needed (amount,
  status, paidAt); a revenue tile is a natural v2 add.
- **Auth/login funnels** — conversion is derivable from the Auth tables; a
  follow-up if useful.

## 10. Risks & notes

- **Backfill correctness** — `createdAt` from the earliest `AuthIdentity` is a
  best-effort proxy; users created before the field existed get a plausible
  date, not a guaranteed-exact one. Documented in the backfill script.
- **`lastActiveAt` write overhead** — throttled to ≤1/user/15min, non-awaited,
  swallow-on-error. Negligible at current scale; revisit if DAU grows.
- **Cross-user query precedent** — this is the first in-app query that
  intentionally aggregates across all users (existing queries are
  `context.user.id`-scoped). The `isAdmin` gate is the boundary; no row-level
  user data beyond feedback submitter (already shown in admin-cli) is surfaced.
- **Wasp compile** — all `main.wasp.ts` additions verified with `wasp compile`,
  not `tsc` (per `webapp/AGENTS.md`).
