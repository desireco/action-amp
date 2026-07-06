---
slug: task-fields
title: "Task enhancement fields (Context + Outcome)"
feature_area: cross-cutting
status: partial
spec: task-fields.md                  # ready — locked 2026-07-04
verified: 2026-07-05
---

# Task enhancement fields (Context + Outcome)

**Partial — Context shipped 2026-07-05; Outcome pending.** Two optional,
markdown-rendered fields that bookend a task's life:

- **Context** — what you need *to do* it. Captured anytime; read in Focus mode
  and Task detail. Reuses the existing `Task.content` column ("longer notes /
  markdown body," `schema.prisma`).
  **Status: shipped.** Full-field chip-popover editing on the task page +
  shared `PropertyChips` editor across triage + task page landed 2026-07-05
  (`9b8c6ae`, `ce669c0`). Task permalinks (`/app/tasks/:permalink`) and the
  editor polish shipped the same day (`1e4d4df`). Notes thread (NOTE-kind
  `TaskUpdate`) writes through the same composer — see
  `task-notes-completion-log.md`.
- **Outcome** — what *happened*. Captured at completion (optional, never
  mandatory); read in the Logbook and future Review. Adds one nullable column,
  `Task.outcome`.
  **Status: not shipped.** No `Task.outcome` column exists in `schema.prisma`
  as of 2026-07-05. The completion flow currently writes a `kind=COMPLETED`
  `TaskUpdate` body (the feedback prompt), not a structured Outcome field.

Both invisible when empty. NextCard stays title-only.

**Spec.** `docs/specs/task-fields.md` — **`ready`** (locked 2026-07-04).
Renderer decided: `react-markdown` + `remark-gfm` (the existing
`shared/markdown.ts` returns unsanitized HTML, unsafe for user-authored
content). NextCard-peek decided: title-only, fields reveal in Focus / Task
detail. **Reverses** `resources-project-owned.md` on the Task↔Resource link —
markdown links in Context instead of the `TaskResource` join; see the spec's
§"Resource linking" and the reversal note on `resources-project-owned.md`.

**Why it matters.** The wedge is *the one task that matters*; surfacing it is
half the job. The other half — having what you need to act, and remembering
what came of it — lives nowhere in the app today. Outcome specifically feeds
Review/Logbook: an honest "what happened" in your own words, captured fresh at
completion. No streaks, no badges — just prose for review.

**Remaining work (Outcome only).** Add the nullable `Task.outcome` column
(migration), expose it through `toggleTaskDone` (capture-at-completion path),
render it in the Logbook + future Review surface. The markdown renderer
decision is already locked.
