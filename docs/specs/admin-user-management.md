---
id: admin-user-management
kind: spec
title: "Admin user management and activity directory"
status: draft
priority: P2
feature: admin-user-management
spec_owner: discover
build_owner: build
created: 2026-08-11
depends_on: [admin-workspace, entitlements, growth-analytics]
---

# Spec: Admin user management and activity directory

## Summary

Extend the existing admin-only workspace with a **Users** destination. It lets
an administrator move from aggregate signup/activity metrics to a paginated,
filterable directory of individual accounts, see clear account and product
activity timestamps, grant internal access, and permanently remove eligible
accounts.

This is operational tooling, not a customer-facing directory, CRM, or new
staff-role system. The existing `isAdmin` boolean remains the only staff role.

## User problem

Overview can say that people signed up or were active, but cannot answer who
they are, when they joined, whether they returned, or what product work they
completed. An administrator needs a calm way to inspect that evidence and make
the few account-level changes that support launch operations.

## Decisions locked

1. **Dedicated destination.** Add `/app/admin/users` to `AdminLayout` after
   Overview. It is admin-only through client gate, page gate, and every server
   query/action. There is no user-facing route and no admin CLI command in v1.
2. **Overview drills into Users.** Total signups, selected-range signups, and
   selected-range active-user tiles link to URL-backed Users filters. The
   dashboard remains a scan; it does not grow a second user table.
3. **Precise activity vocabulary.**
   - **Signed up** = `User.createdAt`.
   - **Last login** = latest successful authentication, stored on
     `User.lastLoginAt`.
   - **Logins · 7d** = count of `LoginEvent` rows in the last rolling seven
     days.
   - **Last active** = existing `User.lastActiveAt`: a throttled authenticated
     app-load signal, not a login.
   - **App opens · 7d** = existing first-party `APP_OPENED` events. This is
     best-effort browser telemetry and must be labelled accordingly.
   - **Created · 7d** = durable Task, Project, and Goal rows created in that
     rolling window.
   - **Tasks finished** = Task rows with `completedAt` in rolling 7- and
     30-day windows.
4. **No invented history.** The `lastLoginAt` migration is nullable and is not
   backfilled from `lastActiveAt`, sessions, or analytics. Existing accounts
   render `Not recorded` until their next successful login.
5. **One manual access grant at a time.** `User.manualAccessGrant` is nullable
   and has `PRO`, `FOUNDER`, and `FRIEND` values. It is an internal override;
   it never writes `User.plan`, `planRenewsAt`, a Payment, or Stripe state.
   Effective product access is manual grant first, then active Stripe plan.
6. **Friend is unlimited, not Founder.** `FRIEND` receives the same unlimited
   product entitlement as Founder, displays as **Friend**, never displays as
   Founder, and does not count toward Founding 100. A manual `FOUNDER` grant
   displays as Founder and does count toward the cap. Removing any manual
   grant restores the account's current Stripe-derived access.
7. **Founder-cap invariant.** All founding-cap reads and checkout admission
   count Stripe `plan = FOUNDER` plus `manualAccessGrant = FOUNDER`; they
   explicitly exclude `FRIEND`. A full cap rejects a manual Founder grant
   without partial writes.
8. **Every admin mutation is auditable.** A compact `AdminUserAction` ledger
   records actor id, target id, action, previous/new manual grant, and time in
   the same transaction as a grant change or deletion. It contains no email,
   task, or payment content.
9. **Deletion is permanent but billing-safe.** An administrator confirms by
   typing the account email. The server rejects self-deletion, deletion of an
   admin account, and deletion of an account with active recurring Stripe
   billing. It performs a read-only Stripe subscription lookup using the
   existing customer id; lookup failure fails closed with a named retryable
   error. Eligible deletion revokes local sessions/PATs through cascades,
   deletes app-owned records, removes outstanding magic-login challenges for
   the email, and leaves anonymized analytics plus payment reconciliation
   records. It does not cancel Stripe or otherwise mutate external billing.
10. **Payment audit survives account deletion.** `Payment.userId` becomes
    nullable with `onDelete: SetNull`; payment data stays available for
    reconciliation after User deletion. This is intentional and must be
    explained in the confirmation copy.
11. **No false Founder claims.** A Friend or Pro grant creates no Stripe
    payment, does not appear as a purchase, and is visibly marked `Admin
    grant` in admin UI. Customer billing surfaces continue to show Stripe
    billing facts; only Admin Users shows internal access source.
12. **Boring pagination.** Users are cursor-paged, default 25 and maximum 50.
    Server applies every filter/sort. React never fetches all users or computes
    eligibility locally.

## Experience

### Users route and links

Routes and query state:

```text
/app/admin/users
/app/admin/users?joined=7d&sort=signup_desc
/app/admin/users?active=7d&sort=last_active_desc
/app/admin/users?access=friend&sort=last_login_desc
```

Overview links:

```text
Total signups       -> Users, newest signup first
New signups (range) -> Users, joined=<7d|30d>, newest signup first
Active users (range)-> Users, active=<7d|30d>, newest activity first
```

`all` range links omit the time filter. Links preserve no unrelated Overview
URL state.

### Directory

Table columns, in this order:

```text
User | Access | Signed up | Last login | Last active |
7d activity | Tasks finished (7d / 30d) | Actions
```

- User shows full name and email.
- Access shows Free, Pro, Founder, Friend, or Admin. Manual grants carry a
  subdued `Admin grant` source label. Admin does not replace an account's
  access label.
- Timestamps render localized absolute date/time and a relative helper; full
  ISO timestamp is available in the native title/accessible label.
- `7d activity` is a compact summary. Expanding a row reveals login count,
  best-effort app opens, total Tasks/Projects/Goals, and their created-7d
  counts.
- On narrow screens the dense reference table scrolls horizontally. It does
  not turn into noisy dashboard cards.

Filters are URL-backed: text search by name/email; joined window; active
window (`7d`, `30d`, `inactive_30d`, `never`); access (`free`, `pro`,
`founder`, `friend`, `admin`); and sort (`signup_desc`, `signup_asc`,
`last_login_desc`, `last_active_desc`). Back/forward and reload reproduce the
same filter selection. Cursor state is not retained after a filter/sort change.

### Actions

Each row has a keyboard-accessible action menu:

```text
Grant Pro
Grant Friend
Grant Founder
Remove manual grant       (only when present)
Delete user data
```

Grant actions are explicit confirmation dialogs identifying the effective
access outcome. Buttons disable while pending; server errors remain visible and
do not optimistically mutate the row. Deletion uses `ConfirmDialog`, requires
the exact normalized email, and says which local data is removed versus which
payment/anonymous analytics records remain.

## Data and architecture

### Schema

Add to `User`:

```prisma
lastLoginAt       DateTime?
manualAccessGrant ManualAccessGrant?
manualGrantAt     DateTime?
```

Add:

```prisma
enum ManualAccessGrant { PRO FOUNDER FRIEND }

model LoginEvent {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  provider  String
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt])
}

model AdminUserAction {
  id          String   @id @default(uuid())
  createdAt   DateTime @default(now())
  actorUserId String
  targetUserId String?
  action      AdminUserActionType
  previousGrant ManualAccessGrant?
  nextGrant     ManualAccessGrant?
  @@index([targetUserId, createdAt])
  @@index([actorUserId, createdAt])
}
```

`AdminUserAction` ids deliberately remain opaque audit references instead of
relations: deleting a User must not destroy the record of the administrative
action, and no PII is copied into it.

Add indexes supporting list sort/aggregation:

```text
User(createdAt), User(lastLoginAt), User(lastActiveAt)
Task(userId, createdAt), Task(userId, completedAt)
Project(userId, createdAt), Goal(userId, createdAt)
AnalyticsEvent(userId, name, occurredAt) only if explain confirms existing
  (userId, occurredAt) cannot serve the bounded APP_OPENED aggregate.
```

Make `Payment.userId` nullable with `onDelete: SetNull`; retain the existing
payment fields and unique Stripe identifiers. Migration must be additive until
this relationship alteration, inspect generated SQL, and never reset a DB.

### Login recording

One shared server helper records a successful login by updating `lastLoginAt`
and creating `LoginEvent` with provider name. Custom passwordless verification
calls it after a session is created. Wasp `onAfterLogin` calls the same helper
for built-in/dev authentication and future OAuth. Magic login bypasses Wasp's
built-in login hook, so it must call the helper directly; it must not call both
paths.

A database error recording the event is logged with a named `login_activity`
context but cannot invalidate an already-created session. The UI must therefore
describe login counters as operational telemetry, while `lastLoginAt` remains
the intended successful-login timestamp when write succeeds.

### Entitlements and source of truth

Create one central resolver used by browser, Wasp operations, PAT middleware,
and HTTP entitlement helpers. It receives billed plan/renewal, admin boolean,
and manual grant; returns effective access and its source. Existing `isEntitled`
uses the resolver rather than reimplementing checks. Admin bypass remains
stronger than all grants.

No product operation may read `manualAccessGrant` ad hoc. Existing customer
UI must continue to show billing facts honestly; Admin Users may show both
billed plan and manual source where useful.

### Directory core

`src/admin/operationsCore.ts` gains a pure, Wasp-free paged directory core.
It performs one user page query (including only email identity fields), one
total count, then bounded `groupBy` aggregates over page user ids for LoginEvent,
AnalyticsEvent, Task, Project, and Goal. It returns plain serializable rows,
next cursor, and total count. No N+1 row queries.

Sort ties include id. Rows lacking last-login/activity sort after dated rows.
Cursor validity is checked against the selected sort/filter; missing/stale
cursors return a named safe error and reset UI to first page rather than
silently skipping rows.

### Boundary matrix

| Surface | Authentication | Target ownership | Entitlement | Other guard |
|---|---|---|---|---|
| List/query users | admin required | global admin data only | n/a | no auth provider data |
| Grant/remove access | admin required | any non-self non-admin account | n/a | valid grant, Founder cap |
| Delete user | admin required | any non-self non-admin account | n/a | exact email, no active recurring billing |
| Login recorder | authenticated auth flow only | current authenticated account | n/a | provider allow-list |

## Existing-data and rollout behavior

1. Deploy compatible schema migration first: nullable fields/new tables and
   nullable Payment relation. No historical login backfill.
2. Deploy login/entitlement/server code next. Existing billed behavior stays
   unchanged when grant is null.
3. Deploy Users UI last. Missing login data renders `Not recorded`.
4. Rollback before UI is safe after migration because new fields are nullable;
   never roll back by dropping the migration or resetting production data.
5. Log named failures for login activity, invalid admin mutation, stale cursor,
   and blocked deletion without logging email, token, task, or payment content.

## Done conditions

- [ ] Admin navigation includes Users; non-admins cannot navigate, query, or
      mutate this surface.
- [ ] Overview signup/activity tiles link to correctly filtered/sorted Users
      views for 7d, 30d, and all ranges.
- [ ] Directory search, filters, sorts, cursor paging, empty state, exact
      timestamps, and mobile horizontal scrolling work from URL state.
- [ ] Every row shows access, signup, login, active, compact activity, and
      completed-task 7d/30d metrics with documented meanings.
- [ ] New successful magic and built-in authentication paths record login data;
      legacy accounts never receive fabricated login history.
- [ ] Friend has unlimited access, is visually distinct from Founder, and
      never affects Founding 100 count or Stripe/payment history.
- [ ] Pro and Founder manual grants are reversible, do not forge Stripe state,
      and central entitlement checks honor them consistently.
- [ ] Every grant/removal/deletion either changes data and writes one audit row
      atomically or changes nothing.
- [ ] Deletion rejects self, admin targets, bad confirmation, and active
  recurring billing or unavailable subscription check; an eligible deletion removes local account data while
      retaining detached payment audit records.
- [ ] Focused unit tests, admin page tests, authorization tests, relevant
      browser tests, and `cd webapp && ./scripts/wasp-safe.sh compile` pass.
- [ ] Feature catalog reflects implementation truth after code lands. This
      spec must remain `draft`/`ready` until that evidence exists.

## Non-goals

- No public user directory, CRM, notes, assignments, messages, or bulk actions.
- No new admin roles, impersonation, password reset, or external Stripe action.
- No admin CLI user-management command in v1.
- No task/inbox text, provider data, credentials, IP address, or session replay
  in the directory or audit ledger.
- No change to task ranking, user-facing navigation, public roadmap, pricing,
  or Stripe billing policy.

## Documentation cascade

- This spec is the future-work contract.
- `docs/features/admin-user-management.md` records that it is not yet in code.
- When implementation lands, update `docs/features/admin-workspace.md`,
  `docs/features/entitlements.md`, `docs/features/auth.md`, and
  `docs/features/billing.md` only for code-verified behavior.
- Do **not** add future admin work to `docs/ROADMAP.md` or public roadmap
  surfaces, per repository rule.
