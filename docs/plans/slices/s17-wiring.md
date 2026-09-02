# S17 wiring — Admin dashboard + admin routes

> Status: DELIVERED (this slice). P0 checklist:
> `packages/contract/src/s17-admin/README.md`. Fragments:
> `packages/contract/src/admin.ts`, `packages/domain/src/admin/**` +
> `src/feedback/**`, `apps/api/src/procedures/admin.ts` + `cli-routes.ts` +
> `seed-admin.ts`, `apps/web` `/do/admin/**` + admin store/components,
> `apps/web/e2e/admin.spec.ts`.

## 1. Contract + procedures (fragment → composition)

- Fragment: `packages/contract/src/admin.ts` — `adminContract` with the 11 ops
  (§1.2 of the P0 notes): `stats`, `activityStats`, `users`, `grantAccess`,
  `removeAccess`, `deleteUser`, `deleteUsers`, `funnel`, `recentFeedback`,
  `updateFeedbackStatus`, `deleteFeedback`. Wire paths:
  `POST /rpc/admin/<key>`.
- Composition line (S16-style "temporary gate wiring", LIVE because the
  slice's own e2e needs the surface mounted):
  - `packages/contract/src/router.ts`: `admin: adminContract, // S17`
  - `apps/api/src/router.ts`: `admin: adminProcedures, // S17`
  - `packages/contract/src/index.ts`: additive export block (`S17 (admin)
    fragment` — schemas + types, S9/S12 style).
- Fragment impl: `apps/api/src/procedures/admin.ts`. Every op runs
  `requireAdmin(context)` FIRST (identity → `user.isAdmin` → any DB read);
  non-admins get oRPC `FORBIDDEN` (403) with the webapp's exact
  `"Admin only."` message. The userManagement cores' three error classes map
  to `BAD_REQUEST` (400) with the webapp strings verbatim (the webapp's Wasp
  op channel surfaced the same messages; 400 keeps them client-visible).
  Temporal fields map core `Date`s → contract ISO strings (`toFeedbackDto`,
  `toAdminUserDto`).

### Ops parity map (P0 §1.2 → port)

| Webapp op | Port | Notes |
|---|---|---|
| `getAdminStats` | `admin.stats` | invalid `range` coerces `"30d"`; optional Payment/Analytics delegates always populated here |
| `getAdminActivityStats` | `admin.activityStats` | no input |
| `getAdminUsers` | `admin.users` | input validated in the core (`AdminUserInputError` → 400); limit default 25, clamp 1–50 |
| `grantAdminUserAccess` | `admin.grantAccess` | 400 `"Target user and grant are required."` before the core; `$transaction` + audit row |
| `removeAdminUserAccess` | `admin.removeAccess` | 400 `"Target user is required."` |
| `deleteAdminUser` | `admin.deleteUser` | Stripe-active sub block (see §5); MagicLoginChallenge purge; audit |
| `deleteAdminUsers` | `admin.deleteUsers` | 1–25 distinct ids; per-id `{deletedIds, skipped}` |
| `getAdminFunnel` | `admin.funnel` | from the funnel core (see §4) |
| `getRecentFeedback` | `admin.recentFeedback` | afterId cursor, limit clamp 1–50 default 10, statuses filter |
| `updateFeedbackStatus` | `admin.updateFeedbackStatus` | prefix resolution, update by resolved PK |
| `deleteFeedback` | `admin.deleteFeedback` | soft delete; re-delete → 400 `"Feedback not found."` |

## 2. Domain (additive seam extension)

Cores (bodies verbatim from webapp; type imports swapped to the seam):

- `src/admin/operationsCore.ts` — `getAdminStatsCore`, `getActivityStatsCore`
  (+ `startOfISOWeek`, `ACTIVITY_TREND_WEEKS`), `getRecentFeedbackCore`.
- `src/admin/userManagementCore.ts` — directory + grants + deletes. **The one
  signature deviation:** webapp imported the Stripe singleton; the port takes
  `deps: { stripe?: AdminStripeClient | null }` on `deleteAdminUserCore` /
  `deleteAdminUsersCore` (optional third arg, so existing call shapes still
  typecheck). Null client ⇒ deletions of Stripe customers block with
  `"Could not verify recurring billing. Try again."` — the unset-singleton
  behavior preserved.
- `src/admin/funnelCore.ts` — `getFunnelStatsCore` + `FunnelRange`/
  `FunnelStats` (the funnel half of webapp's `analytics/operationsCore.ts`).
  **Placement note:** when a full analytics surface slices, move this file to
  `src/analytics/operationsCore.ts` verbatim and re-point the admin import.
- `src/feedback/operationsCore.ts` — `listFeedbackCore`, `showFeedbackCore`
  (prefix resolution: Crockford mapping O→0, I/L→1, U→V, dash re-inserted
  after 4 chars, OR UUID prefix, newest wins), `updateFeedbackStatusCore`,
  `deleteFeedbackCore`, `FEEDBACK_SELECT`/`FEEDBACK_STATUSES` re-exported
  from the seam (one definition). **Not ported:** `submitFeedbackCore` (the
  in-app write mints shortIds via webapp's `shared/shortId`) — belongs to the
  user-facing feedback surface; land `src/shared/shortId.ts` + submit there.

Seam (`src/db/`, additive):

- `seam.ts`: `Feedback`/`Payment`(extended: `status`, `paidAt`, `count`)/
  `AnalyticsEvent`/`AnalyticsSession`(stats read)/`LoginEvent`/
  `AdminUserAction`/`MagicLoginChallenge` delegates; `UserWhereInput` +
  `isAdmin`/`fullName`/`createdAt`/`lastActiveAt`/`auth.identities.some`
  (+ S16's `stripeCustomerId` untouched); `UserUpdateInput` + grant fields;
  `UserDelegate` + admin findUnique overload, `findMany` (directory page,
  Prisma cursor), `delete`, optional count args; `TaskWhereInput`/
  `ProjectWhereInput`/`GoalWhereInput` `userId: string | StringFilter`
  (+ createdAt on Project/Goal); `Task/Project/Goal.groupBy(userId)`;
  `Entities` keys + optional `$transaction`.
- `client.ts`: translators (`feedbackWhereToSql`, `analyticsEventWhereToSql`,
  extended `userWhereToSql` with the identities EXISTS — raw identifiers are
  the plain-select root `"User"`, values bound), new delegate factories, the
  admin `User.findMany` cursor (tuple compare on the sort column with
  Postgres null-order handling; missing cursor row throws → the core maps to
  `"Stale or invalid user cursor."`), identities attached per-page (never
  per-row), `$transaction` via `db.transaction` re-wrapped through
  `createEntities` (the tx callback sees the full surface, Prisma-shape),
  `Feedback.update` re-stamps `updatedAt` below the seam (`@updatedAt`
  parity).
- `types.ts`: enums + row types for the seven models.
- `seam.checks.ts`: 13 new `expectEntities` locks (7 admin + 6 feedback).
- `package.json`: `./admin` + `./feedback` subpath exports.

## 3. REST mounts — the CLI PAT routes (apps/api/src/cli-routes.ts)

`createCliRest({ db, entities, patPort? })` returns a Hono app with EXACTLY
the webapp paths/bodies (S18 conformance-tests these):

| Route | Success body | Pinned 4xx |
|---|---|---|
| `GET /api/cli/feedback/list?status=&limit=` | `{ feedback: FeedbackRow[] }` newest-first, `deletedAt: null` only | 400 invalid status / `limit must be a positive number or 'all'.` |
| `GET /api/cli/feedback/show?id=` | `{ feedback }` | 400 `id is required.` · 404 `Feedback not found.` |
| `POST /api/cli/feedback/status {id,status}` | `{ feedback }` | 400 `id is required.` / `status is required. One of: …` / `Invalid status. Must be one of: …` · 404 |
| `POST /api/cli/feedback/delete {id}` | `{ feedback }` (soft) | 400 `id is required.` · 404 on absent/already-deleted |
| `GET /api/cli/admin/stats?range=` | `{ stats: AdminStats }` | — |
| `GET /api/cli/admin/growth?range=` | FunnelStats at TOP level (NOT `{stats}`-wrapped) | — |
| `GET /api/cli/admin/feedback?after=&limit=` | `{ items, hasNext }` (limit default 10, clamp 1–50) | — |

Gate order per route: (1) F10b `resolvePatCore` Bearer-only — 401 exact bodies
(`Missing or malformed bearer token.` / `Invalid or revoked token.`), 402
entitlement BEFORE the handler (`isAdmin` bypasses); (2) `requireAdmin` — 403
`{"error":"Admin only."}` BEFORE any DB read (pinned by tests that assert the
entities spies are never touched); (3) input validation → shared cores. 500s
use the webapp strings (`Could not list feedback.`, `Could not load admin
stats.`, …).

Mount line (marked in `apps/api/src/index.ts`, after the S15 public mount):

```ts
import { createCliRest } from "./cli-routes.js";
app.route("/", createCliRest({ db, entities }));
```

Live evidence (this slice, shared dev DB): no token → 401 malformed; garbage
token → 401 invalid; non-admin PAT → `{"error":"Admin only."}`; admin PAT →
stats wrapped / growth bare / `{items, hasNext}` clamped; prefix
`show?id=test` → `TEST-0001`; status update + soft delete + re-delete 404.

## 4. Web routes (apps/web)

| Route | File | Notes |
|---|---|---|
| `/do/admin` | `src/routes/do/admin/+page.svelte` | replace-redirect → `/do/admin/overview` |
| `/do/admin/overview` | `.../overview/+page.svelte` | tiles + funnel pulse + recent-feedback table (Show more, inline triage); `?range=` is URL state |
| `/do/admin/activity` | `.../activity/+page.svelte` | this-week tiles with deltas; month clipped; 8-week trend |
| `/do/admin/users` | `.../users/+page.svelte` | q/joined/active/access/sort/cursor ALL in the URL; bulk select + ConfirmDialog |
| `/do/admin/funnel` | `.../funnel/+page.svelte` | `?range=`; primary path / acquisition / retention |
| `/do/admin/feedback` | `.../feedback/+page.svelte` | open/all filter (URL), cursor-paged, StatusSelect with delete confirm |
| (gate) | `src/routes/do/admin/+layout.svelte` | loading → nothing; no user → `/login`; `!isAdmin` → calm "Admin access required." panel; else the rail nav |

Supporting files: `src/lib/stores/admin.svelte.ts` (the client slice — local
`AdminClientSlice` mirror + cast, prefs.svelte.ts precedent), `src/lib/
components/admin/{Table.svelte,StatusSelect.svelte,table.ts}` (webapp
ui/Table + StatusSelect ports; the Column type lives in table.ts — Svelte
scripts can't export types cleanly), `src/lib/styles/admin.css` (the six
webapp admin CSS files merged; `--aa-danger` → `--aa-rose`, the only token
this stack lacks).

## 5. Seed, env, deferred

- `apps/api/src/seed-admin.ts` — idempotent, localhost-only: admin
  (`admin@local.test`, `isAdmin` — upserted, never demoted), managees
  `ada@local.test` / `grace@local.test` (+ lens + 2 tasks each), feedback
  rows `TEST-0001..3` (OPEN / IN_PROGRESS / RESOLVED). Run once before e2e:
  `cd apps/api && DATABASE_URL=… bun src/seed-admin.ts`.
- **Stripe (deferred to S16's client):** `apps/api` has no stripe dependency;
  the deletion cores take the injected `AdminStripeClient`. When S16's client
  lands, pass it in `procedures/admin.ts` (`deps: { stripe }`) — until then
  deletions of `stripeCustomerId` users block exactly like the webapp's
  unset-singleton path (message above), and ordinary local accounts delete
  fine (verified live).
- **`submitFeedbackCore` + `src/shared/shortId.ts`** — not in this slice's
  scope (see §2); the Crockford prefix-resolution half IS ported and pinned.
- **`/do/settings/admin` legacy redirect** — lives under `settings/`, not
  this slice's route tree; one 3-line page for the integrator if wanted.
- Known non-S17 failure in the shared e2e env: `billing.spec.ts`'s webhook
  test needs `STRIPE_WEBHOOK_SECRET` on the API server process (S16's env);
  unrelated to this slice.
