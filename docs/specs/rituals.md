---
feature: rituals
status: draft
spec_owner: discover
build_owner: build
kind: spec
---

# Feature: Rituals (the habits layer)

> Implements the roadmap's `habits-recurring-activities` item (docs/ROADMAP.md
> §Then 8). Discovery completed 2026-09-15; the four open questions were
> answered by Jake that day (decisions below). Renames the roadmap item from
> "habits" to **Rituals** — "habits" carries streak-app connotations the brand
> bans (`PRODUCT.md` anti-references); Rituals is calm-premium vocabulary.

## Confirmed decisions (2026-09-15)

- **Name: Rituals.** Everywhere — entity, route, nav, copy.
- **Pro-only.** FREE users never touch rituals; no free-tier count. Active
  paid plans only (`isPlanActive`: PRO while `planRenewsAt` is future,
  FOUNDER lifetime). Downgrade preserves data losslessly and gates ops.
- **The daily push reminder mentions due rituals** — one calm line, only when
  at least one is due, riding the existing once-per-user-day reminder.
- **No task-level recurrence.** Rituals is the product's one recurrence
  concept; a "Repeats" property on Task is a recorded non-goal with a revisit
  trigger (see Non-goals).

## Thesis

Rituals are the things that shouldn't need a decision — medication, water,
the morning walk, the weekly review of finances. The product's whole thesis
is optimizing the decision; rhythms are the category of work where the
decision is the problem. So rituals get their own lightweight layer with
check-off semantics, deliberately excluded from the task machinery, and their
only doing-surface is a quiet strip on Today that never competes with the
day's commitments.

This mirrors the ListItem precedent: the schema already knows how to say
"this kind of thing does not flow through the focus engine." Rituals apply
that isolation to recurrence.

## Target architecture

### Entity model

- **`Ritual`** — lens-scoped like every structured entity.
  `id, userId, lensId, name, cadence, weekday, intervalDays, timeOfDay,
  goalId, order, pausedAt, archivedAt, createdAt, updatedAt`.
  - `cadence: RitualCadence` enum: `DAILY | WEEKDAYS | WEEKLY | INTERVAL`.
    `WEEKDAYS` = Mon–Fri. `WEEKLY` uses `weekday` (0–6, ISO order). `INTERVAL`
    uses `intervalDays` (2–365); the phase anchor is the ritual's creation
    local date (stable, documented, not user-facing).
  - `timeOfDay: RitualTimeOfDay` enum: `MORNING | ANYTIME | EVENING`
    (default `ANYTIME`). Ordering hint for the strip, nothing more — no
    reminders per bucket, no time enforcement.
  - `goalId` nullable — the "why at all" link. Goal delete sets null
    (`onDelete: set null`); it never blocks goal lifecycle.
  - `pausedAt` / `archivedAt` nullable timestamps. Pause hides a ritual from
    due-ness without touching history; archive retires it (history stays for
    review evidence; the row leaves the Planning page's active list).
  - Lens delete follows the task pattern: hard delete cascades, reassign
    moves. No RRULE, ever — four cadence shapes cover the honest cases.
- **`RitualEntry`** — one row per checked day:
  `id, ritualId, userId, localDate (DATE), createdAt`. Unique
  `(ritualId, localDate)`; index `(userId, localDate)` for review queries.
  `localDate` is the user's calendar day in their persisted IANA
  `timeZone` at check time (the locked date-model primitive). Unchecking
  deletes the row (ListItem's uncheck-restores semantics).

**Due-ness is derived, never stored.** `isDueOn(ritual, date)` is a pure
function of cadence + fields; "today's rituals" = the lens-accessible,
unpaused, unarchived set filtered by it, joined against entries for checked
state. No "next occurrence" column, no materialization job, nothing to go
stale — the same lazy stance as the Today rollover, the daily reminder, and
review cadences. Missing a day writes nothing: a missed ritual is simply
absent.

### Surfaces

1. **Today strip** (the only doing-surface). A quiet "Rituals" section on the
   Today page — universal like Today, each row with its lens pill. Rows
   order morning → anytime → evening, then `order`. One tap on the
   CompletionCircle checks/unchecks. Checked rows stay visible (quietly)
   until the local day ends, then reset by derivation. **Outside `todayCap`
   by construction** — rhythms never consume commitment slots. The section
   renders nothing when no ritual is due.
2. **Planning page** (`/rituals`). Lens-scoped management like Projects:
   inline create, edit (name, cadence, time-of-day, goal link), pause,
   archive. Rows show a cadence chip and the goal attribution when linked.
   ProGate'd for FREE. Nav: Plan group gains Rituals; command palette gains
   the route command.
3. **What Now: never.** Rituals are not Next candidates, never ranked, no
   matcher changes, no focus mode, no `TaskSession`.
4. **Review evidence** (separate work part, gated on the reviews-hub port).
   Week/Month reviews gain a calm backward-looking block: which rituals
   happened on which days, plain day lists or quiet dot rows. Never
   percentages, scores, streak counts, or any forward-looking pressure.
5. **Push.** `buildReminderBody` gains a rituals line when `ritualsDue > 0`,
  e.g. `Today: draft spec, call dentist (+1 more) · 2 rituals due`. Exact
  copy at build time under the tone rules (no exclamation marks, no guilt).

### Entitlements

- Every ritual op (create, update, toggle, pause, archive) requires an active
  paid plan. Contract fragments declare `oc.errors(ProGateErrorMap)` — the
  established pattern; the API guard maps to 402 `PAYMENT_REQUIRED`.
- FREE: `/rituals` shows ProGate, the Today strip is hidden, ops 402. A
  downgraded user's data is preserved losslessly and reappears if they pay
  again. No deletion on downgrade, ever.
- No count cap for Pro in v1 — rituals are everyday entities (the
  projects/tasks "unlimited" stance); revisit only if a real abuse ceiling
  appears.

### Creation paths

Direct create on the Planning page only. **Triage and capture are not
ritual destinations in v1** — the wizard keeps its five outcomes, the
grammar keeps its sigils. Rituals are structure you choose deliberately,
not inflow to process.

## Work parts (commit-sized, in order)

### 1. Docs first — `docs/WORKFLOW.md` (canonical, per repo rules)

§2.3 Today strip bullet, §2.4 Planning bullet, §2.5 review-evidence note,
§5.14 decision entry, §6 cascade line. (Lands with this spec.)

### 2. Schema + migration

`packages/domain/src/db/schema/index.ts`: `RitualCadence` + `RitualTimeOfDay`
pgEnums; `Ritual` + `RitualEntry` pgTables in house style (text ids,
`timestamp({ precision: 3 })`, btree indexes, FKs `onUpdate/onDelete
cascade` for user/lens/ritual, `set null` for goal). Migration: new numbered
SQL file in `packages/domain/drizzle/` (create enums, tables, indexes).
Verify against the dev DB.

### 3. Domain core — `packages/domain/src/rituals/`

`operationsCore.ts` (pure, `(entities, args)` house pattern):
`getRitualsData` (lens-scoped list + entry state for today), `createRitualCore`
(name validation per the cleanName set), `updateRitualCore`, `toggleRitualCore`
(idempotent insert/delete keyed on the unique constraint),
`setRitualPausedCore`, `archiveRitualCore`. `isDueOn` + localDate derivation
live in the core (or `shared/time`), reused by api + push. Entities via a
feature `entities.ts` (the `simpleLists` precedent). `index.ts` barrel.
Vitest: due-ness derivation across all four cadences + timezone edges,
toggle idempotency, entitlement guard, lens-accessibility on the read.

### 4. Contract — `packages/contract/src/rituals.ts`

`ritualsContract = { list, create, update, toggle, setPaused, archive }`
with `ProGateErrorMap`; schemas mirror the domain DTOs 1:1 (dates as ISO
strings). Composition lines in `packages/contract/src/router.ts` + `index.ts`.

### 5. API — `api/src/procedures/rituals.ts`

`implement(ritualsContract).$context<ApiContext>()`; per op `requireUser`
→ `isPlanActive` (402) → `assertLensAllowed` → core call → DTO map →
`toOrpcError`. One line in `api/src/router.ts`.

### 6. Web

`stores/rituals.svelte.ts` (DTO interfaces mirroring the contract, loads on
lens change); `components/rituals/RitualsView.svelte` (Planning page);
`components/rituals/RitualStrip.svelte` (consumed by the Today view);
`routes/rituals/+page.svelte` (thin host); `styles/rituals.css`. Shell Plan
group gains the Rituals link; palette registry gains the route command.
Primitives only (`GroupedList`, `ListEmpty`, `Chip`, `CompletionCircle`,
`ProGate`, `Button`, `PickerSheet` for cadence/time-of-day/goal pickers).
Row interaction mirrors task rows: focusable, Enter/Space toggles. New
visual values → `tokens.css` first (there should be none).

### 7. Push

`api/src/reminder.ts` + `push.ts`: a `ritualsDueToday(userId)` dep beside
`todayTasks`; `buildReminderBody` (domain/notifications) gains the rituals
line, omitted at zero. Unit tests for body composition both ways.

### 8. Review evidence — separate, gated

Lands with the reviews-hub port (`domain/src/reviews/` + oRPC fragment).
Week/Month gain the rituals-happened block per the surface spec above. Not
blocking v1; do not port reviews early just for this.

### 9. Tests + e2e

Domain unit (above) + api fragment tests + web store tests. E2E: create →
due on Today strip (outside cap) → check → uncheck → pause hides → FREE
account hits ProGate/402 → downgrade path preserves rows.

### 10. Doc cascade finish

`docs/DATA-MODEL.md` (Ritual/RitualEntry + enums), `docs/PAGES.md` (route),
`docs/features/rituals.md` (catalog entry, status shipped), `docs/PRICING.md`
(Rituals listed under Pro), `docs/features/pwa-notifications.md` (reminder
line), roadmap §Then entry → done with sign-off link.

## Non-goals / accepted losses

- **No task-level recurrence.** A "Repeats" property on Task (weekly report
  as a Task with notes, outcome, focus sessions) is deliberately not built.
  Rituals cover the rhythm; when the underlying work needs task machinery,
  it is captured as a task when it matters. One recurrence concept in the
  product. **Revisit trigger:** three or more paying users separately ask
  for work-task recurrence — then spec it as its own feature (series
  semantics and all), not as a bolt-on here.
- **No streaks, chains, scores, percentages, badges, red overdue dots, or
  make-up mechanics** — banned vocabulary and banned UI. Evidence looks
  backward only, and only inside cadence reviews.
- **No RRULE.** Four cadences. Custom recurrences are a power feature this
  product's calm budget does not buy.
- **Not a capture or triage destination** in v1. No sigil, no wizard step.
- **No per-bucket reminders or time enforcement** — `timeOfDay` is an
  ordering hint, not an alarm system. The one reminder is the existing
  daily push.
- **No CLI in v1** (`actionamp ritual list/toggle` is a natural follow-up;
  the CLI is already Pro-only).
- Each work part commits separately with `typecheck` + the feature's vitest
  green before the next; WORKFLOW.md lands first per repo rules.
