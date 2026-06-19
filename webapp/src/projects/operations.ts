import type { GetProjects, CreateProject } from "wasp/server/operations";

/**
 * Projects list for the Projects page, scoped to the active Lens.
 * Includes task counts (done / total) for progress, plus the next open action
 * (the top-priority non-done task in the project) as a preview.
 */
export const getProjects = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const projects = await context.entities.Project.findMany({
    where: {
      userId: context.user.id,
      lensId: args.lensId,
      isDone: false,
    },
    orderBy: [{ name: "asc" }],
    include: {
      goal: { select: { id: true, name: true } },
      tasks: {
        where: { isDone: false },
        select: {
          id: true,
          description: true,
          priority: true,
          size: true,
          status: true,
          isDone: true,
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        take: 1,
      },
      _count: { select: { tasks: true } },
    },
  });

  // Total task count (done + open) for the progress fraction.
  const totals = await context.entities.Project.findMany({
    where: {
      userId: context.user.id,
      lensId: args.lensId,
      isDone: false,
    },
    select: {
      id: true,
      _count: { select: { tasks: { where: { isDone: true } } } },
    },
  });
  const doneCount = new Map(totals.map((p) => [p.id, p._count.tasks]));

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    dueDate: p.dueDate,
    goal: p.goal,
    openCount: p._count.tasks, // open (non-done) tasks
    doneCount: doneCount.get(p.id) ?? 0,
    nextAction: p.tasks[0] ?? null, // top-priority open task
  }));
}) satisfies GetProjects<{ lensId: string }>;

// ----------------------------------------------------------------
// Create a project (trige-to-project + a create UI)
// ----------------------------------------------------------------
export const createProject = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const name = args.name?.trim();
  if (!name) {
    throw new Error("Project name is required.");
  }
  return await context.entities.Project.create({
    data: {
      name,
      userId: context.user.id,
      lensId: args.lensId,
      goalId: args.goalId,
      description: args.description,
    },
    select: { id: true, name: true },
  });
}) satisfies CreateProject<{
  name: string;
  lensId: string;
  goalId?: string;
  description?: string;
}, { id: string; name: string }>;
