# Review: breadcrumb-nav

**Spec:** `docs/specs/breadcrumb-nav.md`
**Status:** `review` (ready for Discover sign-off)
**Built:** 2026-07-09

## What changed

Wires the existing `Breadcrumb` component into Task, Project, and Goal detail
pages, replacing `← Back` / `← Projects` / `← Goals` links with hierarchy
crumbs that navigate to ancestor routes (route model per spec's locked decision).

**Modified files:**
- `webapp/src/tasks/TaskDetailPage.tsx` — breadcrumb: Goal › Project › Task
- `webapp/src/projects/ProjectDetailPage.tsx` — breadcrumb: Projects › Goal › Project
- `webapp/src/goals/GoalDetailPage.tsx` — breadcrumb: Goals › Goal
- `webapp/src/components/ui/Breadcrumb.css` — crumb label truncation (max-width 18ch)
- `webapp/src/goals/GoalDetailPage.test.tsx` — 2 breadcrumb navigation tests
- `webapp/src/tasks/TaskDetailPage.test.tsx` — 5 breadcrumb tests (new file)

## Gates run

### Build + tests
- `wasp compile` → clean (exit 0)
- 43 tests pass across 4 test files (Breadcrumb: 5, GoalDetailPage: 15, TaskDetailPage: 5, ProjectDetailPage: 18)

### Cold-context reviewers (AI #2)
Two fresh-context reviewers:

| Angle | Verdict |
|-------|---------|
| Correctness / regressions / spec compliance | 0 blockers; 4 concerns — all **fixed** |
| Simplicity / maintainability / UX | 1 blocker + 4 concerns — all **fixed** |

### Done-conditions

| Condition | Status | Evidence |
|---|---|---|
| Interaction model chosen (route model, recorded) | PASS | Spec §Decision locked (2026-07-03); route model implemented |
| Breadcrumb wired into ProjectDetailPage & GoalDetailPage | PASS | Both wired + TaskDetailPage (spec open Q resolved: include Task) |
| Clicking ancestor crumb re-anchors view at that scope | PASS | Navigates to ancestor route; breadcrumb updates on arrival |
| Current scope highlighted (teal active) | PASS | `aria-current="location"` + teal-soft background |
| Deeper ancestor crumbs dim | N/A | Route model: active is always last crumb; no deeper crumbs exist. Dim class retained for future zoom-model use. |
| Zoom-to-context stays on Z key / swipe | PASS | No touch to zoom paths |
| Goal-card hover-implies-clickable nit resolved | PASS | Already not present — ProgressCard renders as `<Link>` when `to` is set (verified) |
| Tests: component test + navigation | PASS | 5 Breadcrumb component tests + 7 navigation tests across Goal/Task pages |
| `wasp compile` clean; suite green | PASS | 43/43 pass |

## Findings

### Applied (in-scope fixes from review)

1. **[BLOCKER → fixed] `kind:permalink` encoding was fragile and unnecessary.**
   Both reviewers independently flagged the `split(":")` pattern: it silently
   depended on a permalink invariant (no colons), and the encode→decode round-trip
   had no benefit. **Fix:** crumb id IS the destination route (e.g.
   `/app/goals/grow-audience`). Handler is now a one-liner: `if (dest !== activeRoute) navigate(dest)`.
   Eliminates the parsing, the special-case handlers, and the latent bug.

2. **[BLOCKER → fixed] Standalone task lost its back affordance.** A task with no
   ancestors showed a single dead crumb (click = no-op) instead of the useful
   `← Back` link. **Fix:** gated the breadcrumb on `crumbs > 1` (at least one
   ancestor); standalone tasks keep the `← Back` fallback.

3. **[CONCERN → fixed] Project with no goal lost its way back to /app/projects.**
   The old `← Projects` link is gone; a no-goal project had no list-escape.
   **Fix:** added a "Projects" list-root crumb (parity with Goal's "Goals" root).
   All three pages now start with their list root.

4. **[CONCERN → fixed] Task/Project breadcrumb paths had zero test coverage.**
   The `split(":")` parsing (now eliminated) lived in untested pages.
   **Fix:** added 5 TaskDetailPage breadcrumb tests covering: both-ancestors,
   goal-only, standalone fallback, goal/project navigation, crumb order.

5. **[CONCERN → fixed] Long task titles wrap and push the topbar taller.**
   **Fix:** added `max-width: 18ch` + ellipsis + `white-space: nowrap` to
   `.aa-breadcrumb__crumb`. Applied in the component CSS so all pages benefit.

### Deferred / rejected

- **Loading-state morph (breadcrumb appears after ← Back):** While data loads,
  the old back link shows; once resolved, it's replaced by the breadcrumb. Both
  reviewers flagged this as mildly jarring. Deferred — the spec's non-goals don't
  address loading states, and a skeleton would add complexity for a transient
  state. The fallback is consistent (shows during load, disappears on resolve).
- **WORKFLOW.md §5 forward-note:** The spec mentions recording the route-model
  decision in WORKFLOW.md §5. That's a Discover-owned doc (Build doesn't edit
  scope docs). The decision is locked in the spec itself; the WORKFLOW cascade
  is Discover's call.

## Verdict

**Ready for sign-off.** All review blockers fixed (route-in-id encoding,
standalone-task fallback, list-root consistency, test coverage, label truncation).
43 tests pass, wasp compile clean, all spec done-conditions met.
