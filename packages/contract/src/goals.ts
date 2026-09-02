/**
 * The goals contract — S6 (surface slices: Goals list + detail).
 *
 * Shapes mirror webapp/src/goals/operationsCore.ts + operations.ts (the parity
 * checklist lives in s6-goals/README.md): list/get/create/update/delete/
 * setDone/reorder. Goals are the organizing layer — Projects (not Tasks) are
 * the unit that supports a Goal, so the payload rolls up project progress and
 * the sequence-ordered `nextProject` (the "Focus:" line; never fabricated —
 * null when the goal has no projects or all are done).
 *
 * Wire conventions match projects.ts (ISO strings for temporals, declared
 * errors): `PAYMENT_REQUIRED` (402) carries `{ feature, reason }` byte-exact
 * ("a 2nd goal" / "link work to more than one outcome with Pro"); 404/409/400
 * messages are the webapp strings (duplicate goal name → 409, same-Lens
 * invariant violations live on the project side).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

import { ProGateErrorMap } from "./projects.js";

const datetime = () => z.string();

/** One linked-project row in the goal payloads. */
export const GoalProjectSchema = z.object({
  id: z.string(),
  permalink: z.string(),
  name: z.string(),
  isDone: z.boolean(),
  /** Per-goal sequence position (goal-planning spec §E). */
  order: z.number().int(),
});

/** List-row slice (getGoalsData's output): rollup progress + Focus line. */
export const GoalSummarySchema = z.object({
  id: z.string(),
  permalink: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  projectCount: z.number().int(),
  /** `Math.round(done/total*100)`, 0 with no projects — "never lies". */
  progress: z.number().int(),
  /** First non-done project in `[order, name]` sequence, or null. */
  nextProject: z
    .object({ id: z.string(), permalink: z.string(), name: z.string() })
    .nullable(),
});

/** Detail slice (getGoalData's output) + per-project task done/total feeds. */
export const GoalDetailSchema = z.object({
  id: z.string(),
  permalink: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isDone: z.boolean(),
  completedAt: datetime().nullable(),
  createdAt: datetime(),
  lensId: z.string(),
  projects: z.array(
    GoalProjectSchema.extend({
      dueDate: datetime().nullable(),
      /** `{ id, isDone }` pairs — the per-project % on the detail page. */
      tasks: z.array(z.object({ id: z.string(), isDone: z.boolean() })),
    }),
  ),
});

/**
 * The lens-scoped ACTIVE goals list (`isDone: false`, name asc).
 * 402 when a FREE user reads a non-included lens.
 */
export const listGoals = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1).optional() }))
  .output(z.array(GoalSummarySchema));

/**
 * One goal by id OR permalink. Missing or foreign → `null` (the page renders
 * "This goal doesn't exist — or isn't yours."). Detail reads are never
 * lens-gated (no-data-loss invariant).
 */
export const getGoal = oc
  .input(z.object({ id: z.string().min(1) }))
  .output(GoalDetailSchema.nullable());

/** Create a goal → `{ id, permalink, name }`. 402 at the FREE cap (1/lens). */
export const createGoal = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      name: z.string(),
      lensId: z.string().min(1).optional(),
      description: z.string().optional(),
    }),
  )
  .output(z.object({ id: z.string(), permalink: z.string(), name: z.string() }));

/** Complete / reopen. Children untouched; idempotent; no cap check. */
export const setGoalDone = oc
  .input(z.object({ id: z.string(), isDone: z.boolean() }))
  .output(z.object({ id: z.string() }));

/**
 * Edit name/description. 409 `You already have a goal named "X".` on the
 * per-user name unique (unlike projects, goal names ARE unique).
 */
export const updateGoal = oc
  .input(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    }),
  )
  .output(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
    }),
  );

/**
 * Lossless delete: child projects + legacy direct-goal tasks re-parent to
 * `goalId = null` (standalone, same lens), then the goal row goes.
 * `reparentedCount` is informational (the confirm copy uses its own count).
 * Deliberate deviation from webapp: the Resource.updateMany on the dropped
 * `goalId` column is omitted (latent bug there — see s6-goals/README.md §2).
 */
export const deleteGoal = oc
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string(), reparentedCount: z.number().int() }));

/** Sequence under a goal: `order = index` for each id (full-array write). */
export const reorderGoalProjects = oc
  .input(z.object({ goalId: z.string(), orderedIds: z.array(z.string()) }))
  .output(z.object({ goalId: z.string() }));

/** The goals namespace — paths: POST /rpc/goals/{list,detail,create,…}. */
export const goalsContract = {
  list: listGoals,
  detail: getGoal,
  create: createGoal,
  setDone: setGoalDone,
  update: updateGoal,
  delete: deleteGoal,
  reorder: reorderGoalProjects,
};
