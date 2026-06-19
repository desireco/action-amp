import type { GetGoals, CreateGoal } from "wasp/server/operations";

/**
 * Goals list for the Goals page, scoped to the active Lens.
 * Each goal rolls up: linked project count + standalone task count + aggregate
 * completion progress across all its projects + tasks.
 */
export const getGoals = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

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
