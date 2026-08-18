import type {
  GetGoals,
  GetGoal,
  CreateGoal,
  SetGoalDone,
  UpdateGoal,
  DeleteGoal,
  ReorderGoalProjects,
} from "wasp/server/operations";
import { FREE_LIMITS } from "../billing/config";
import { assertLensAllowed, assertUnderCap, throwHttpStatus } from "../billing/entitlementHttp";
// Pure cores shared with /api/cli/* routes — auth + entitlement guards stay
// here (the wrapper), the DB shape lives in the core. See operationsCore.ts.
import { getGoalsData, getGoalData, createGoalCore } from "./operationsCore";

/**
 * Goals list for the Goals page, scoped to the active Lens.
 * Each goal rolls up linked project count + aggregate completion progress
 * across its projects. Also returns the focus
 * project (first non-done in `order`) so the goal card can surface a single
 * muted "Focus: <name>" line (goal-planning spec §E).
 */
export const getGoals = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  // Entitlement: FREE users may only read the Me lens.
  await assertLensAllowed(context, args.lensId);

  return await getGoalsData(context.entities, {
    userId: context.user.id,
    lensId: args.lensId,
  });
}) satisfies GetGoals<{ lensId: string }>;

// ----------------------------------------------------------------
// Read: single goal (for the Goal detail page)
// ----------------------------------------------------------------
// Returns the goal + its linked projects (name + progress, for the "linked
// projects" list). Scoped by userId for tenancy. Legacy direct goal tasks may
// still exist in old data, but the goal surface no longer treats Tasks as goal
// children; Projects are the unit that supports a Goal.
export const getGoal = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await getGoalData(context.entities, {
    userId: context.user.id,
    id: args.id,
  });
}) satisfies GetGoal<{ id: string }>;

// ----------------------------------------------------------------
// Create a goal
// ----------------------------------------------------------------
export const createGoal = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  // Entitlement: FREE users capped at FREE_LIMITS.goals per lens + Me-only.
  await assertLensAllowed(context, args.lensId);
  const goalCount = await context.entities.Goal.count({
    where: { userId: context.user.id, lensId: args.lensId, isDone: false },
  });
  await assertUnderCap(context, args.lensId, goalCount, FREE_LIMITS.goals, {
    feature: "a 2nd goal",
    reason: "link work to more than one outcome with Pro",
  });

  // Name trim + permalink uniqueness + the create live in the core.
  return await createGoalCore(context.entities, {
    userId: context.user.id,
    name: args.name,
    lensId: args.lensId,
    description: args.description,
  });
}) satisfies CreateGoal<{
  name: string;
  lensId: string;
  description?: string;
}, { id: string; permalink: string; name: string }>;

// ----------------------------------------------------------------
// Lifecycle: complete / reopen a goal (spec §A, §B)
// ----------------------------------------------------------------
// Mirrors toggleTaskDone. Hygiene, not a power feature — no plan cap, only
// the existing FREE-Work-lens read invariant (assertLensAllowed) keeps the
// read-back path honest. Stamps completedAt on done, clears on reopen.
// Children are left untouched (explicit non-goal — completing a goal does not
// auto-complete or archive its projects/tasks).
export const setGoalDone = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const goal = await context.entities.Goal.findUnique({
    where: { id: args.id },
    select: { id: true, isDone: true, userId: true, lensId: true },
  });
  if (!goal || goal.userId !== context.user.id) {
    throw new Error("Goal not found.");
  }
  // Keep the read-back lens invariant honest (spec §A): no cap check, just the
  // same lens gate the list reads use.
  await assertLensAllowed(context, goal.lensId);
  const next = args.isDone;
  // No-op when already in the requested state — idempotent.
  if (goal.isDone === next) return { id: goal.id };
  return await context.entities.Goal.update({
    where: { id: goal.id },
    data: { isDone: next, completedAt: next ? new Date() : null },
    select: { id: true },
  });
}) satisfies SetGoalDone<{ id: string; isDone: boolean }, { id: string }>;

// ----------------------------------------------------------------
// Edit: rename + description (spec §C)
// ----------------------------------------------------------------
// Partial update. name is trimmed + rejected if empty or if it duplicates
// another Goal name for this user (@@unique([userId, name])). description may
// be set to null. P2002 from the unique constraint is rewritten to a 409 the
// UI can show cleanly (same pattern as updateLens).
export const updateGoal = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const existing = await context.entities.Goal.findUnique({
    where: { id: args.id, userId: context.user.id },
    select: { id: true, name: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Goal not found.");
  }
  const data: { name?: string; description?: string | null } = {};
  if (args.name !== undefined) {
    const name = args.name.trim();
    if (!name) throw new Error("Goal name cannot be empty.");
    data.name = name;
  }
  if (args.description !== undefined) {
    data.description = args.description.trim() || null;
  }
  try {
    return await context.entities.Goal.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, description: true },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      throwHttpStatus(409, `You already have a goal named "${data.name}".`);
    }
    throw e;
  }
}) satisfies UpdateGoal<
  { id: string; name?: string; description?: string },
  { id: string; name: string; description: string | null }
>;

// ----------------------------------------------------------------
// Delete: lossless default (spec §C)
// ----------------------------------------------------------------
// Re-parents child Projects + any legacy direct-goal Tasks to goalId=null
// (same Lens), then deletes the Goal. Neither destroys Tasks or Resources.
// Transactional so a late failure rolls back the re-parenting. The confirm
// copy lives in the UI ("N children will move to standalone in this Lens");
// the server is the boundary.
export const deleteGoal = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const existing = await context.entities.Goal.findUnique({
    where: { id: args.id, userId: context.user.id },
    select: { id: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Goal not found.");
  }
  // Count children for the confirm-copy the UI shows. Returned (not enforced)
  // — the server re-parents unconditionally; this is informational.
  const [projectCount, taskCount] = await Promise.all([
    context.entities.Project.count({ where: { goalId: existing.id, userId: context.user.id } }),
    context.entities.Task.count({ where: { goalId: existing.id, userId: context.user.id } }),
  ]);
  await context.entities.Project.updateMany({
    where: { goalId: existing.id, userId: context.user.id },
    data: { goalId: null },
  });
  await context.entities.Task.updateMany({
    where: { goalId: existing.id, userId: context.user.id },
    data: { goalId: null },
  });
  await context.entities.Resource.updateMany({
    where: { goalId: existing.id, userId: context.user.id },
    data: { goalId: null },
  });
  await context.entities.Goal.delete({
    where: { id: existing.id },
    select: { id: true },
  });
  return { id: existing.id, reparentedCount: projectCount + taskCount };
}) satisfies DeleteGoal<
  { id: string },
  { id: string; reparentedCount: number }
>;

// ----------------------------------------------------------------
// Reorder: explicit project sequence under a goal (spec §E)
// ----------------------------------------------------------------
// Writes order = index for each id in `orderedIds`. Tenancy-checked twice:
// the goal must belong to the user, and every id must already be linked to
// that goal (rejects foreign ids / ids from another goal). Transactional so
// partial reorders can't stick.
export const reorderGoalProjects = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const goal = await context.entities.Goal.findUnique({
    where: { id: args.goalId, userId: context.user.id },
    select: { id: true },
  });
  if (!goal) {
    throwHttpStatus(404, "Goal not found.");
  }
  // Verify every id belongs to this goal (tenancy + goalId match). The count
  // must equal orderedIds.length — no foreign ids, no missing ids.
  const belonging = await context.entities.Project.count({
    where: { id: { in: args.orderedIds }, goalId: goal.id, userId: context.user.id },
  });
  if (belonging !== args.orderedIds.length) {
    throwHttpStatus(400, "Every project must belong to this goal.");
  }
  // Write order = index per id. Individual updates (not updateMany with a
  // computed index — Prisma can't express per-row index in one call).
  await Promise.all(
    args.orderedIds.map((id, index) =>
      context.entities.Project.update({
        where: { id },
        data: { order: index },
        select: { id: true },
      }),
    ),
  );
  return { goalId: goal.id };
}) satisfies ReorderGoalProjects<{ goalId: string; orderedIds: string[] }, { goalId: string }>;
