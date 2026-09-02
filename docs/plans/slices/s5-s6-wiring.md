# S5+S6 wiring — Projects & Goals on the new stack

Slice batch: **S5 (Projects) + S6 (Goals)**. Deliverables landed as fragments
plus this note; nothing outside the slice's own files was redesigned. Everything
below is what the integrator (or the current tree) needs to make the batch live.

## 1. Composition lines

Per-surface fragments implement their own contract fragment
(`implement(projectsContract)` / `implement(goalsContract)`), so parallel
slices never edit shared composition. The one-line compositions are:

**`packages/contract/src/router.ts`**

```ts
import { projectsContract } from "./projects.js";
import { goalsContract } from "./goals.js";

export const contractRouter = {
  // …existing surfaces…
  projects: projectsContract,
  goals: goalsContract,
};
```

**`apps/api/src/router.ts`**

```ts
import { projectsProcedures } from "./procedures/projects.js";
import { goalsProcedures } from "./procedures/goals.js";

export const router = {
  // …existing surfaces…
  projects: projectsProcedures,
  goals: goalsProcedures,
};
```

Status: these lines were applied and verified during this batch's e2e gate
(the S1–S4 integrator merged around them; they are in the tree now). The
fragments themselves never edit composition — if they are ever reverted, the
two lines above are the whole integration.

**`packages/contract/src/index.ts`** — additive exports of the slice's own
schemas only (already applied):

```ts
export { goalsContract, GoalDetailSchema, GoalProjectSchema, GoalSummarySchema } from "./goals.js";
export {
  projectsContract,
  ProjectDetailSchema, ProjectDetailTaskSchema, ProjectResourceSchema,
  ProjectSummarySchema, ProjectTypeSchema, ProGateErrorMap,
} from "./projects.js";
```

**`packages/domain/package.json`** — additive export maps (already applied):
`"./projects": "./src/projects/index.ts"`, `"./goals": "./src/goals/index.ts"`.

## 2. Contract surface (wire paths)

- `/rpc/projects/*`: `list, create, detail, createTask, setDone, archive,
  move, update, delete, updateTask, moveTargets, setTaskStatus, startTask`
- `/rpc/goals/*`: `list, detail, create, setDone, update, delete, reorder`

Declared errors (clients branch on `err.code`): `PAYMENT_REQUIRED` (402, data
`{feature, reason}` byte-exact from webapp), `NOT_FOUND` (404), `CONFLICT`
(409 duplicate goal/project name), `BAD_REQUEST` (structural 400s, e.g.
same-Lens invariant). `ProGateErrorMap` (projects.ts) is shared by the goals
fragment.

## 3. Deliberate deviations (reviewed, not drift)

1. **`deleteGoal` omits `Resource.updateMany`** — webapp's op touches the
   dropped `Resource.goalId` column (latent runtime bug; resources are
   project-owned since 2026-07-29). The port re-parents Projects + legacy
   direct-goal Tasks only. Unit test pins it
   (`src/goals/lifecycleCore.test.ts`, "CORRECTED PORT").
2. **`lensId` optional on list/create** — absent, the server resolves the
   user's primary lens (`tasks.list` precedent). The active-lens picker is a
   later slice; no client-side lens state exists yet.
3. **Resources section not rendered** — S9's surface. The project detail
   payload already carries `resources`, so the section drops in without a
   contract change. Server-side resources ops (create/update/delete) are not
   in this batch's contract.
4. **`projects.moveTargets`** — temporary stand-in for the lenses contract
   (S11): returns the other lenses for the Move picker. Retire when a lenses
   surface composes.
5. **`projects.setTaskStatus` / `projects.startTask`** — the project page's
   horizon moves + Start button need them; the procedures call the
   already-ported `updateTaskStatusCore` / `startTaskCore`. Retire when a
   tasks-mutations namespace (S4/S1 follow-up) composes.
6. **Mobile Edit-in-menu skipped** — the ⋯ menu carries Move / Complete /
   Reopen / Archive / Delete; `Edit` renders unconditionally (the webapp's
   `useMediaQuery` split is cosmetic and the desktop bar is the parity
   target).
7. **Seed grants the dev user PRO** (`apps/api/src/seed-projects.ts`) — the
   FREE caps are lifetime per-lens counts; e2e reruns would strand on the 402
   gate. Cap behavior is unit-tested at the domain layer
   (`assertUnderCap`, byte-exact copy).

## 4. e2e

`apps/web/e2e/project-detail.spec.ts` + `goal-planning.spec.ts` (ported from
`webapp/e2e/`). Adaptations, behavior identical:

- fresh signups → `loginAs(DEV_EMAIL)` (seeded Me lens + PRO grant);
- triageOneItem → direct `/rpc/projects/create`;
- per-run name suffixes (project names are not unique; goal names are);
- webapp case 3 (decline from the task page) is `test.fixme` — "Mark as
  won't do" lives on S4's `/do/tasks` page;
- webapp goal steps 6–7 (Logbook row + Reopen) are `test.fixme` — S8's
  `/do/logbook` surface. Reopen drives the same `/rpc/goals/set-done` the
  Complete step exercises.

Run book (before first run of the suite on a fresh dev DB):

```
cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed.ts
cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-projects.ts
# API:  cd apps/api && DATABASE_URL=… NODE_ENV=development bun --hot src/index.ts
# Web:  cd apps/web && bunx vite dev --port 5174
cd apps/web && bunx playwright test e2e/project-detail.spec.ts e2e/goal-planning.spec.ts
```

`seed-projects.ts` is idempotent, localhost-only, and never touches
`seed.ts`.

## 5. Keyboard note

The global keyset is S4's shell concern; this slice ships forms + nav keys
only (Enter submits, Esc cancels composers/dialogs). The SIMPLE_LIST keyset
(`n j k space e Delete Esc`) belongs to S4's `SimpleListChecklist`, which this
slice's `[permalink]` route hosts unchanged for SIMPLE_LIST projects.
