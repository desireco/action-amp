/**
 * Goal lifecycle / edit / delete / reorder cores — ported from the op bodies
 * in `webapp/src/goals/operations.ts` (S6), which were Wasp ops mixing guards
 * with DB work. The entitlement-guard pieces moved to the API wrappers; these
 * cores keep the exact DB shapes and error messages, with the 404/400/409
 * statuses carried by the domain's `HttpError` (../projects/httpError.js).
 */

import { throwHttpStatus } from "../projects/httpError.js";
import type {
  GoalUpdateArgs,
  TaskDelegate,
} from "../db/index.js";
import type { GoalEntities } from "./operationsCore.js";

// ----------------------------------------------------------------
// Lifecycle: complete / reopen a goal (spec §A, §B)
// ----------------------------------------------------------------
// Hygiene, not a power feature — no cap check (the wrapper runs only the
// FREE-Work-lens read invariant via assertLensAllowed BEFORE this core).
// Stamps completedAt on done, clears on reopen. Children are left untouched
// (explicit non-goal — completing a goal does not auto-complete or archive
// its projects/tasks).
export async function setGoalDoneCore(
  entities: Pick<GoalEntities, "Goal">,
  {
    userId,
    id,
    isDone,
    assertLens,
  }: {
    userId: string;
    id: string;
    isDone: boolean;
    // Injected entitlement callback (webapp placement: after the tenancy
    // check, before the write — no cap check, hygiene only).
    assertLens?: (resolvedLensId: string) => Promise<void>;
  },
): Promise<{ id: string }> {
  const goal = await entities.Goal.findUnique({
    where: { id },
    select: { id: true, isDone: true, userId: true, lensId: true },
  });
  if (!goal || goal.userId !== userId) {
    throw new Error("Goal not found.");
  }
  if (assertLens) {
    await assertLens(goal.lensId);
  }
  const next = isDone;
  // No-op when already in the requested state — idempotent.
  if (goal.isDone === next) return { id: goal.id };
  const updateArgs: GoalUpdateArgs = {
    where: { id: goal.id },
    data: { isDone: next, completedAt: next ? new Date() : null },
    select: { id: true },
  };
  const updated = await entities.Goal.update(updateArgs);
  return { id: updated.id };
}

// ----------------------------------------------------------------
// Edit: rename + description (spec §C)
// ----------------------------------------------------------------
// Partial update. name is trimmed + rejected if empty or if it duplicates
// another Goal name for this user (@@unique([userId, name])). description may
// be set to null. The unique-constraint violation (Prisma P2002; at the seam a
// postgres 23505) is rewritten to a 409 the UI can show cleanly.
type GoalUpdateData = { name?: string; description?: string | null };

export async function updateGoalCore(
  entities: Pick<GoalEntities, "Goal">,
  {
    userId,
    id,
    name,
    description,
  }: { userId: string; id: string; name?: string; description?: string },
): Promise<{ id: string; name: string; description: string | null }> {
  const existing = await entities.Goal.findUnique({
    where: { id, userId },
    select: { id: true, name: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Goal not found.");
  }
  const data: GoalUpdateData = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Goal name cannot be empty.");
    data.name = trimmed;
  }
  if (description !== undefined) {
    data.description = description.trim() || null;
  }
  try {
    const updated = await entities.Goal.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, description: true },
    });
    return { id: updated.id, name: updated.name, description: updated.description };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throwHttpStatus(409, `You already have a goal named "${data.name}".`);
    }
    throw e;
  }
}

/**
 * The seam's delegates throw on constraint violations; Prisma surfaced them
 * as `P2002`, postgres as `23505` (unique_violation). Recognize both so the
 * op-layer behavior (webapp parity) holds against the real client and mocks.
 *
 * postgres.js wraps driver errors: the top-level `Error` carries
 * `query`/`params`/`cause`, and the actual Postgres error (with
 * `code: "23505"`) sits on `.cause` — so the check walks the cause chain
 * (depth-bounded) instead of testing only the surface error.
 */
export function isUniqueViolation(e: unknown): boolean {
  let cursor: unknown = e;
  for (let depth = 0; cursor !== null && typeof cursor === "object" && depth < 5; depth += 1) {
    const candidate = cursor as { code?: unknown; cause?: unknown };
    if (candidate.code === "P2002" || candidate.code === "23505") {
      return true;
    }
    cursor = candidate.cause;
  }
  return false;
}

// ----------------------------------------------------------------
// Delete: lossless default (spec §C)
// ----------------------------------------------------------------
// Re-parents child Projects + any legacy direct-goal Tasks to goalId=null
// (same Lens), then deletes the Goal. Neither destroys Tasks or Projects.
// reparentedCount is informational (the confirm copy uses its own count).
//
// DELIBERATE DEVIATION from webapp (documented per the slice contract): the
// webapp op also called `Resource.updateMany({ where: { goalId } })`, but
// `Resource.goalId` was dropped in migration 20260729035108_resources_
// project_owned — against the real Prisma client that call raised a
// validation error (latent bug; no e2e covered goal deletion). Resources are
// project-owned and follow their project; the port OMITS the Resource touch
// and the port's tests cover goal deletion explicitly.
export async function deleteGoalCore(
  entities: Pick<GoalEntities, "Goal" | "Project"> & { Task: Pick<TaskDelegate, "count" | "updateMany"> },
  { userId, id }: { userId: string; id: string },
): Promise<{ id: string; reparentedCount: number }> {
  const existing = await entities.Goal.findUnique({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Goal not found.");
  }
  // Count children for the confirm-copy the UI shows. Returned (not enforced)
  // — the server re-parents unconditionally; this is informational.
  const [projectCount, taskCount] = await Promise.all([
    entities.Project.count({ where: { goalId: existing.id, userId } }),
    entities.Task.count({ where: { goalId: existing.id, userId } }),
  ]);
  await entities.Project.updateMany({
    where: { goalId: existing.id, userId },
    data: { goalId: null },
  });
  await entities.Task.updateMany({
    where: { goalId: existing.id, userId },
    data: { goalId: null },
  });
  await entities.Goal.delete({
    where: { id: existing.id },
    select: { id: true },
  });
  return { id: existing.id, reparentedCount: projectCount + taskCount };
}

// ----------------------------------------------------------------
// Reorder: explicit project sequence under a goal (spec §E)
// ----------------------------------------------------------------
// Writes order = index for each id in `orderedIds`. Tenancy-checked twice:
// the goal must belong to the user, and every id must already be linked to
// that goal (rejects foreign ids / ids from another goal).
export async function reorderGoalProjectsCore(
  entities: Pick<GoalEntities, "Goal" | "Project">,
  {
    userId,
    goalId,
    orderedIds,
  }: { userId: string; goalId: string; orderedIds: string[] },
): Promise<{ goalId: string }> {
  const goal = await entities.Goal.findUnique({
    where: { id: goalId, userId },
    select: { id: true },
  });
  if (!goal) {
    throwHttpStatus(404, "Goal not found.");
  }
  // Verify every id belongs to this goal (tenancy + goalId match). The count
  // must equal orderedIds.length — no foreign ids, no missing ids.
  const belonging = await entities.Project.count({
    where: { id: { in: orderedIds }, goalId: goal.id, userId },
  });
  if (belonging !== orderedIds.length) {
    throwHttpStatus(400, "Every project must belong to this goal.");
  }
  // Write order = index per id. Individual updates (not updateMany with a
  // computed index — Prisma can't express per-row index in one call).
  await Promise.all(
    orderedIds.map((id, index) =>
      entities.Project.update({
        where: { id },
        data: { order: index },
        select: { id: true },
      }),
    ),
  );
  return { goalId: goal.id };
}
