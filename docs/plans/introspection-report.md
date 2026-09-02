# F4a — Introspection report: `actionamp_dev` → Drizzle schema

Date: 2026-09-01 · Goal: F4a (platform switch) · Method: `drizzle-kit pull`
(read-only) from `packages/domain`, plus `information_schema` / `pg_catalog`
queries via psql. Zero writes to the database.

---

## 1. Decision recorded: where the schema lives

The goal-set doc (`2026-08-31-platform-switch-goals.md` F4a) says
`apps/api/db/schema/`. That predates the v3 architecture, whose layer map is
explicit: `apps/api` "calls ONLY packages/domain for logic", and Drizzle sits
inside `packages/domain` → PostgreSQL. F4b likewise says
`packages/domain/db/`. **Decision: the introspected schema lives at
`packages/domain/src/db/schema/`** (single `index.ts` with tables + enums,
`relations.ts` with the relation graph), re-exported through the package
export `@actionamp/domain/db` (`src/db/index.ts`). `apps/api` never imports
Drizzle directly.

## 2. Artifacts

| Path | What it is |
|---|---|
| `packages/domain/drizzle.config.ts` | dialect postgresql, schema `./src/db/schema/index.ts`, out `./drizzle`, `DATABASE_URL` with local default |
| `packages/domain/src/db/schema/index.ts` | **the schema** — 31 tables, 14 enums, all 44 indexes, 39 FKs. Generated, then hand-fixed for `bytea` (§7) |
| `packages/domain/src/db/schema/relations.ts` | generated relation graph (28 `*Relations` exports), import path fixed |
| `packages/domain/src/db/index.ts` | barrel re-exporting both |
| `packages/domain/drizzle/0000_early_runaways.sql` + `drizzle/meta/` | introspection baseline (journal + snapshot) — the anchor for future `drizzle-kit generate` diffs |

Regenerate with `cd packages/domain && bun run db:introspect`. Note: pull
writes fresh output to `drizzle/schema.ts` / `drizzle/relations.ts`; the copy
in `src/db/schema/` is the curated one — reconcile manually and re-apply the
bytea fix (a pure regen will always differ by that fix, relevant to the planned
drift-check script).

## 3. Inventory match: DB ↔ `webapp/schema.prisma`

31 tables in `public`:

- **26 app models** (everything in `webapp/schema.prisma`): User,
  MagicLoginChallenge, PushSubscription, Payment, LoginEvent, AdminUserAction,
  Lens, ListItem, ListItemAttachment, Goal, Project, ProjectAttachment, Task,
  TaskAttachment, TaskUpdate, Review, TaskSession, Feedback,
  AnalyticsSession, AnalyticsEvent, Resource, ResourceAttachment, InboxItem,
  InboxAttachment, Tag, ApiKey.
- **5 internals**: `Auth`, `AuthIdentity`, `Session` (Wasp auth — §8),
  `_TagToTask` (Prisma implicit m→m join), `_prisma_migrations` (Prisma
  bookkeeping; introspected as `prismaMigrations`, kept for faithfulness —
  never query it).

**Column-level diff result: every app model's column set matches
schema.prisma exactly — no columns missing on either side.** The DB also has
**zero user triggers**, so nothing behavioral hides in the database: every
"default/magic" behavior lives in the Prisma client or app code. (Surprise
for future readers: root `AGENTS.md`'s model list is stale — it omits
ListItem, the four attachment tables, Review, analytics, LoginEvent,
AdminUserAction, manual grant columns. `schema.prisma` + this introspection
are the truth.)

## 4. THE AUDIT — defaults that live only in the Prisma client

These are the values `packages/domain` **must supply on insert** (Drizzle
sees no DB default for them). The DB has no default on **any** `id` column
and no default/trigger on **any** `updatedAt` column.

### 4.1 UUID primary keys — 25 tables

`@default(uuid())` is client-evaluated by Prisma; the DB default is absent.
Confirmed live data is plain uuid v4 (`594d876d-…`). Domain obligation:
`crypto.randomUUID()` on every insert.

User, Lens, Goal, Project, Task, Resource, InboxItem, InboxAttachment, Tag,
Payment, PushSubscription, ApiKey, Feedback, TaskUpdate, TaskSession, Review,
AnalyticsSession, AnalyticsEvent, LoginEvent, AdminUserAction, ListItem,
ListItemAttachment, ProjectAttachment, TaskAttachment, ResourceAttachment.

Same obligation, different source (no Prisma default either — app code mints
them today):

| Table.column | Minted today by |
|---|---|
| `MagicLoginChallenge.id` | `randomUUID()` in `webapp/src/auth/magicLogin.ts` |
| `Auth.id` / `Session.id` / `AuthIdentity` PK | Wasp auth internals (F10's job to mint) |

### 4.2 `@updatedAt` — 6 columns, no DB default, no trigger

Prisma sets these at create **and re-stamps on every update**. The domain
write layer must do both, or staleness bugs follow.

| Table.column | Product note |
|---|---|
| `Task.updatedAt` | **ordering-critical**: the Logbook sorts WONT_DO declines "most recently declined first" on this column — the only record of when a task was declined |
| `Feedback.updatedAt` | triage-state changes |
| `PushSubscription.updatedAt` | |
| `ListItem.updatedAt` | |
| `Review.updatedAt` | |
| `AnalyticsSession.lastSeenAt` | `@updatedAt` on a non-`updatedAt`-named column — easy to miss in a grep for "updatedAt" |

### 4.3 App-minted required values (no default anywhere, NOT NULL on insert)

Not technically "defaults", but the Prisma-era app supplies them at create
and the domain layer inherits the job:

| Column(s) | Minting rule |
|---|---|
| `Feedback.shortId` | Crockford base32 `XXXX-XXXX`, unique, **collision-retried** (`webapp/src/shared/shortId.ts`; feedback core retries on conflict) |
| `Task/Project/Goal.permalink` | slug of the name + numeric suffix on collision (`webapp/src/shared/permalinks.ts` → `uniquePermalink`); NOT NULL + `@@unique([userId, permalink])` |
| `ApiKey.hashedToken` | SHA-256 hex of the plaintext PAT — lookup happens by re-hashing, so determinism is load-bearing (see `webapp/src/auth/pat.ts`) |
| `MagicLoginChallenge.codeHash` / `tokenHash` | SHA-256 of raw code/link-token; `expiresAt` app-computed |

### 4.4 DB-backed defaults — safe to omit on Drizzle inserts

All of these exist as real DB defaults (59 columns introspected), so the
domain layer may omit them. Note two Prisma-parity nuances: `CURRENT_TIMESTAMP`
uses the DB clock and is pinned at transaction start (Prisma's client-side
`now()` uses the app clock — practically identical); and Prisma would still
send these on create, so behavior is unchanged either way.

**Timestamps `CURRENT_TIMESTAMP` (26):** `createdAt` on AdminUserAction,
AnalyticsSession, ApiKey, Feedback, Goal, InboxAttachment, InboxItem, Lens,
ListItem, ListItemAttachment, LoginEvent, MagicLoginChallenge, Payment,
Project, ProjectAttachment, PushSubscription, Resource, ResourceAttachment,
Review, Task, TaskAttachment, TaskUpdate, User (23) — plus
`AnalyticsEvent.occurredAt`, `AnalyticsSession.firstSeenAt`,
`TaskSession.startedAt`.

**Booleans (14):** false → Goal.isDone, Lens.isDefault, Lens.isIncluded,
ListItem.isDone, Project.isDone, Task.isDone, Task.isOnboardingSample,
TaskSession.completed, User.hasSeenOnboarding, User.isAdmin,
User.dailyReminderEnabled; true → User.todayReviewEnabled,
User.weekReviewEnabled, User.monthReviewEnabled.

**Integers (6):** 0 → ListItem.order, MagicLoginChallenge.attempts,
Project.order, Task.order; 5 → User.todayCap; 25 → User.focusSessionMinutes.

**Strings (3):** `'09:00'` User.dailyReminderTime, `'UTC'`
User.dailyReminderTimeZone, `'usd'` Payment.currency.

**Enums (10):** Task.status `'SOMEDAY'`, Task.priority `'NORMAL'`, Task.size
`'M'`, Project.type `'STANDARD'`, TaskUpdate.kind `'NOTE'`,
InboxItem.status `'UNPROCESSED'`, Feedback.status `'OPEN'`,
Payment.status `'PENDING'`, User.plan `'FREE'`,
User.onboardingStage `'COMPLETE'`.

### 4.5 DB defaults Prisma's app schema does NOT know about

- `AuthIdentity.providerData` — `DEFAULT '{}'::text` (comes from Wasp's
  generated internal schema, not `webapp/schema.prisma`).
- `_prisma_migrations.startedAt` — `DEFAULT now()` (bookkeeping table).
- `_prisma_migrations.applied_steps_count` — `DEFAULT 0` (bookkeeping table;
  cross-review addition — brings the DB default total to 62: 59 §4.4 + 3 here).

### 4.6 Json / nulls

No surprises: `Review.answers` is NOT NULL with **no default** (caller must
supply the JSON document); `Review.snapshot` and `AnalyticsEvent.metadata`
are nullable jsonb. Prisma applies no implicit null default anywhere.

## 5. Constraints Drizzle code must replicate

Already encoded in the generated schema (`uniqueIndex` / `foreignKey` entries
survive introspection verbatim). Listed here because the domain layer must
not regress them:

**Unique (beyond PKs):** `AnalyticsSession.visitorId`;
`ApiKey.hashedToken`; `Auth.userId` (Wasp); `Feedback.shortId`;
`Goal(userId,name)` + `Goal(userId,permalink)`; `Lens(userId,name)`;
`MagicLoginChallenge.tokenHash`; `Payment.stripePaymentIntentId` +
`Payment.stripeInvoiceId` (both nullable-uniques — Postgres allows multiple
NULLs; `stripeCheckoutSessionId` is **not** unique); `Project(userId,permalink)`;
`PushSubscription.endpoint`; `Review(userId,cadence,periodStart)`;
`Session.id` (redundant with its PK — Wasp artifact); `Tag(userId,name)`;
`Task(userId,permalink)`; `_TagToTask(A,B)`.

**FK `onDelete` inventory (39 FKs, all `ON UPDATE CASCADE`):**
- **CASCADE (33)** — everything user-owned dies with the user: Lens, Goal,
  Project, Task, Resource, InboxItem, Tag, Feedback, PushSubscription, ApiKey,
  TaskUpdate, TaskSession, Review, ListItem, LoginEvent, Auth; plus content
  chains: Goal→Lens, Project→Lens, Task→Lens, Resource→Project, all five
  attachment tables→their parent, TaskUpdate→Task, TaskSession→Task,
  AnalyticsEvent→AnalyticsSession, AuthIdentity→Auth, Session→Auth,
  `_TagToTask` A/B.
- **SET NULL (6)** — `Payment.userId` (payments **detach, not delete**, when
  a user is erased — Stripe audit trail), `Project.goalId`, `Task.projectId`,
  `Task.goalId`, `AnalyticsSession.userId`, `AnalyticsEvent.userId`.

**Composite indexes (44 total)** — all carried into the schema verbatim
(e.g. `Task(userId, createdAt)`, `MagicLoginChallenge(expiresAt)`,
`AnalyticsEvent(name, occurredAt)`, `User(lastActiveAt)`).

## 6. Type mapping notes (for F4b)

- Prisma `DateTime` → `timestamp(3) without time zone`. Exception:
  `Task.snoozedUntil` and `InboxItem.parsedSnoozedUntil` are
  `timestamptz(3)` (`@db.Timestamptz(3)`).
- `@db.Date` → `date`: `Task.scheduledDate`, `Project.dueDate`,
  `InboxItem.parsedScheduledDate`.
- `InboxItem.parsedTags` → `text[]`.
- `drizzle-kit pull` emits every timestamp as `mode: 'string'`. The ported
  operationsCores pass and read JS `Date` objects (Prisma semantics), so F4b
  should decide between switching the columns to `mode: 'date'` (recommended
  for parity) or converting at the seam. Left as generated to keep this
  baseline faithful.
- `Bytes` → `bytea`: see §7.

## 7. Hand-fix applied to generated output: `bytea`

drizzle-kit (0.31.x) cannot introspect `bytea`: it emitted
`data: unknown("data").notNull()` — with `unknown` not even imported, i.e.
non-compiling output — for all five attachment tables (InboxAttachment,
TaskAttachment, ProjectAttachment, ListItemAttachment, ResourceAttachment).
Fixed with a `customType` bound to `Uint8Array` (Prisma's `Bytes` maps to
`Uint8Array`; `Buffer` is a `Uint8Array` subclass at runtime). This is the
only semantic edit to the generated file.

## 8. Wasp auth tables — shape summary (input for F10)

- **`Auth`** — `id` text PK; `userId` text **nullable**, UNIQUE; FK →
  `User(id)` ON DELETE CASCADE. One auth record per user; no timestamps.
- **`AuthIdentity`** — PK `(providerName, providerUserId)`;
  `providerData` text NOT NULL DEFAULT `'{}'`; `authId` FK → `Auth(id)`
  CASCADE. Provider identities (email / google). (Known drizzle-kit pull
  quirk, cross-review note: the generated schema + snapshot record this
  composite PK's columns reversed — `(providerUserId, providerName)`. The DB
  constraint is as stated here. Benign for equality/uniqueness; do not
  "fix" the generated file — a regen will reproduce the same reversal.)
- **`Session`** — `id` text PK (this is the cookie value Wasp validates
  against); `expiresAt` timestamp(3) NOT NULL; `userId` FK → `Auth(id)`
  CASCADE. No createdAt/updatedAt columns. Redundant `Session_id_key`
  UNIQUE index on the PK.

Session validation (M1) therefore reads: cookie → `Session.id` → check
`expiresAt` → `userId` here is an **Auth** id, joined via `Auth.userId` to
`User`. CLI PATs are separate: `Authorization: Bearer aa_…` → SHA-256 →
`ApiKey.hashedToken` lookup (F10 must re-implement the deterministic
re-hash lookup).

## 9. Verification

- `packages/domain`: `bunx tsc --noEmit` — green.
- Runtime import smoke (bun): all 31 table exports + 28 relations load (the
  generated file's forward references, e.g. `ApiKey`'s FK → `user` declared
  later, resolve fine — drizzle evaluates them lazily).
- `bunx oxlint packages/domain` — 0 warnings, 0 errors.
- Column-set diff script (schema.prisma ↔ information_schema) —
  "ALL COLUMN SETS MATCH" (§3).
