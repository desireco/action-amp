---
feature: work-area-merged
status: draft
spec_owner: discover
build_owner: build
priority: P3
kind: spec

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsgE      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:45:22Z
---

# Feature: Merged Work Area (Next + Today on one page), complete-only-from-focus, and a timestamped activity log

> **Extracted 2026-07-04:** the independently buildable notes + completion-log
> slice now lives in `docs/specs/done/task-notes-completion-log.md` (`ready`). Keep
> this draft for the larger route merge, complete-only-from-focus cleanup,
> Not Doing/archive semantics, and full activity-log expansion.

## Summary

Collapse the Work Area's two separate routes — `/app` (the Next Now/Next
chooser) and `/app/today` (the committed list + Done-today) — into **one
page**: a full-width Now/Next card on top, two columns below (Today | Done
today), all scoped by the Lens switch already in the shell. Two rules reshape
how a task is worked:

1. **Complete-only-from-focus.** No completion circle anywhere — not on the
   hero card, not on Today rows, not on Done rows. A task is completed *only*
   by entering focus mode (Start) and pressing **Complete**. The list becomes
   a chooser, not a tick-box.
2. **A timestamped activity log per task.** Today the only signal is
   `startedAt` (current state, overwritten on each transition — lossy). This
   spec adds a real event log: **Started / Paused / Completed / Not doing**,
   each timestamped, interleaved with the user-authored progress notes
   (`TaskUpdate`). A focus session's shape (how many starts, how fragmented)
   stops being invisible — which is exactly what the Review area
   (`WORKFLOW.md §2.5`) needs to be more than "3 done today."

Focus mode becomes the only surface where work happens: **Complete / Pause /
Not doing** as outcomes, plus a progress-notes thread. `NOT_DOING` is a
**decision recorded in the log** that moves the task to **archive** (lossless,
recoverable from the Logbook — same semantics as triage Archive on `InboxItem`):
you can see a task and decide not to do it, and instead of it disappearing the
*decision* is documented.

Interactive prototype at `docs/mockups/today-merged.html` (Plan/Focus toggle,
Lens switch, Start → focus, notes thread, dark mode).

## Why

Three problems, each independently motivating.

1. **The Work Area is split across two routes for no structural reason.**
   `WORKFLOW.md §5.4` locks "Next + Today = two surfaces, no third" — but
   ships them as *two routes* (`/app`, `/app/today`) with separate headers and
   empty states. The hero (the wedge) and the committed list (the plan for
   today) are one mental surface: "what am I doing, and what else is on the
   table." Merging them onto one page keeps the chooser as the hero (the list
   is demoted *below* it, not removed) while killing the route/context switch
   between them. Fewer surfaces, not more — the merge *reduces* app surface
   area.
2. **The completion circle invites the wrong move.** Today every `TaskRow`
   (Today, Upcoming, Someday, Done) and the `NextCard` carry a tickable
   `CompletionCircle` that calls `toggleTaskDone`. That makes "complete" a
   one-click list action — but the product thesis is that you complete a task
   by *doing* it, and doing it means entering focus. Allowing check-off from a
   list undermines the focus-mode wedge and lets users clear tasks they never
   engaged with. Complete-only-from-focus makes the verb match the intent.
3. **`startedAt` is lossy; the activity log is empty.** A user who Starts →
   Pauses → Starts → Pauses → Completes leaves only the final `startedAt`
   behind — the fragmentation is invisible. And `TaskUpdate` (the activity-log
   model, `schema.prisma:227`) is **surfaced nowhere** today: no query, no
   action, no UI. So the "progress notes / changelog per task" the schema
   already promises is dead code. This spec makes it real and interleaves it
   with system events, turning the log into a Linear-style timeline.

`NOT_DOING` answers a real gap: today the only ways a task leaves the active
surfaces are Complete (done) or Defer/Snooze (later). There's no honest
"decided not to" — so a task you've concluded isn't worth doing either rots on
a list or gets silently deleted. Recording the decision + archiving (lossless)
matches the existing Archive semantics and keeps the Logbook truthful.

## Done-conditions

Each predicate is independently verifiable. The spec is `done` only when all pass.

### Structure (the merge)

- [ ] **One page renders both the Now/Next card and the Today list.** The
      `/app` route shows the full-width Next card (hero) **and**, below it,
      the committed-for-today list + the collapsed Done-today section — what
      `/app/today` renders today. The `/app/today` route is removed (or
      redirects to `/app`); the Today nav entry points at `/app`. Verified by
      navigating `/app` and seeing both, and `/app/today` not existing as a
      standalone view.
- [ ] **The Lens switch scopes the whole merged page.** Switching Work↔Me
      (the existing `LensSwitch` in the shell) re-scopes the hero, the Today
      list, and the Done-today section together — no per-section lens state.
      Verified by switching lens and seeing all three swap.
- [ ] **Starting a task collapses the list into focus.** Pressing Start on the
      hero enters focus mode (full-screen single-task surface); the hero + the
      two columns leave the viewport. Esc / Pause / Complete / Not doing exits
      back to the merged Plan view. Verified by the focus overlay taking over
      and the columns being absent (not just visually hidden behind it).
- [ ] **`WORKFLOW.md §5.4` is updated** to describe the merge (currently:
      "two surfaces"). Per `AGENTS.md`, structure changes start in
      `WORKFLOW.md`; the doc cascade (its §6) is updated to match. Verified by
      reading the updated §5.4 + cascade.

### Complete-only-from-focus

- [ ] **No `CompletionCircle` renders on the hero card or any `TaskRow`.**
      `NextCard.tsx` and `TaskRow.tsx` no longer render the circle; the
      `onToggleDone` prop / `handleCircle` path is removed. Verified by grep —
      no `CompletionCircle` import remains in either component.
- [ ] **`toggleTaskDone` is not callable from any list or the hero.** Its only
      caller becomes the focus-mode Complete action (see below). Verified by
      grepping call sites of `toggleTaskDone` across `src/`.
- [ ] **A task cannot be marked done without having been started.** The
      Complete action in focus mode requires `startedAt != null` (focus is only
      reachable via Start, so this holds by construction; state it in the code).
      Verified by attempting the path in an e2e.

### Focus surface

- [ ] **Focus mode shows Complete / Pause / Not doing** as the three outcomes,
      plus the progress-notes thread. The current `FocusMode.tsx` (which shows
      only Done / Exit) gains Pause and Not doing, and renders the
      `TaskUpdate` thread (read) + a compose field (write).
- [ ] **The notes thread renders `TaskUpdate` entries, newest at the bottom.**
      Each entry shows its body + a compact timestamp. Empty state: a calm
      "No notes yet." Verified by adding a note in focus mode and seeing it
      appear.
- [ ] **Enter posts a note; Esc exits focus.** Matches the prototype +
      `INTERACTION.md` keyset.

### Activity log (system events)

- [ ] **A `kind` discriminator exists on `TaskUpdate`** distinguishing
      user-authored notes from system events. Lean: an enum
      `NOTE | STARTED | PAUSED | COMPLETED | NOT_DOING` on `TaskUpdate`
      (default `NOTE`), so one query yields the full interleaved timeline.
      Requires a Prisma migration (`wasp db migrate-dev --name <x>`).
- [ ] **Each transition writes a timestamped system event.** `startTask` writes
      `STARTED`, `pauseTask` writes `PAUSED`, the focus Complete writes
      `COMPLETED`, and Not-doing writes `NOT_DOING` — each as a `TaskUpdate`
      row alongside (not instead of) the user's notes.
- [ ] **System events render distinctly from notes** in the thread (e.g. a
      muted label "Started · 9:41 AM" vs a note body), so the timeline reads as
      a real activity feed, not a uniform list.
- [ ] **The log survives completion.** `Completed`/`NOT_DOING` events persist;
      the thread is readable on the archived/completed task in the Logbook. (No
      clearing of `TaskUpdate` rows on done — `startedAt` is cleared, the log
      is not.)

### NOT_DOING → archive

- [ ] **`NOT_DOING` is reachable from focus (third outcome) and from any list
      row.** Both paths write the `NOT_DOING` event and move the task to
      archive. The list-row action does **not** require having started the
      task.
- [ ] **Archived tasks are losslessly recoverable from the Logbook**, mirroring
      the existing `InboxItem` Archive (WORKFLOW §2.5). The decision (the
      `NOT_DOING` event + any reason note) is visible in the task's history.
- [ ] **A not-doing task leaves the active surfaces** (Next, Today,
      Upcoming) the moment it's archived — it does not linger as a fourth
      status on a list.

### Quality gates

- [ ] **`wasp compile` passes.**
- [ ] **Existing e2e suite stays green**, updated where the merge / circle
      removal changes assertions: `e2e/today.spec.ts` (route merge), `e2e/what-
      now.spec.ts` (circle removal, focus outcomes). Add e2e for: Start → focus
      → Complete (the only complete path); Start → Pause → list reappears;
      list-row Not doing → archived → in Logbook.
- [ ] **New Vitest cases** for the activity-log writes (each transition
      produces the right `kind`) and for the "cannot complete unstarted" guard.
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No matcher / focus-engine change.** `getTopTask` ranking is untouched;
   this spec is about *surfaces and logging*, not *selection*. (`focus-engine-v2`
   owns the matcher.)
- **No change to the Today 5-item cap** or the Upcoming-bench toggle. Both
   carry over to the merged page unchanged.
- **No multi-task focus / concurrent Now.** Single "now" rule preserved: only
   one task started at a time per lens; starting another pauses the first
   (writes `PAUSED`).
- **No editing existing log entries.** Notes are append-only in v1 (delete/edit
   is a later refinement).
- **No Review/Reports screen.** The log *enables* it (WORKFLOW §2.5) but
   building the Review surface is a separate, larger spec — this spec only
   captures the data + surfaces it in focus.
- **No subtasks.** `TaskUpdate` is an activity log, not a subtask list.
- **No mobile gestures for the merge.** Desktop-first; mobile gesture mapping
   is separate (`INTERACTION.md`).
- **No drag-to-reorder.** Same stance as `friction-cleanup`.

## Open questions

- **How to represent "archived" on a `Task`.** `Task` today has `isDone` /
  `completedAt` but **no archive fields** — only `InboxItem` has `archivedAt`.
  Lean: add `archivedAt DateTime?` + `archivedReason` (or reuse the `NOT_DOING`
  log event as the reason) to `Task`, mirroring `InboxItem`, so the Logbook's
  existing lossless-archive concept extends to Tasks. Build confirms the
  cleanest migration; alternatives (a `TaskStatus` change; reusing `isDone`)
  lose the completed-vs-not-doing distinction.
- **`kind` enum vs. separate `TaskEvent` table.** Lean (stated above): `kind`
  on `TaskUpdate` keeps the timeline one query. The alternative — a separate
  `TaskEvent` model — is cleaner separation but splits the timeline across two
  queries and two render paths. Build picks; note the choice in the review.
- **Where Done-today sits.** The prototype puts it as a side column (Today |
  Done). The current `TodayPage` has it as a collapsed section *below* the open
  tasks. Both are defensible; Build may keep the existing collapsed-section
  treatment if it composes more cleanly under the hero. State the choice.
- **`/app/today` route: remove or redirect?** Lean: redirect to `/app` (no dead
  links), then remove once nothing references it. Build's call.

## Prototypes

- **`docs/mockups/today-merged.html`** — the interactive prototype. Covers the
  merge, the Lens switch (Work/Me swaps the whole page), Start → focus
  (full-screen), the notes thread (compose + timestamped), and dark mode.
  Limitations to know before building: it uses stub data (no real ops), the
  activity log shows user notes only (system-event rendering is sketched in
  this spec, not in the mock), and `NOT_DOING` is spec'd here but not wired in
  the mock. Use as reference for composition + interaction, not pixel match.
