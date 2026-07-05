# Feature: Goal planning & Project alignment

> Catalog entry (1:1 with `docs/specs/goal-planning.md`). WHAT the feature does,
> not how it's built. Discover owns; Build reads.

## What it is

A complete, **mutable** Planning area for the Goal → Project → Task hierarchy.
Today the Planning area is **read-mostly**: you can create goals/projects and
read their roll-ups, but you cannot complete, reopen, edit, delete, or re-link
them, and you cannot start a project from inside a goal. This feature closes
those holes and adds one lightweight planning affordance — an explicit
**sequence** of projects under a goal ("which project is next toward this
goal?") — without turning ActionAmp into a project-management tool.

## The hierarchy (unchanged)

```
Lens → Goal → Project → {Task, Resource}
```

A Goal owns zero or more Projects. A Project owns Tasks + Resources. This
feature makes those links editable and adds lifecycle + ordering.

## Capabilities (what the user can do)

### Lifecycle (Goal & Project)
- **Complete** a Goal or a Project — an explicit user action, not derived.
  Sets `isDone=true`, stamps `completedAt`, removes from the active list,
  surfaces in the Logbook. Children are left in place (not auto-archived).
- **Reopen** a completed Goal or Project — returns it to the active list,
  clears `completedAt`. Available from the Logbook (mirror of the existing
  archived-note Restore action).
- **Edit** name + description of a Goal or Project in place.
- **Delete** a Goal or a Project — **lossless by default**: children are
  re-parented, not destroyed (see "Delete semantics" below). Destructive delete
  is a deliberate second step.

### Alignment (the goal ↔ project link)
- **Re-link** a Project to a different Goal, or to no Goal, from the Project
  detail page (an editable parent field, not a birth-only assignment).
- **Re-link** a Project to a Goal or unlink it. Tasks move between Projects or
  standalone, but do not align directly to Goals.

### Sequence (the planning affordance)
- **Order Projects under a Goal.** A goal's project list reflects an explicit,
  user-controlled sequence (not alphabetical). The first project in the
  sequence is the **"next project"** toward the goal and is surfaced on the
  goal card + goal header as a single line.
- Reordering is a deliberate move action (up/down, or drag), not automatic by
  progress or due date. The user declares intent; the app remembers it.

## What it deliberately is NOT
- Not a Gantt chart, not a dependency graph, not multi-goal-per-project.
- Not drag-everything-between-horizons (that's the `work-area-merged` lane).
- Not bulk assign (that's FEATURES.md F7, deferred).
- Not AI goal-breakdown (that's the `cli` skill lane, deferred).

## Where it lives
- Pages: `/app/goals`, `/app/goals/:permalink`, `/app/projects/:permalink`
  (all exist; this feature adds controls to them, no new routes).
- Logbook (`/app/logbook`): gains Goal rows alongside the existing completed-
  task / completed-project / archived rows, each with a Restore action.
- No new top-level nav, no new modes. Pure Planning-area completion.

## Plan-tier implications
- **FREE**: same caps as today (1 goal/lens, 3 projects/lens) enforced on
  create, unchanged. Completing/editing/re-linking/reordering are **not**
  plan-gated — they're hygiene on what you already have.
- **PRO / FOUNDER**: no new surface; the sequence affordance is available to
  all (it's structural, not a power feature).
