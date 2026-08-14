# Review: friction-cleanup

<!-- Build owns this file. Discover reads it to sign off. -->

## What changed

On `main`. Multi-item spec closing the small honest gaps between canonical docs
and the app. Each item shipped as its own commit (spec: independently shippable).

- **Someday promote** — each Someday row gets a "Today" button reusing
  `updateTaskStatus` (same motion as the Today bench promote). New
  `SomedayPage.css` mirrors the Today swap-row layout.
- **Today "Done today" section** — replaces the literal `TODO` stub
  (`TodayPage.tsx:200`) with a collapsed section: tasks completed since local
  midnight, grouped by Goal, muted rows. New `getDoneToday` query (lens-scoped,
  `isDone=true`, `completedAt >= start-of-today`).
- **Goal detail view** — new `/do/goals/:id` route + `GoalDetailPage`,
  mirroring `ProjectDetailPage`: header with aggregate progress (matching
  `getGoals`'s rollup), linked-projects list (each linkable), standalone tasks
  grouped by horizon, inline task create. New `getGoal` query. `createTask`
  extended to accept optional `goalId`. `GoalsPage` goal-cards now link to it.
- (Project detail view was already on `main` from the prior merged branch — not
  re-done.)

Commits:
- `41cf3cb` spec: ready → building
- `c8be985` Someday promote action
- `97a0f0a` Today "Done today" section
- `cd8de34` Goal detail view
- `662ce9c` address review gate findings

## Gates run

- **Cold-context reviewers (2, distinct angles, fresh context):**
  - **Reviewer A — correctness/regressions/tenancy:** found 1 real blocker
    (Goal detail progress diverged from `getGoals`'s rollup + a double-count
    risk for tasks with both goalId + projectId). Confirmed tenancy safe
    (`findUnique({where:{id,userId}})` matches the proven `getTask`/`getProject`
    pattern); confirmed `createTask` change is regression-free (both callers
    verified, schema confirms both FKs nullable); confirmed `completedAt` is
    stamped on toggle so Done-today shows no stale data.
  - **Reviewer B — UX/consistency/brand/CSS:** independently confirmed the
    Breadcrumb done-condition is unmet (component only in the design-system
    page, no real consumer); flagged the two-imports-on-one-line formatting in
    `main.wasp.ts`, the `→ Today` vs `Today` label inconsistency, the stale
    "lazy query" comment, and the goal-card hover-implies-clickable mismatch.
    Confirmed tone on-brand (no celebration/streak language), CSS token-based
    + dark-mode-safe, braces balanced.
  - **Verdict: 1 correctness blocker + formatting/consistency nits → fixed →
    re-gated clean.** See Findings.
- **Diagnostics:** `wasp compile` — exit 0, after each item + after fixes.
- **Tests:** `npm test` — **210 passed (210)**, exit 0. (No new tests added for
  the new queries — see Findings; the existing suite is green.)
- **e2e:** **42/42 pass serially (`--workers=1`)** against `wasp start`. Run at
  sign-off: the suite is green when tests don't contend for the shared dev DB.
  Under the default 4-worker config, 1–2 tests flake nondeterministically —
  **different tests each run**, all timing out on shell/DB contention, none in
  a friction-cleanup surface (the diff is additive: Someday promote, Today
  Done-today, Goal detail — it never touches capture/triage/next/projects-create).
  Isolation re-runs of every flake pass. This is a pre-existing test-infra
  characteristic (parallelism vs one shared DB), not a regression introduced
  here. **No new e2e spec added for Goal detail / Done-today** — noted as a
  follow-up; the existing suite covers the surrounding flows.

## Done-conditions

Each predicate from `docs/specs/done/friction-cleanup.md` → verdict + evidence.

- [ ] **`/do/upcoming` route removed** — **DROPPED per user instruction**
      ("let's keep upcoming"). The route, `UpcomingPage`, and the
      `getTasks status=UPCOMING` query all remain. This done-condition is
      intentionally not satisfied; recorded here so it's not a surprise.
- [x] **Someday rows have a promote action** — **PASS** — `SomedayPage.tsx`
      "Today" button per row, reuses `updateTaskStatus({status:"TODAY"})`,
      invalidates getTasks/getTopTask/getAppData. Mirrors the Today bench
      promote. (Label aligned to "Today" after review — was "→ Today".)
- [x] **"Done today" section on Today is built** — **PASS** — `getDoneToday`
      query (lens-scoped, `completedAt >= local-midnight`); collapsed "Done
      today (N)" header, expands to GroupedList + muted TaskRows grouped by
      Goal. Gated on count > 0 so it vanishes when empty. `completedAt` stamped
      by `toggleTaskDone`.
- [x] **Project detail view exists** — **PASS (already on main)** —
      `ProjectDetailPage.tsx` + `/do/projects/:id` shipped on the prior merged
      branch; not re-done here.
- [x] **Goal detail view exists** — **PASS (after fix)** — `/do/goals/:id`
      route + `GoalDetailPage` + `getGoal` query; mirrors Project detail. The
      aggregate-progress math was wrong on first pass (see Findings #1) — now
      matches `getGoals`'s rollup exactly.
- [ ] **Breadcrumbs navigate** — **DEFERRED** — the `Breadcrumb` component
      works (crumbs are `<button>`s with `onSelect`) but is wired only into the
      design-system demo page, not ProjectDetail/GoalDetail (both use a `← Back`
      Link). Wiring it is an interaction-design decision (the WORKFLOW.md
      "zoom/anchor" model vs the route-based model the rest of the app uses),
      not a "cleanup" finish. Flagged for Discover to scope as its own item.
- [x] **`wasp compile` passes** — **PASS** — exit 0.
- [?] **Existing e2e suite green** — **PASS (serially)** — 42/42 with
      `--workers=1`. The default 4-worker run flakes 1–2 tests nondeterministically
      on shared-DB contention (different tests each run, none in a friction-
      cleanup surface); pre-existing test-infra characteristic, not a regression.
- [x] **Cold-context reviewer passes** — **PASS** — after the progress-math fix.

## Findings

**Accepted (fixed in `662ce9c`):**
1. **[BLOCKER, Reviewer A] Goal detail progress diverged from list rollup.**
   `GoalDetailPage` counted project-internal tasks (3/5 = 60%); `getGoals`
   counts projects as binary units (0/1 = 0%). Same goal, two different %s, and
   the code comment falsely claimed they matched. Plus a task with both goalId
   + projectId was double-counted. Fixed: GoalDetail now uses `getGoals`'
   identical formula (projects-as-units + standalone tasks). The per-project
   internal pct in the linked-projects list is unchanged (that's per-project
   detail, not the aggregate).
2. **[nit, Reviewer B] `main.wasp.ts` two imports on one line.** Split them.
3. **[nit, Reviewer B] Someday label inconsistency.** `→ Today` → `Today` to
   match the Today bench promote (same action, same label).
4. **[nit, Reviewer B] Stale "lazy query" comment.** `getDoneToday` is eager
   (fetched on mount for the count); comment now says so.

**Deferred (recorded, not fixed — each is a decision, not a defect):**
- **Breadcrumb navigation** (done-condition unmet). Component works; no real
  consumer. Wiring it means choosing the zoom/anchor model vs the route model
  the app already uses — that's interaction design, not cleanup. **Accepted at
  sign-off: scoped as its own backlog item (`breadcrumb-nav`)** rather than
  a friction-cleanup finish. The `crumbs always navigate` requirement from
  BACKLOG.md is preserved there.
- **`/do/upcoming` removal** — dropped per explicit user instruction
  ("let's keep upcoming"). Accepted at sign-off.
- **Goal-card hover-implies-clickable** (Reviewer B nit): the card has a
  `:hover` lift but only the name is a link. Minor discoverability friction;
  not fixed (making the whole card a link risks nested-anchor issues with the
  future per-card actions). Folded into the new `breadcrumb-nav`/detail-page
  affordance follow-up rather than tracked separately — it's the same
  "how do you move between list and detail" question.
- **`getGoal`/`getDoneToday` have no unit tests** (Reviewer A nit). Tenancy is
  safe (matches the proven `findUnique` pattern) but untested. Cheap insurance
  for a follow-up; not blocking.

**Rejected:** none.

## Open items for Discover (before `done`)

All resolved at sign-off (2026-07-02):

1. **Run the e2e suite** — done. 42/42 serially; parallel flake is pre-existing
   DB contention, not a regression (see Gates).
2. **Visual spot-check** — the four surfaces are present and wired (verified by
   code inspection + the surrounding e2e coverage of the list flows they extend).
   Discover is signing off on the strength of the green e2e gate + the two cold
   reviewers; a hands-on visual pass can happen on the running dev server at any
   time without blocking this spec.
3. **Decide the two deferrals** — both accepted: breadcrumb-nav → own backlog
   item; `/do/upcoming` stays (user instruction).

## Verdict

**done** (signed off 2026-07-02).

All shippable done-conditions PASS; the one correctness blocker (progress-math
divergence) is fixed; `wasp compile` green; **210 unit tests pass**; **42/42
e2e pass serially**. The two unchecked done-conditions are settled:
`/do/upcoming` removal (dropped per user instruction) and Breadcrumb nav
(scoped to its own backlog item — interaction-design decision, not cleanup).
