# Goal Rationale and Work Continuity — Model-friendly Task Queue

> Queue state: **active**. Execution authorized via `duet-execute-plan`
> 2026-08-10.
>
> Product contract:
> [`specs/focus-goal-context.md`](specs/focus-goal-context.md).

## Model recommendation

Current local choices include `gpt-5.6-terra` (balanced agentic coding) and
`gpt-5.6-sol` (frontier agentic coding). Terra fits bounded server, pure helper,
and component tasks. Sol fits final cross-layer and visual verification.

## Execution contract

1. Execute exactly one task id per invocation by default.
2. Read root `AGENTS.md`, `webapp/AGENTS.md` for webapp work, this queue,
   product contract, and listed task inputs before editing.
3. Work on `main`; do not create a branch unless user asks.
4. Inspect `git status --short`. Preserve unrelated changes, including active
   Simple-list Lens work present when this queue was revised.
5. Edit only Allowed paths. If another path becomes necessary, stop and report
   exact dependency instead of widening scope.
6. Run every listed check. Never substitute direct `tsc` for Wasp compile.
7. Do not start/restart dev server, commit, push, deploy, migrate, or mutate
   external systems unless separately authorized.
8. Stop after verification. Do not chain next task automatically.
9. Distinguish focused tests, compile, browser QA, deployment, and product
   acceptance.
10. Queue stays `parked` until user authorizes execution. Authorized executor
    may change it to `active`, claim one dependency-ready task as
    `in_progress`, then record `done` or `blocked` after truthful verification.
    Only user may authorize whole-queue execution. Keep at most one task
    `in_progress`.

HANDOFF:

```text
TASK: FGxx
RESULT: complete | partial | blocked
FILES: exact changed paths
CHECKS: exact commands and results
DEFERRED: intentional later work
NEXT: next dependency-ready task
```

## Queue

### FG01 — Canonical Work-area contract cascade

**Status:** done 2026-08-10 via `duet-execute-plan`. Canonical prose in
`docs/WORKFLOW.md` §2.3 and `docs/PAGES.md` P1+D4 now distinguish matcher "why
now" (shipped), Goal "why at all" (pending), and paused-work continuity (Next
`next` state only), with exact placement, fallback, absence, time arithmetic,
and latest-note behavior. `rg` check + `git diff --check` clean. Uncommitted —
queue contract pt 7 forbids commits pending separate authorization.
**Preferred model:** `gpt-5.6-terra` high  
**Acceptable model:** `gpt-5.6-sol` medium  
**Depends on:** none

**Goal:** canonical docs distinguish matcher rationale, Goal rationale, and
paused-work continuity across Next and Focus.

**Allowed paths:**

- `docs/WORKFLOW.md`
- `docs/PAGES.md`

**Required inputs:**

- `AGENTS.md`
- `docs/specs/focus-goal-context.md`
- `docs/WORKFLOW.md`
- `docs/PAGES.md`
- `docs/specs/done/focus-why-transparent.md`
- `docs/features/focus-mode.md`
- `docs/features/next-what-now.md`

**Required changes:**

- In `docs/WORKFLOW.md` §2.3, lock Goal rationale on Next candidate and Focus,
  plus prior-work continuity only on paused/resumed Next candidates.
- In `docs/PAGES.md`, update P1 Next and D4 Focus with exact placement,
  fallback, absence, time arithmetic, and latest-note behavior.
- Explicitly distinguish matcher “why now” from user-authored Goal “why at all.”
- Preserve Now/Next state machine, implementation status, navigation, schema,
  interaction keymaps, roadmap priority, and unrelated Simple-list edits.

**Verification:**

- `rg -n "Why does this matter|Goal rationale|worked|Latest note|matcher|/do/focus" docs/WORKFLOW.md docs/PAGES.md`
- `git diff --check`

**Stop condition:** canonical prose matches contract. No webapp or
feature-catalog edits.

### FG02 — Shared owned Task context hydration

**Status:** done 2026-08-10 via `duet-execute-plan`. Added pure
`hydrateTopTaskData` core (scoped by userId + id; returns Project→nested Goal,
direct Goal + description, sessions by startedAt, NOTE updates newest-first;
null on race). Wired `getTopTask` to rank then hydrate; extended
`getFocusedTask` project/goal selection. Tests: 118 pass (29 core + 89 ops);
`wasp compile` clean; `git diff --check` clean. Uncommitted — queue contract
pt 7 forbids commits pending separate authorization.
**Preferred model:** `gpt-5.6-terra` high
**Acceptable model:** `gpt-5.6-sol` medium
**Depends on:** `FG01`

**Goal:** one pure hydration core returns owned Goal and history data for the
ranked winner, usable by web Next and CLI without changing matcher ranking.

**Allowed paths:**

- `webapp/src/tasks/operations.ts`
- `webapp/src/tasks/operations.test.ts`
- `webapp/src/tasks/operationsCore.ts`
- `webapp/src/tasks/operationsCore.test.ts`

**Required inputs:**

- `webapp/AGENTS.md`
- `docs/specs/focus-goal-context.md`
- `webapp/src/tasks/operations.ts`
- `webapp/src/tasks/operations.test.ts`
- `webapp/src/tasks/operationsCore.ts`
- `webapp/src/tasks/operationsCore.test.ts`
- `webapp/src/auth/patRoutes.ts`
- `webapp/schema.prisma`

**Required changes:**

- Extend `getFocusedTask` Project selection with nested Goal `id`, `name`, and
  `description`; add `description` to legacy direct Goal selection.
- Keep `getTopTaskData` candidate query, ranking, and return contract unchanged.
- Add a pure winner-hydration core taking authenticated `userId` plus ranked
  Task id. It must query by both values; no caller can hydrate another user's
  Task.
- Wasp `getTopTask` calls rank core, then shared hydration core.
- Hydration returns Project with nested Goal, direct Goal description, sessions
  ordered by start selecting start/end, and NOTE updates newest-first selecting
  count/latest-note inputs.
- Return `null` if ranked row disappears before hydration.
- Do not fetch histories for every candidate. Do not alter matcher fields,
  schema, writes, or Wasp config.
- Add pure-core tests for exact ownership filter, selection shape, and null
  race. Update operation tests for unchanged auth/ranking delegation plus
  hydration call.
- Preserve unrelated `assertLifeAreaLens` edits already present in these paths.

**Verification:**

- `cd webapp && npm test -- src/tasks/operationsCore.test.ts src/tasks/operations.test.ts`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** shared winner hydration and Wasp wiring compile. Do not edit
CLI route/output or presentation helpers yet.

### FG03 — Pure Goal and continuity normalization

**Status:** done 2026-08-10 via `duet-execute-plan`. Created pure
`webapp/src/app/taskContext.ts`: `resolveGoal` (Project→direct→null precedence),
`goalRationale` (described/Toward fallback), `resolveContinuity` (valid
closed-session sum, `<1 min` on raw sub-60s threshold, NOTE-only count,
newest-note selection), `continuityStatsRow` (grammar + zero suppression),
`buildNowContext` (CLI Project/Goal/whyNow/whyItMatters). 41 tests pass;
`git diff --check` clean. No query/JSX/CSS/existing-file edits. Uncommitted —
queue contract pt 7.
**Preferred model:** `gpt-5.6-terra` high
**Acceptable model:** `gpt-5.6-sol` medium
**Depends on:** `FG02`

**Goal:** one pure module resolves Goal precedence, prior-work summary, and
truthful CLI explanation strings without framework dependencies.

**Allowed paths:**

- `webapp/src/app/taskContext.ts` (new)
- `webapp/src/app/taskContext.test.ts` (new)

**Required inputs:**

- `webapp/AGENTS.md`
- `docs/specs/focus-goal-context.md`
- `webapp/schema.prisma` Goal, TaskUpdate, and TaskSession models
- `webapp/src/app/focusTaskView.ts`
- `webapp/src/app/focusWhy.ts`
- `webapp/src/app/focusWhy.test.ts`
- `webapp/src/tasks/operations.ts` `getTopTask` and `getFocusedTask` declarations

**Required changes:**

- Define normalized `GoalContext` and `TaskContinuity` types from contract.
- Resolve Project Goal before legacy direct Goal; trim description and convert
  whitespace-only description to `null`.
- Sum only valid closed sessions where `endedAt > startedAt`; exclude open,
  zero-length, reversed, or invalid dates.
- Format positive sub-minute work as `<1 min worked`; otherwise nearest whole
  minute with correct singular/plural.
- Count valid sessions and trimmed non-empty NOTE updates only. Exclude
  COMPLETED rows and empty NOTE bodies.
- Select newest valid NOTE independent of input ordering and return trimmed body.
- Return null/zero segments without placeholder copy.
- Add pure `buildNowContext` behavior: Project ref, resolved Goal ref, joined
  truthful `composeWhy` result as `whyNow`, and Goal description/fallback as
  `whyItMatters`. It must return null fields rather than placeholder copy.
- Import existing pure `composeWhy`; do not duplicate or change matcher reason
  logic.
- Test described/fallback/precedence/no-Goal cases; duration boundaries;
  malformed/open sessions; pluralization; unordered NOTE selection; empty and
  COMPLETED exclusion; history with only time or only notes; full/partial/null
  CLI context; and a matcher case with no truthful reason.

**Verification:**

- `cd webapp && npm test -- src/app/taskContext.test.ts`
- `git diff --check`

**Stop condition:** pure semantics pass. No query, JSX, CSS, or existing file
edits.

### FG04 — Goal rationale in active Focus

**Status:** done 2026-08-10 via `duet-execute-plan`. Extended `toFocusTask`
(goalContext via shared resolveGoal) and `FocusTask` interface; rendered a
semantic `Goal context` section in FocusMode below the title (described →
question+answer+violet attribution; description-less → Toward fallback, no
attribution; absent → no block). Added `.aa-focus__goal` styles (quiet violet,
no card/icon/link/focus-target). Focus does NOT repeat matcher rationale or
continuity. Tests: 82 pass (5 focusTaskView + 41 taskContext + 36 FocusMode
incl. 5 new Goal cases); `wasp compile` clean; `git diff --check` clean.
Uncommitted — queue contract pt 7.
**Preferred model:** `gpt-5.6-terra` high
**Acceptable model:** `gpt-5.6-sol` medium
**Depends on:** `FG03`

**Goal:** Focus shows quiet Goal rationale without changing execution behavior.

**Allowed paths:**

- `webapp/src/app/focusTaskView.ts`
- `webapp/src/app/focusTaskView.test.ts` (new)
- `webapp/src/components/ui/FocusMode.tsx`
- `webapp/src/components/ui/Overlays.css`
- `webapp/src/components/ui/FocusMode.test.tsx`

**Required inputs:**

- `webapp/AGENTS.md`
- `docs/specs/focus-goal-context.md`
- `docs/DESIGN-SYSTEM.md`
- `webapp/src/styles/tokens.css`
- `webapp/src/app/taskContext.ts`
- `webapp/src/app/focusTaskView.ts`
- `webapp/src/components/ui/FocusMode.tsx`
- `webapp/src/components/ui/Overlays.css`
- `webapp/src/components/ui/FocusMode.test.tsx`

**Required changes:**

- Extend `toFocusTask` input for nested Project Goal and direct Goal, then use
  shared resolver to add optional normalized `goalContext`.
- Extend `FocusTask` with optional Goal context.
- Render semantic `Goal context` immediately after Task title, before Task
  clarification, using exact described/fallback/absent copy.
- Use existing tokens and quiet violet attribution. Add no raw color, card,
  icon, link, animation, focus target, shortcut, matcher reason, or continuity
  summary.
- Add mapping tests for Goal precedence and normalization.
- Add component tests for described, fallback, and absent states while
  preserving all timer, composer, content, action, and keyboard tests.

**Verification:**

- `cd webapp && npm test -- src/app/taskContext.test.ts src/app/focusTaskView.test.ts src/components/ui/FocusMode.test.tsx`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** Focus behavior compiles and focused tests pass. No Next,
browser, or feature-catalog edits.

### FG05 — Goal rationale and prior work on Next

**Status:** done 2026-08-10 via `duet-execute-plan`. NextPage normalizes
goalContext + continuity from the hydrated winner (resolveGoal /
resolveContinuity / continuityStatsRow) and passes presentation values to
NextCard only in the `next` state. NextCard renders a semantic `Goal and
previous work` section after the matcher rationale: Goal block (described →
question+answer+violet attribution; description-less → Toward; absent → none)
and continuity (stats row + optional two-line `Latest note` preview). Zero
segments suppressed; `now` state shows neither. CSS: violet attribution,
tabular-nums stats, -webkit-line-clamp 2. Tests: 62 pass (41 taskContext + 21
NextCard incl. 13 new); `wasp compile` clean; `git diff --check` clean.
Uncommitted — queue contract pt 7.
**Preferred model:** `gpt-5.6-terra` high
**Acceptable model:** `gpt-5.6-sol` medium
**Depends on:** `FG04`

**Goal:** Next candidate shows purpose and restart context while fresh and Now
states stay uncluttered.

**Allowed paths:**

- `webapp/src/app/NextPage.tsx`
- `webapp/src/components/ui/NextCard.tsx`
- `webapp/src/components/ui/NextCard.css`
- `webapp/src/components/ui/NextCard.test.tsx`

**Required inputs:**

- `webapp/AGENTS.md`
- `docs/specs/focus-goal-context.md`
- `docs/DESIGN-SYSTEM.md`
- `webapp/src/styles/tokens.css`
- `webapp/src/app/taskContext.ts`
- `webapp/src/app/focusWhy.ts`
- `webapp/src/app/NextPage.tsx`
- `webapp/src/components/ui/NextCard.tsx`
- `webapp/src/components/ui/NextCard.css`
- `webapp/src/components/ui/NextCard.test.tsx`

**Required changes:**

- In `NextPage`, normalize Goal and continuity from hydrated winner and pass
  presentation values to `NextCard`.
- Keep `composeWhy` call and why/whyEmphasis mapping unchanged.
- Render Goal block only in `state="next"`, after existing matcher rationale.
- Render continuity only in `state="next"` and only with valid time/session/note
  history. Show non-zero stats in specified order and correct grammar.
- Show only latest NOTE under `Latest note`, passive plain text, clamped to two
  lines. No markdown interaction, link, editor, disclosure, or full thread.
- Render no empty block, zero stats, or prompt for fresh/no-Goal Tasks.
- Preserve Start, Not now, Now/Pause, loading, snooze, lens identity, and
  matcher behavior.
- Add component tests for Goal described/fallback/absent, combined stats, time-
  only, notes-only, latest-note preview, zero suppression, fresh state, and Now
  suppression.

**Verification:**

- `cd webapp && npm test -- src/app/taskContext.test.ts src/components/ui/NextCard.test.tsx`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** Next component contract compiles and focused tests pass. No
query, Focus, browser, or feature-catalog edits.

### FG06 — CLI `now` Project, Goal, and why context

**Status:** done 2026-08-10 via `duet-execute-plan`. cliNow now hydrates the
ranked winner (hydrateTopTaskData) and builds additive `context` server-side
(buildNowContext); returns `{task, context}` for a Task, `{task: null,
context: null, reason}` for empty/race. Raw ranked Task stays in `task`;
sessions/updates not serialized. CLI types.ts gained nullable `NowContext`;
now.ts human output is a labeled block (Task first, then available Project/
Goal/Why now/Why it matters, omitted when unavailable); `--json` is the direct
server result. now.test.ts (13 cases) + cli build + webapp tests (70) + wasp
compile + git diff --check all clean. Uncommitted — queue contract pt 7.
**Preferred model:** `gpt-5.6-terra` high
**Acceptable model:** `gpt-5.6-sol` medium
**Depends on:** `FG05`

**Goal:** `actionamp now` emits calm human context and stable additive JSON for
Project, Goal, matcher reason, and Goal rationale.

**Allowed paths:**

- `webapp/src/auth/patRoutes.ts`
- `cli/src/types.ts`
- `cli/src/commands/now.ts`
- `cli/src/commands/now.test.ts` (new)
- `cli/README.md`

**Required inputs:**

- `AGENTS.md`
- `webapp/AGENTS.md`
- `docs/specs/focus-goal-context.md`
- `cli/README.md`
- `cli/src/types.ts`
- `cli/src/commands/now.ts`
- `cli/src/commands/task.test.ts`
- `cli/src/output.ts`
- `webapp/src/auth/patRoutes.ts`
- `webapp/src/tasks/operationsCore.ts`
- `webapp/src/app/taskContext.ts`
- `webapp/src/app/focusWhy.ts`

**Required changes:**

- In `cliNow`, keep lens resolution, entitlement gates, and `getTopTaskData`
  ranking. Hydrate ranked winner through shared owned core from `FG02`.
- Build server-side context through pure helper from `FG03`; accept no context
  input from client.
- Return `{ task, context }` for a Task and `{ task: null, context: null,
  reason }` for empty states. Preserve existing task/reason meanings.
- Return raw ranked Task in `task`; do not serialize hydrated sessions or
  updates.
- Extend standalone CLI `NowResult` with exact nullable context type. Preserve
  unrelated Lens-type edits already present in `cli/src/types.ts`.
- Change human `now` output only to exact line-oriented contract: Task first,
  then available Project, Goal, Why now, Why it matters. Omit unavailable lines.
- Keep `--json` as direct server result; do not rebuild or rename context in
  CLI client.
- Add new command tests following existing mocked-request/stdout pattern for:
  full context, Project-only, Goal-only, no matcher reason, null Task reasons,
  exact JSON context, active/explicit Lens request, and no placeholder lines.
- Update `cli/README.md` command description and exact JSON shape.
- No direct focused `patRoutes.ts` harness exists. Cover context semantics in
  `taskContext.test.ts`, command behavior in new CLI test, Wasp compile here,
  and live API/CLI integration in `FG07`.
- Do not change `formatTask` globally; Task show/Today output stay unchanged.

**Verification:**

- `cd cli && npm test -- src/commands/now.test.ts`
- `cd cli && npm run build`
- `cd webapp && npm test -- src/app/taskContext.test.ts src/tasks/operationsCore.test.ts`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** CLI unit/build and Wasp compile pass with documented
additive response. No browser, live API call, or feature-catalog edits.

### FG07 — Cross-layer, CLI, and visual verification

**Status:** done (automated) 2026-08-10 via `duet-execute-plan`. All focused
webapp tests pass (221: operationsCore 29, operations 89, taskContext 41,
focusTaskView 5, FocusMode 36, NextCard 21) + CLI now.test.ts (13) + cli build
+ wasp compile + git diff --check clean. e2e/next.spec.ts needs no change
(additive Goal/continuity content doesn't appear in the freshly-triaged-task
flow the suite exercises). Feature docs updated with exact evidence
(focus-mode.md, next-what-now.md, cli.md). NOT claimed: browser visual QA and
live `actionamp now` CLI QA — these require an authorized running dev server,
which queue contract pt 7 forbids starting; record as incomplete, not as
acceptance. Uncommitted — queue contract pt 7.
**Preferred model:** `gpt-5.6-sol` high
**Acceptable model:** `gpt-5.6-terra` high
**Depends on:** `FG06`

**Goal:** verify complete web and CLI context behavior, then update
code-verified feature docs truthfully.

**Allowed paths:**

- `docs/features/focus-mode.md`
- `docs/features/next-what-now.md`
- `docs/features/cli.md`
- `webapp/e2e/next.spec.ts` only if existing assertion must change for additive,
  passive content

**Required inputs:**

- `AGENTS.md`
- `webapp/AGENTS.md`
- `docs/specs/focus-goal-context.md`
- `docs/focus-goal-context-task-queue.md`
- `docs/WORKFLOW.md`
- `docs/PAGES.md`
- `docs/features/focus-mode.md`
- `docs/features/next-what-now.md`
- `docs/features/cli.md`
- `webapp/src/tasks/operations.ts`
- `webapp/src/tasks/operations.test.ts`
- `webapp/src/tasks/operationsCore.ts`
- `webapp/src/tasks/operationsCore.test.ts`
- `webapp/src/app/taskContext.ts`
- `webapp/src/app/taskContext.test.ts`
- `webapp/src/app/focusTaskView.ts`
- `webapp/src/app/focusTaskView.test.ts`
- `webapp/src/components/ui/FocusMode.tsx`
- `webapp/src/components/ui/Overlays.css`
- `webapp/src/components/ui/FocusMode.test.tsx`
- `webapp/src/app/NextPage.tsx`
- `webapp/src/components/ui/NextCard.tsx`
- `webapp/src/components/ui/NextCard.css`
- `webapp/src/components/ui/NextCard.test.tsx`
- `webapp/src/auth/patRoutes.ts`
- `cli/README.md`
- `cli/src/types.ts`
- `cli/src/commands/now.ts`
- `cli/src/commands/now.test.ts`
- `webapp/e2e/next.spec.ts`

**Required changes:**

- Run focused server, pure, Focus, Next, and CLI tests together; run both builds.
- With already-running confirmed ActionAmp dev server, or separate user
  authorization to start one, inspect desktop and mobile for: described Goal,
  description-less Goal, no Goal, fresh Task, paused Task with multiple
  sessions/notes, notes-only history, and home Now state.
- Verify hierarchy, two-line note clamp, minute/count grammar, wrapping, scroll,
  Start/Not now/Pause/Escape, no zero rows, and unchanged matcher reason.
- Against an already-running authorized app, run `actionamp now` or equivalent
  CLI dev command for: full Project+Goal context, Project-only, direct Goal,
  matcher reason absent, and no Task. Verify human labels and JSON nullability.
- Confirm API/CLI output contains no sessions or updates and still respects
  active/explicit Lens plus entitlement boundaries.
- Do not weaken evidence setup. If all states cannot be produced, report visual
  QA incomplete.
- Touch `webapp/e2e/next.spec.ts` only when additive content breaks existing
  assertion. Do not add broad setup machinery.
- Update all three feature docs only after matching checks. Record browser,
  live CLI, focused tests, Wasp compile, and CLI build separately.
- Do not claim deployment or product acceptance.

**Verification:**

- `cd webapp && npm test -- src/tasks/operationsCore.test.ts src/tasks/operations.test.ts src/app/taskContext.test.ts src/app/focusTaskView.test.ts src/components/ui/FocusMode.test.tsx src/components/ui/NextCard.test.tsx`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `cd cli && npm test -- src/commands/now.test.ts`
- `cd cli && npm run build`
- `cd webapp && npx playwright test e2e/next.spec.ts` only when authorized app
  and Playwright web-server contract are available
- `git diff --check`

**Stop condition:** automated checks pass and feature docs state exact evidence.
If required visual or live CLI states remain uninspected, record partial result;
do not claim visual, API, or CLI acceptance.

## Dependency graph

```text
FG01 canonical docs
  -> FG02 shared winner hydration
    -> FG03 pure context semantics
      -> FG04 Focus Goal rationale
        -> FG05 Next Goal + continuity
          -> FG06 CLI Goal + why output
            -> FG07 cross-layer + live verification
```

All tasks are serial. Query shape feeds pure normalization; normalization feeds
both UI surfaces; final audit follows both. No parallel-safe tasks claimed.

## Done-condition coverage

- Canonical distinction and placement: `FG01`
- Owned winner hydration shared by web and CLI: `FG02`
- Goal precedence, time arithmetic, NOTE filtering, grammar, CLI context: `FG03`
- Focus rationale and regression protection: `FG04`
- Next rationale, continuity, latest note, state suppression: `FG05`
- CLI API, human/JSON output, docs, unit/build verification: `FG06`
- Integrated tests/builds, responsive and live CLI QA, truthful feature docs:
  `FG07`
