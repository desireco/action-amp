---
slug: rituals
title: "Rituals (the habits layer — check-off only, guidance + benefit)"
feature_area: planning
status: shipped
spec: rituals.md                # done — built 2026-09-19
verified: 2026-09-19
---

# Rituals

**What.** The product's one recurrence concept (WORKFLOW.md §5.14): recurring
personal rhythms — daily, weekdays, weekly (Mon–Sun), or every-N-days — as a
first-class lens-scoped `Ritual` entity, deliberately excluded from the task
machinery. A Ritual's entire doing-surface is checking it off in Today's
Rituals section: no Next candidacy, no focus mode, no minted Tasks, no
streaks/scores/overdue state. Pro-only (FREE sees the ProGate; a downgrade
preserves data losslessly and gates ops).

**Surfaces.**

- **Planning page** (`/rituals`) — lens-scoped management like Projects:
  inline create (name, interval morning/midday/evening, cadence, lens
  defaulting to Me), edit, pause, archive; the empty state offers one-tap
  starting points. Rows carry the interval label + cadence chip and render
  **guidance** and **benefit** as markdown (the safe logbook Markdown
  component) with small `g`/`b` tags. Archived rituals live in a quiet
  **Archived** section at the very bottom of the page (History, Restore,
  and Delete — retired, not gone). Delete is a confirmed hard delete,
  **archived rituals only** (an active ritual answers "Only archived
  rituals can be deleted." — archive first, the calm two-step); the
  ritual's entries cascade with it.
- **Today section** — the day's due rituals, universal across lenses,
  grouped morning → midday → evening, **outside `todayCap`**; renders nothing
  when nothing is due. The CompletionCircle checks (opens the reflection) /
  unchecks (one direct tap — the entry and its reflection are deleted); a
  checked row reopens the reflection for view/edit; a recorded mood renders
  a small neutral glyph. **(g)/(b) markers** after the name open a hover
  popover with the markdown-rendered guidance/benefit (quiet on touch — the
  Planning page carries the full text).
- **The completion reflection** — "How did it go?" with three moods
  (Good / Okay / Rough → HAPPY | NEUTRAL | NEGATIVE) and a note, all
  optional; Complete is always enabled (completing with nothing entered is a
  valid check), X/Esc exits without saving. Moods are plain facts — never
  aggregated, scored, or colored.
- **Daily push reminder** — one calm line when rituals await, naming the
  first: `Today: … · Journaling +1 more due` (due-and-unchecked in the
  user's persisted timeZone, interval- then order-sorted).
- **Goal alignment, starting points, history, drag-and-drop** (2026-09-19) —
  a Goal picker in the composer/edit form with a star-chip on rows; the
  empty state prefills Journaling/Gratitude (markdown guidance + benefit),
  Medication, Morning walk; a per-row History toggle shows the checked days
  (mood glyph + note, never aggregated); Planning rows drag to reorder
  (order = index).
- **CLI** (`actionamp ritual …` + `/api/cli/ritual/*`) — list, today,
  create, update, pause/resume, archive, check/uncheck. Enum words arrive
  lowercase (`morning`, `mon`, `good`); the local day derives server-side;
  `--json` everywhere.

**Data.** `Ritual` (lens-scoped; `interval`, `cadence` + `weekday`/`intervalDays`,
optional `guidance`/`benefit` (500 chars, markdown), nullable `goalId`,
`pausedAt`, `archivedAt`) + `RitualEntry` (one row per checked day:
`localDate` in the user's IANA zone, optional `mood` + `note`; unique per
ritual+day; uncheck deletes). **Due-ness is derived** (`isDueOn` — pure
cadence function, INTERVAL anchors on the creation local date), never
stored — no next-occurrence column, no materialization job.

**Files.** `packages/domain/src/rituals/`, `packages/contract/src/rituals.ts`,
`api/src/procedures/rituals.ts`, `api/src/cli/routes.ts` (ritual section),
`web/src/lib/components/rituals/`, `web/src/lib/stores/rituals.svelte.ts`,
`cli/src/commands/ritual.ts`, `web/e2e/rituals.spec.ts` +
`api/src/seed-rituals.ts`. Spec: `docs/specs/done/rituals.md`.
