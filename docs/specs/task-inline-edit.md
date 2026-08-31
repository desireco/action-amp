---
id: task-inline-edit
kind: spec
title: "Inline task editing in lists — properties autosave, title/notes editor one level up"
status: review
priority: P1
feature: tasks
spec_owner: discover
build_owner: build
created: 2026-08-31
depends_on: [task-fields, resources-project-owned]
---

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4OMqyp      # linked to the pre-existing board item (issue #4) by hand; sync treats it as write-once

# Spec: Inline task editing in lists

> Source: Jake's issue #4 (board Next). The issue voice, verbatim intent:
> when a task is selected in a list (Upcoming or any task list), let him
> change the task's properties right there — complexity, project, due — and
> those save automatically. Edit opens title + description editing with the
> same delete/save/cancel as the detail page, "one level up."

## Summary

Move task editing from the dedicated detail page into the list rows. A
selected (expanded) task row gains:

1. **Property chips, live** — the same `PropertyChips` + `taskPropertyFields`
   row the detail page uses (When / Priority / Size / Project / Due / Goal).
   Every pick saves immediately through `updateTaskDetails` (autosave).
2. **An Edit button that opens the task detail page**, exactly as the rows
   always did — title/notes editing, Save/Cancel, and won't-do stay there.

*(Reshaped 2026-08-31 per Jake: "like it was before, I just want these
dropdowns to be inline." The first cut also put the title/notes working copy
and won't-do inline; that was walked back — the detail page remains the prose
editor, reached by the row's Edit button.)*

The detail page stays (deep URL, breadcrumbs, attachments, outcome, feedback
on done tasks) — but the common edits no longer require the round trip.

## Decisions locked

1. **One shared component**: `webapp/src/tasks/TaskRowEditor.tsx`, rendered
   inside `TaskRow`'s expanded children. It owns the chips, the prose editor,
   the won't-do confirm, and the invalidations after every write.
2. **Wired into the five active list surfaces**: Today (main rows; overflow
   and done rows stay as-is), Upcoming, Someday, Week, and **Project detail
   rows** (added 2026-08-31 on Jake's direction — selecting a task there
   edits complexity/project/due inline). Each page keeps its own quick
   actions (Do / Today / Someday / Move to Upcoming / project horizon
   buttons) and drops its navigational Edit/Open button — the editor
   replaces it.
   - **Project detail specifics:** the row editor's Project chip replaces
     the old §C "Move to project" picker entirely (picking another project
     reassigns; "No project" unlinks to standalone) — the Move button,
     inline picker, and `handleMoveTask` are removed. The page supplies the
     containing project to the editor (its task select doesn't include the
     relation); the one-parent rule then hides the Goal chip, which is
     correct on a project's rows.
3. **Same write paths as the detail page**: `updateTaskDetails` for every
   structural pick and the prose save; `updateTaskStatus({status: "WONT_DO"})`
   for the decline; identical invalidation set (getTask, getTasks, getTopTask,
   getProjects, getProject, getGoals, getAppData, getLogbook for won't-do).
4. **Someday + concrete date → Upcoming** promotion rule is preserved (a due
   pick on a Someday task promotes it, matching the detail page).
5. **Pickers (Project/Goal) load lens data**: `getProjects`/`getGoals` for
   the row's lens — the page's active lens when scoped, else the task's
   provenance lens (global Today rows). No picker when neither resolves.
6. **Done rows are read-only** — no editor on completed tasks (they don't
   render expanded editors anywhere).
7. **Won't do, not hard delete** — the app's decline idiom is WONT_DO with
   restore in the Logbook; the row editor mirrors the detail page exactly
   (CloseButton + ConfirmDialog) rather than introducing a hard-delete op.

## Done-conditions

- [ ] `TaskRowEditor` renders the chip row for a task with all
      `taskPropertyFields` fields; every pick autosaves (verified by op call
      shape in tests) and refreshes list/top-task/nav counts.
- [ ] Edit toggles the prose editor: title input, notes textarea, Save
      (disabled unless title non-empty and something changed), Cancel
      (restores drafts), Mark as won't do (confirm dialog → WONT_DO → row
      collapses).
- [ ] Today, Upcoming, Someday, Week rows render the editor when expanded;
      their navigational Edit/Open buttons are gone.
- [ ] Week/Someday/Upcoming tests still pass; new source-contract test for
      TaskRowEditor; `npm run lint` clean on changed paths;
      `npx wasp compile` passes.
- [ ] Keyboard-first preserved: mod+enter saves the prose editor; the
      property-key shortcuts remain on the detail page (not duplicated in
      lists in v1).

## Non-goals

- Hard delete of tasks from rows (WONT_DO is the decline path).
- Property-key shortcuts ([ / ] / H) inside list rows (detail page only).
- Editing overflow (beyond-cap) or done-today rows.
- ~~Project detail page rows~~ — **reversed 2026-08-31 (Jake):** project rows
  now carry the editor; the Move picker they used to have is gone (superseded
  by the Project chip).
