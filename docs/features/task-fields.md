---
slug: task-fields
title: "Task enhancement fields (Context + Outcome)"
feature_area: cross-cutting
status: missing
spec: task-fields.md                  # ready — locked 2026-07-04
verified: 2026-07-04
---

# Task enhancement fields (Context + Outcome)

**Wanted.** A work card today is a title and nothing else. When a task needs
more — background, a rationale, a spec link, pointers to the resources you'll
need — there is nowhere to put it. And when it's done, there's nowhere to
record what happened. This feature adds two optional, markdown-rendered fields
that bookend a task's life:

- **Context** — what you need *to do* it. Captured anytime; read in Focus mode
  and Task detail. Reuses the existing `Task.content` column ("longer notes /
  markdown body," `schema.prisma:202`) — no migration.
- **Outcome** — what *happened*. Captured at completion (optional, never
  mandatory); read in the Logbook and future Review. Adds one nullable column,
  `Task.outcome`.

Both invisible when empty. NextCard stays title-only.

**Today.** `Task.content` exists, is read by `getTask` / `getTopTask`, and
renders raw in Focus mode (`FocusMode.tsx:56`) — but the codebase only ever
writes `content: null` (`inbox/operations.ts:144`, `projects/operations.ts:188`);
no write path exists. `Task.outcome` does not exist. `TaskDetailPage` is a
documented stub awaiting exactly this (`TaskDetailPage.tsx:8-12`). Completion
happens in `toggleTaskDone` (`tasks/operations.ts:97-113`) — the natural
attach point for Outcome capture.

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

**Files (expected).** `webapp/schema.prisma` (add `outcome`), a shared
`components/ui/Markdown.tsx` (react-markdown wrapper), `tasks/operations.ts`
(write path + `toggleTaskDone` Outcome arg), `FocusMode.tsx` + `TaskDetailPage`
+ `LogbookPage` (render), and a same-PR edit to `docs/specs/resources-project-
owned.md` (drop the `TaskResource` join pieces).
