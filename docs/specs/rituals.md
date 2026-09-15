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
- **Dual mode (added at spec review, same day).** Every Ritual is
  **checkable** (default) or **workable** — real work that enters the normal
  flow as a Task: a due workable Ritual lazily mints one occurrence Task,
  **at most one open occurrence per user at a time**, which becomes a Next
  candidate and can be committed to Today, focused, and completed like any
  Task. Completing it records the day.
- **No task-level recurrence.** Rituals is the product's one recurrence
  concept; a "Repeats" property on Task is a recorded non-goal with a revisit
  trigger (see Non-goals).

## Thesis

Rituals are the things that shouldn't need a decision — medication, water,
the morning walk, the weekly review of finances. The product's whole thesis
is optimizing the decision; rhythms are the category of work where the
decision is the problem. So checkable rituals get their own lightweight
layer with check-off semantics, deliberately excluded from the task
machinery. Workable rituals — the ones that are real work, not a checkbox —
instead ride the existing task flow through a single lazily minted
occurrence Task, so the focus engine, Today commitments, and reviews treat
them exactly like any other work, with zero matcher changes.

This mirrors the ListItem precedent: the schema already knows how to say
"this kind of thing does not flow through the focus engine." Rituals apply
that isolation to recurrence — and carve one deliberate exception for the
workable kind.

## Target architecture

### Entity model

- **`Ritual`** — lens-scoped like every structured entity.
  `id, userId, lensId, name, mode, cadence, weekday, intervalDays, timeOfDay,
  goalId, order, pausedAt, archivedAt, createdAt, updatedAt`.
  - `mode: RitualMode` enum: `CHECK | WORK` (default `CHECK`). CHECK = strip
    semantics below. WORK = the occurrence lifecycle below. Switchable
    anytime; a switch to CHECK (or pause/archive/delete/downgrade) silently
    removes any open occurrence Task first.
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
state. No "next occurrence" column on Ritual, nothing to go stale — the same
lazy stance as the Today rollover, the daily reminder, and review cadences.
Missing a checkable day writes nothing: a missed ritual is simply absent.

### Workable occurrences (the mint lifecycle)

A WORK ritual never touches the matcher, the Today list, or focus mode
directly — it mints one ordinary Task and lets the existing engine do the
rest. The Task is disposable scaffolding; the Ritual is the durable
definition and history.

- **Mint (lazy).** On app load, beside the Today rollover, after reaping:
  if no open occurrence Task exists for the user and at least one WORK
  ritual is due today (unchecked), mint exactly **one** — `status:
  UPCOMING`, `priority: NORMAL`, `title` = ritual name, `lensId` = the
  ritual's lens, linked to the ritual. Candidate selection: time-of-day
  bucket order (morning → anytime → evening), then `order`. UPCOMING, not
  TODAY — the product's rule holds: committing to Today is an explicit
  choice. A minted occurrence is a Next candidate immediately (undated
  tasks surface) and enters Today only by promotion. **No matcher changes,
  no focus-mode changes, no Today changes — the occurrence is
  indistinguishable from a hand-made task.**
- **One at a time (global).** At most one open occurrence Task per user,
  ever. Other due WORK rituals queue behind it and mint as the previous one
  completes, is checked directly, is reaped, or the day ends. Accepted
  loss: a queued ritual can wait behind an unfinished one all day — it can
  be checked off directly on `/rituals` (advancing the queue) or switched
  to CHECK.
- **Reap (no pile, ever).** The same lazy pass removes open occurrence
  Tasks that are no longer owed: ritual paused, archived, deleted,
  downgraded to FREE, switched to CHECK, already checked today, or no
  longer due — yesterday's unfinished occurrence evaporates at the next
  day's pass rather than rolling over. The one carry-over: a daily WORK
  ritual due again today keeps its single open occurrence (it still
  represents today). Removal is silent; nothing renders as failed.
- **Completion.** Completing the occurrence Task (focus mode or anywhere
  completion happens) appends the day's `RitualEntry` alongside the normal
  task-completion records, in the same transaction. The completed Task
  stays in the Logbook as a completed task; the ritual's evidence derives
  from entries.
- **Cap honesty.** A minted occurrence counts toward `todayCap` once
  promoted to Today — it is real committed work, and the cap is a promise
  about commitments. While it rides Next/Upcoming it doesn't touch the cap
  (no task does).
- **Scaffolding semantics.** Edits to the occurrence (priority, size,
  notes, snooze) live and die with that occurrence; the next mint starts
  from defaults. `Task.ritualId` is nullable with `onDelete: set null`, so
  deleting a ritual never destroys completed history — only the reap
  removes open occurrences.

### Surfaces

1. **Today strip** (the checkable doing-surface). A quiet "Rituals" section
   on the Today page — universal like Today, each row with its lens pill.
   **CHECK rituals only**; WORK rituals never appear here. Rows order
   morning → anytime → evening, then `order`. One tap on the
   CompletionCircle checks/unchecks. Checked rows stay visible (quietly)
   until the local day ends, then reset by derivation. **Outside
   `todayCap` by construction** — rhythms never consume commitment slots.
   The section renders nothing when no CHECK ritual is due.
2. **Planning page** (`/rituals`). Lens-scoped management like Projects:
   inline create (name, cadence, time-of-day, mode), edit, pause, archive.
   Mode is a first-class choice — checkable vs workable, in product copy
   that says what each does. Rows show a cadence chip and the goal
   attribution when linked; a WORK row carries a quiet due/queued state
   (plain text, never a badge) and a direct check affordance that records
   the day and reaps any open occurrence. ProGate'd for FREE. Nav: Plan
   group gains Rituals; command palette gains the route command.
3. **What Now: only through the work flow.** CHECK rituals are never Next
   candidates. WORK rituals reach the What Now stage exclusively as their
   minted occurrence Task — an ordinary candidate the existing engine
   ranks with everything else. The why-line may state it plainly ("Your
   ritual — due today"), honest and omit-when-empty.
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

`packages/domain/src/db/schema/index.ts`: `RitualCadence` +
`RitualTimeOfDay` + `RitualMode` pgEnums; `Ritual` + `RitualEntry`
pgTables in house style (text ids, `timestamp({ precision: 3 })`, btree
indexes, FKs `onUpdate/onDelete cascade` for user/lens/ritual, `set null`
for goal). `Task.ritualId` nullable text + FK `onDelete: set null`
(deleting a ritual orphans completed history safely; the reap owns open
occurrences). Migration: new numbered SQL file in
`packages/domain/drizzle/` (create enums, tables, columns, indexes).
Verify against the dev DB.

### 3. Domain core — `packages/domain/src/rituals/`

`operationsCore.ts` (pure, `(entities, args)` house pattern):
`getRitualsData` (lens-scoped list + entry state for today), `createRitualCore`
(name validation per the cleanName set), `updateRitualCore`, `toggleRitualCore`
(idempotent insert/delete keyed on the unique constraint; also reaps the
ritual's open occurrence when a WORK day is checked directly),
`setRitualModeCore` (reaps on WORK→CHECK), `setRitualPausedCore`,
`archiveRitualCore`. `reconcileRitualOccurrencesCore` — the reap-then-mint
pass, called from `getAppDataCore` beside the Today rollover (idempotent
per day via the same user-day stamp). The task-completion core appends the
day's `RitualEntry` in-transaction when the completed task carries a
`ritualId`. `isDueOn` + localDate derivation live in the core (or
`shared/time`), reused by api + push. Entities via a feature `entities.ts`
(the `simpleLists` precedent). `index.ts` barrel. Vitest: due-ness
derivation across all four cadences + timezone edges, toggle idempotency,
the full mint lifecycle (one-at-a-time, queue advance, daily carry-over,
evaporation of yesterday's occurrence, reap on pause/archive/switch/
downgrade, completion appends the entry), entitlement guard,
lens-accessibility on the read.

### 4. Contract — `packages/contract/src/rituals.ts`

`ritualsContract = { list, create, update, toggle, setMode, setPaused,
archive }`
with `ProGateErrorMap`; schemas mirror the domain DTOs 1:1 (dates as ISO
strings). Composition lines in `packages/contract/src/router.ts` + `index.ts`.

### 5. API — `api/src/procedures/rituals.ts`

`implement(ritualsContract).$context<ApiContext>()`; per op `requireUser`
→ `isPlanActive` (402) → `assertLensAllowed` → core call → DTO map →
`toOrpcError`. One line in `api/src/router.ts`.

### 6. Web

`stores/rituals.svelte.ts` (DTO interfaces mirroring the contract, loads on
lens change); `components/rituals/RitualsView.svelte` (Planning page);
`components/rituals/RitualStrip.svelte` (consumed by the Today view, CHECK
rows only); `routes/rituals/+page.svelte` (thin host); `styles/rituals.css`.
Shell Plan group gains the Rituals link; palette registry gains the route
command. The create/edit form carries the mode choice (checkable vs
workable) with plain-language copy; WORK rows show due/queued state and the
direct check affordance. Primitives only (`GroupedList`, `ListEmpty`,
`Chip`, `CompletionCircle`, `ProGate`, `Button`, `PickerSheet` for
mode/cadence/time-of-day/goal pickers). Row interaction mirrors task rows:
focusable, Enter/Space toggles. New visual values → `tokens.css` first
(there should be none).

### 7. Push

`api/src/reminder.ts` + `push.ts`: a `ritualsDueToday(userId)` dep beside
`todayTasks`; `buildReminderBody` (domain/notifications) gains the rituals
line, omitted at zero. Unit tests for body composition both ways.

### 8. Review evidence — separate, gated

Lands with the reviews-hub port (`domain/src/reviews/` + oRPC fragment).
Week/Month gain the rituals-happened block per the surface spec above. Not
blocking v1; do not port reviews early just for this.

### 9. Tests + e2e

Domain unit (above) + api fragment tests + web store tests. E2E covers both
modes: CHECK — create → due on Today strip (outside cap) → check → uncheck
→ pause hides. WORK — create → occurrence mints and appears as a Next
candidate → promote to Today (occupies a cap slot) → complete from focus →
entry recorded; second due WORK ritual stays queued until the first
resolves; yesterday's unfinished occurrence is gone after the next day's
load; direct check on `/rituals` advances the queue. FREE account hits
ProGate/402; downgrade path preserves rows and reaps open occurrences.

### 10. Doc cascade finish

`docs/DATA-MODEL.md` (Ritual/RitualEntry + enums), `docs/PAGES.md` (route),
`docs/features/rituals.md` (catalog entry, status shipped), `docs/PRICING.md`
(Rituals listed under Pro), `docs/features/pwa-notifications.md` (reminder
line), roadmap §Then entry → done with sign-off link.

## Non-goals / accepted losses

- **No user-facing task recurrence.** Dual mode covers the work case — a
  workable ritual *is* the "weekly report with notes and focus sessions."
  What stays banned is recurrence on user-created Tasks: no "Repeats"
  control on tasks, no series semantics in the task flow. Only the Ritual
  layer mints occurrence Tasks. **Revisit trigger:** three or more paying
  users separately ask for recurrence on ad-hoc tasks — then spec it as its
  own feature, not as a bolt-on here.
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
