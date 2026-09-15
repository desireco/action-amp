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
- **Check-off only (settled after a same-day reversal).** A dual
  check/work mode was specced and then reversed on reflection: a Ritual's
  entire interaction is checking it off in Today's Rituals section. No
  working on it, no Next candidacy, no focus mode, no minted Tasks. The
  reversal is recorded in WORKFLOW.md §5.14; the reversed design lives in
  this spec's git history.
- **Daily intervals.** Every Ritual is assigned to one of three daily
  intervals — **morning, midday, evening** — and Today's Rituals section
  groups by them (morning → midday → evening).
- **Rituals start in a context, defaulting to Me.** Lens-scoped like every
  structured entity; creation defaults the lens to Me (the seeded personal
  lens), changeable in the form.
- **Completion asks how it went (same day).** Checking a Ritual confirms
  through a small modal — "How did it go?" — answered with one of three
  moods (happy / neutral / negative) plus an optional note. The mood is
  the confirm; the note rides along. Unchecking stays one quiet tap.
- **No task-level recurrence.** Rituals is the product's one recurrence
  concept; a "Repeats" property on Task is a recorded non-goal with a revisit
  trigger (see Non-goals).

## Thesis

Rituals are the things that shouldn't need a decision — medication, water,
the morning walk, the weekly review of finances. The product's whole thesis
is optimizing the decision; rhythms are the category of work where the
decision is the problem. So rituals get their own lightweight layer with
check-off semantics, deliberately excluded from the task machinery: you
check them off in Today's Rituals section, and that is all. When the
underlying work needs task machinery, it is captured as a task when it
matters.

This mirrors the ListItem precedent: the schema already knows how to say
"this kind of thing does not flow through the focus engine." Rituals apply
that isolation to recurrence.

## Target architecture

### Entity model

- **`Ritual`** — lens-scoped like every structured entity.
  `id, userId, lensId, name, interval, cadence, weekday, intervalDays,
  goalId, order, pausedAt, archivedAt, createdAt, updatedAt`.
  - `interval: RitualInterval` enum: `MORNING | MIDDAY | EVENING`
    (required, default `MORNING`). The daily slot the Ritual belongs to —
    Today's section groups by it, morning → midday → evening. It is an
    assignment and a grouping, not an alarm: no per-interval reminders, no
    time enforcement, no reveal-by-clock.
  - `cadence: RitualCadence` enum: `DAILY | WEEKDAYS | WEEKLY | INTERVAL`.
    `WEEKDAYS` = Mon–Fri. `WEEKLY` uses `weekday` (0–6, ISO order). `INTERVAL`
    uses `intervalDays` (2–365); the phase anchor is the ritual's creation
    local date (stable, documented, not user-facing).
  - `goalId` nullable — the "why at all" link. Goal delete sets null
    (`onDelete: set null`); it never blocks goal lifecycle.
  - `pausedAt` / `archivedAt` nullable timestamps. Pause hides a ritual from
    due-ness without touching history; archive retires it (history stays for
    review evidence; the row leaves the Planning page's active list).
  - Lens delete follows the task pattern: hard delete cascades, reassign
    moves. No RRULE, ever — four cadence shapes cover the honest cases.
- **`RitualEntry`** — one row per checked day:
  `id, ritualId, userId, localDate (DATE), mood, note, createdAt`. Unique
  `(ritualId, localDate)`; index `(userId, localDate)` for review queries.
  `localDate` is the user's calendar day in their persisted IANA
  `timeZone` at check time (the locked date-model primitive). `mood` is
  `RitualMood` (`HAPPY | NEUTRAL | NEGATIVE`, required — the reflection
  modal collects it); `note` is optional trimmed text. Unchecking deletes
  the row, reflection included (ListItem's uncheck-restores semantics);
  re-checking asks again.

**Due-ness is derived, never stored.** `isDueOn(ritual, date)` is a pure
function of cadence + fields; "today's rituals" = the lens-accessible,
unpaused, unarchived set filtered by it, joined against entries for checked
state. No "next occurrence" column, no materialization job, nothing to go
stale — the same lazy stance as the Today rollover, the daily reminder, and
review cadences. Missing a day writes nothing: a missed ritual is simply
absent.

### Surfaces

1. **Today section (the only doing-surface).** A quiet "Rituals" section on
   the Today page — universal like Today, each row with its lens pill.
   Rows group by interval — morning → midday → evening — then `order`; a
   group with nothing due renders nothing. Tapping the CompletionCircle on
   an unchecked row opens the completion reflection (below); confirming
   checks it. Unchecking a checked row is one direct tap, no modal — the
   entry and its reflection are deleted, re-checking asks again. Tapping a
   checked row reopens the reflection for view/edit. Checked rows stay
   visible (quietly, with a small neutral mood glyph) until the local day
   ends, then reset by derivation. **Outside `todayCap` by construction** —
   rhythms never consume commitment slots. The section renders nothing
   when no ritual is due.
2. **Planning page** (`/rituals`). Lens-scoped management like Projects:
   inline create (name, interval, cadence), edit, pause, archive. Creation
   defaults the lens to **Me** — rituals are mostly personal — changeable
   in the form; the page itself stays lens-scoped. Rows show an interval
   label and a cadence chip; the goal attribution appears when linked. No
   check-off here — checking happens in Today. ProGate'd for FREE. Nav:
   Plan group gains Rituals; command palette gains the route command.
3. **What Now: never.** Rituals are not Next candidates, never ranked, no
   focus mode, no `TaskSession`. The work flow is untouched.
4. **Review evidence** (separate work part, gated on the reviews-hub port).
   Week/Month reviews gain a calm backward-looking block: which rituals
   happened on which days, each occurrence with its mood glyph and trimmed
   note as recorded — plain day lists or quiet dot rows. Never averages,
   percentages, scores, streak counts, or any forward-looking pressure.
5. **Push.** `buildReminderBody` gains a rituals line when `ritualsDue > 0`,
  e.g. `Today: draft spec, call dentist (+1 more) · 2 rituals due`. Exact
  copy at build time under the tone rules (no exclamation marks, no guilt).

### The completion reflection

Checking a Ritual is a two-beat moment: confirm + a small honest "how did
it go?" — the same reflective instinct as focus mode's optional Outcome and
the review check-ins, applied at ritual scale.

- **The modal** (the existing confirm-dialog overlay pattern,
  INTERACTION.md §9.4): ritual name, "How did it go?", three mood choices
  — happy / neutral / negative — and an optional note field. Keyboard:
  `1/2/3` pick the mood, the note field takes free text, `Enter` commits,
  `Esc` cancels (nothing checked, nothing recorded). A mood is required to
  commit — picking it is the confirm. Button copy at build time under the
  tone rules ("Good / Okay / Rough" is the current lean; the enum stays
  `HAPPY | NEUTRAL | NEGATIVE`).
- **Edit after the fact.** Tapping a checked row reopens the same modal
  over the saved entry — mood and note editable, saved on commit.
- **Calm guarantees.** Moods are plain facts, never judgment: no averages,
  percentages, trend arrows, or "you've been negative" copy anywhere —
  review evidence shows each occurrence's mood glyph (and trimmed note) as
  recorded, and nothing else. Mood glyphs render neutral and uncolored —
  never teal/amber/red, which carry reserved meaning.
- **Accepted cost:** a morning routine of six rituals is six reflections.
  The modal is keyboard-fast (two beats: `2`, `Enter`) and `Esc` is cheap;
  the reflection is the point, not overhead to optimize away.

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
`RitualInterval` + `RitualMood` pgEnums; `Ritual` + `RitualEntry`
pgTables in house style (text ids, `timestamp({ precision: 3 })`, btree
indexes, FKs `onUpdate/onDelete cascade` for user/lens/ritual, `set null`
for goal). Migration: new numbered SQL file in `packages/domain/drizzle/`
(create enums, tables, indexes). Verify against the dev DB.

### 3. Domain core — `packages/domain/src/rituals/`

`operationsCore.ts` (pure, `(entities, args)` house pattern):
`getRitualsData` (lens-scoped list + entry state for today),
`createRitualCore` (name validation per the cleanName set; lens defaults to
Me), `updateRitualCore`, `completeRitualCore` (idempotent upsert keyed on
the unique constraint; requires a mood, accepts an optional note),
`uncheckRitualCore` (deletes the entry and its reflection),
`updateReflectionCore` (edit the saved mood/note), `setRitualPausedCore`,
`archiveRitualCore`. `isDueOn` + localDate derivation live in the core
(or `shared/time`), reused by api + push. Entities via a feature
`entities.ts` (the `simpleLists` precedent). `index.ts` barrel. Vitest:
due-ness derivation across all four cadences + timezone edges,
complete/uncheck idempotency, reflection edit, entitlement guard,
lens-accessibility on the read.

### 4. Contract — `packages/contract/src/rituals.ts`

`ritualsContract = { list, create, update, complete, uncheck,
updateReflection, setPaused, archive }`
with `ProGateErrorMap`; schemas mirror the domain DTOs 1:1 (dates as ISO
strings). Composition lines in `packages/contract/src/router.ts` + `index.ts`.

### 5. API — `api/src/procedures/rituals.ts`

`implement(ritualsContract).$context<ApiContext>()`; per op `requireUser`
→ `isPlanActive` (402) → `assertLensAllowed` → core call → DTO map →
`toOrpcError`. One line in `api/src/router.ts`.

### 6. Web

`stores/rituals.svelte.ts` (DTO interfaces mirroring the contract, loads on
lens change); `components/rituals/RitualsView.svelte` (Planning page);
`components/rituals/RitualStrip.svelte` (consumed by the Today view,
grouped morning → midday → evening); `components/rituals/
RitualReflectionDialog.svelte` (the completion modal — mood trio + note,
per the confirm-dialog overlay pattern; doubles as the edit view for
checked rows); `routes/rituals/+page.svelte` (thin host);
`styles/rituals.css`. Shell Plan group gains the Rituals link; palette
registry gains the route command. The create/edit form carries the
interval and cadence pickers; the lens picker defaults to Me. Primitives
only (`GroupedList`, `ListEmpty`, `Chip`, `CompletionCircle`, `ProGate`,
`Button`, `PickerSheet` for interval/cadence/goal pickers). Row
interaction mirrors task rows: focusable, Enter/Space on an unchecked row
opens the reflection dialog. New visual values → `tokens.css` first
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

Domain unit (above) + api fragment tests + web store tests. E2E: create
(defaults to Me) → due in its interval group on Today (outside cap) →
check opens the reflection → mood + note commit the entry → tap the
checked row reopens and edits the reflection → uncheck removes it → pause
hides → FREE account hits ProGate/402 → downgrade path preserves rows.

### 10. Doc cascade finish

`docs/DATA-MODEL.md` (Ritual/RitualEntry + enums), `docs/PAGES.md` (route),
`docs/features/rituals.md` (catalog entry, status shipped), `docs/PRICING.md`
(Rituals listed under Pro), `docs/features/pwa-notifications.md` (reminder
line), roadmap §Then entry → done with sign-off link.

## Non-goals / accepted losses

- **Rituals never enter the work flow.** No Next candidacy, no focus mode,
  no `TaskSession`, no minted occurrence Tasks — checking off in Today is
  the only interaction. (A dual check/work mode was specced and reversed
  same-day; if that demand returns, the mint-lifecycle design is preserved
  in this spec's git history.)
- **Moods are never aggregated or judged.** No averages, percentages,
  trend lines, or comparative copy anywhere — a mood is a fact recorded
  for the user's own review, shown exactly as recorded, glyph uncolored.
- **No task-level recurrence.** A "Repeats" property on Task is
  deliberately not built. Rituals cover the rhythm — check-off only; when
  the underlying work needs task machinery, it is captured as a task when
  it matters. One recurrence concept in the product. **Revisit trigger:**
  three or more paying users separately ask for work-task recurrence —
  then spec it as its own feature (series semantics and all), not as a
  bolt-on here.
- **No streaks, chains, scores, percentages, badges, red overdue dots, or
  make-up mechanics** — banned vocabulary and banned UI. Evidence looks
  backward only, and only inside cadence reviews.
- **No RRULE.** Four cadences. Custom recurrences are a power feature this
  product's calm budget does not buy.
- **Not a capture or triage destination** in v1. No sigil, no wizard step.
- **No per-interval reminders or time enforcement** — the interval is an
  assignment and a grouping, not an alarm system. The one reminder is the
  existing daily push.
- **No CLI in v1** (`actionamp ritual list/toggle` is a natural follow-up;
  the CLI is already Pro-only).
- Each work part commits separately with `typecheck` + the feature's vitest
  green before the next; WORKFLOW.md lands first per repo rules.
