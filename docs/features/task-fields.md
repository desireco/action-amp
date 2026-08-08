---
slug: task-fields
title: "Task enhancement fields (Context + Outcome)"
feature_area: cross-cutting
status: shipped # shipped complete 2026-07-28 (Outcome leg)
spec: task-fields.md # done — locked 2026-07-04; Outcome shipped 2026-07-28
verified: 2026-07-29
---

# Task enhancement fields (Context + Outcome)

**Shipped complete 2026-07-28.** Two optional, markdown-rendered fields that
bookend a task's life:

- **Context** — what you need _to do_ it. Captured anytime; read in Focus mode
  and Task detail. Reuses the existing `Task.content` column ("longer notes /
  markdown body," `schema.prisma`).
  **Status: shipped 2026-07-05.** Full-field chip-popover editing on the task
  page + shared `PropertyChips` editor across triage + task page. Task
  permalinks (`/app/tasks/:permalink`) and the editor polish shipped the same
  day. Notes thread (NOTE-kind `TaskUpdate`) writes through the same composer —
  see `task-notes-completion-log.md`.
- **Outcome** — what _happened_. Captured at completion (optional, never
  mandatory); read in the completed-task panel, with Logbook/Review to follow.
  New nullable column `Task.outcome`.
  **Status: shipped 2026-07-28.** `Task.outcome` column landed; `setTaskOutcome`
  op writes it; the completed-task panel on the task page renders it (markdown)
  with an Add/Edit affordance. Focus captures it through the inline notes-area
  completion reflection, not a modal. This is the leg that flipped the feature
  from `partial` to `shipped`.

Both invisible when empty. NextCard stays title-only.

**Spec.** `docs/specs/task-fields.md` — **`done`** (was `ready`, locked
2026-07-04; Outcome leg closed 2026-07-28). Renderer: `react-markdown` +
`remark-gfm` (the existing `shared/markdown.ts` returns unsanitized HTML,
unsafe for user-authored content). NextCard-peek: title-only; fields reveal in
Focus / Task detail. **Reverses** `resources-project-owned.md` on the
Task↔Resource link — markdown links in Context instead of the `TaskResource`
join (see the spec's §"Resource linking" and the reversal note on
`resources-project-owned.md`). That reversal is why Resources shipped scope-cut.

**Why it matters.** The wedge is _the one task that matters_; surfacing it is
half the job. The other half — having what you need to act, and remembering
what came of it — now lives in the app. Outcome specifically feeds
Review/Logbook: an honest "what happened" in your own words, captured fresh at
completion. No streaks, no badges — just prose for review.
