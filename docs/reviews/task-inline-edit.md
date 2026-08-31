# Review: task-inline-edit

<!-- Build owns this file. Discover reads it to sign off. -->

Spec: `docs/specs/task-inline-edit.md` (issue #4) · Commits `0aad632`,
`HEAD` (project-rows extension).

## Addendum — project detail rows (Jake's follow-up)

The same `TaskRowEditor` now renders in **Project detail** task rows
(`ProjectDetailPage.tsx`): selecting a task shows the live chips (When /
Priority / Size / **Project** / Due) plus the Edit toggle. The old §C "Move
to project" affordance is removed — the Project chip replaces it (pick a
sibling project to reassign, "No project" to unlink to standalone), along
with the navigational Edit button and `handleMoveTask`. The project horizon
buttons (Today / Not today / Upcoming) stay. Done rows remain review-only.
The page passes its own project object to the editor (its task select
doesn't include the relation), and the one-parent rule correctly hides the
Goal chip there. The delete-dialog's "reassign to project" picker is
unaffected (it shares `lensProjects`, which stays).

## What changed

Task editing moved one level up into the list rows. A selected (expanded)
task row in **Today, Upcoming, Someday, and Week** now renders the new
`TaskRowEditor` (`webapp/src/tasks/TaskRowEditor.tsx`):

- **Chips, live** — the exact `PropertyChips` + `taskPropertyFields` row from
  the task detail page (When / Priority / Size / Project / Due / Goal). Every
  pick autosaves through `updateTaskDetails` with the detail page's
  invalidation set; a due-date pick on a Someday task still promotes it to
  Upcoming.
- **Edit toggle** — switches the row into a title input + notes textarea with
  **Save** (gated until the title is non-empty and something changed;
  mod+enter submits), **Cancel** (restores), and **Mark as won't do**
  (confirm dialog → `WONT_DO` → the row collapses). Same ops and wording as
  the detail page.

Each page keeps its own quick actions (Do / Today / Someday / Move to
Upcoming) and its navigational Edit/Open button is gone — the editor replaces
it. Overflow (beyond-cap) rows, done-today rows, and project-detail rows keep
their existing behavior (non-goals in the spec).

The task detail page is unchanged and remains the deep surface (URL,
breadcrumbs, attachments, outcome, done-task feedback, property-key
shortcuts).

## Gates run

- `npx vitest run src/tasks/ src/lists/` — 24 passed: 5 new behavioral
  `TaskRowEditor` tests (chips+Edit render, save writes the exact
  `updateTaskDetails` payload, cancel writes nothing, won't-do gates behind
  the confirm then writes `WONT_DO`, done rows render nothing), plus all
  existing Upcoming/Someday/weekView tests.
- `npx wasp compile` — passes (two compile errors found and fixed on the way:
  a stale `useLocation` in WeekPage, and the Prisma `TaskStatus` enum needing
  boundary narrowing for the chips).
- `npm run lint` — clean on every changed non-test file. Remaining errors in
  `src/lists/` are the pre-existing test-file `vi.mock` pattern (flagged on
  clean main too) — my new test file follows the same established pattern.

## Notes for sign-off

- The editor derives Project/Goal pickers from the row's lens — the page's
  active lens on Upcoming/Someday, the row's provenance lens on global
  Today/Week. Rows without a resolvable lens show chips without
  project/goal pickers.
- Worth a hands-on pass in dev: expand a row on each of the four pages, pick
  a chip (watch it autosave + the row's due chip update), then Edit → change
  title → Save → collapse → re-expand to confirm persistence.
