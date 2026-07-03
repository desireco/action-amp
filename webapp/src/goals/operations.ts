import type { GetGoals, GetGoal, CreateGoal } from "wasp/server/operations";
import { FREE_LIMITS } from "../billing/config";
import { assertLensAllowed, assertUnderCap } from "../billing/entitlementHttp";

/**
 * Goals list for the Goals page, scoped to the active Lens.
 * Each goal rolls up: linked project count + standalone task count + aggregate
 * completion progress across all its projects + tasks.
 */
export const getGoals = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  // Entitlement: FREE users may only read the Me lens.
  await assertLensAllowed(context, args.lensId);

  const goals = await context.entities.Goal.findMany({
    where: {
      userId: context.user.id,
      lensId: args.lensId,
      isDone: false,
    },
    orderBy: [{ name: "asc" }],
    include: {
      projects: { select: { id: true, name: true, isDone: true } },
      tasks: { select: { id: true, isDone: true } },
    },
  });

  return goals.map((g) => {
    const projectsDone = g.projects.filter((p) => p.isDone).length;
    const projectsTotal = g.projects.length;
    const tasksDone = g.tasks.filter((t) => t.isDone).length;
    const tasksTotal = g.tasks.length;
    const doneCount = projectsDone + tasksDone;
    const totalCount = projectsTotal + tasksTotal;
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      projectCount: projectsTotal,
      taskCount: tasksTotal,
      progress: totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100),
    };
  });
}) satisfies GetGoals<{ lensId: string }>;

// ----------------------------------------------------------------
// Read: single goal (for the Goal detail page)
// ----------------------------------------------------------------
// Returns the goal + its standalone tasks (horizon-groupable like Project
// detail) + its linked projects (name + progress, for the "linked projects"
// list). Scoped by userId for tenancy. Standalone tasks are the ones filed
// directly under the goal (goalId set, projectId null); project tasks are
// reached via the project list, not duplicated here.
export const getGoal = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await context.entities.Goal.findUnique({
    where: { id: args.id, userId: context.user.id },
    include: {
      // Standalone tasks under this goal, with project/goal for TaskRow.
      tasks: {
        orderBy: [{ order: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
        include: {
          tags: true,
          project: { select: { id: true, name: true } },
          goal: { select: { id: true, name: true } },
        },
      },
      // Linked projects: name + done/total for a per-project progress read.
      projects: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          isDone: true,
          dueDate: true,
          tasks: { select: { id: true, isDone: true } },
        },
      },
    },
  });
}) satisfies GetGoal<{ id: string }>;

// ----------------------------------------------------------------
// Create a goal
// ----------------------------------------------------------------
export const createGoal = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const name = args.name?.trim();
  if (!name) {
    throw new Error("Goal name is required.");
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

  return await context.entities.Goal.create({
    data: {
      name,
      userId: context.user.id,
      lensId: args.lensId,
      description: args.description,
    },
    select: { id: true, name: true },
  });
}) satisfies CreateGoal<{
  name: string;
  lensId: string;
  description?: string;
}, { id: string; name: string }>;
