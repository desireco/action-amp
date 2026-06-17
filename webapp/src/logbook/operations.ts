import type { GetLogbook } from "wasp/server/operations";

/**
 * Logbook — completed tasks + projects, scoped to the active Lens, newest first.
 * Grouped by completion day on the client. Read-only; restore/delete are
 * separate actions (Phase 4.6 refinement).
 */
export const getLogbook = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const [tasks, projects] = await Promise.all([
    context.entities.Task.findMany({
      where: {
        userId: context.user.id,
        lensId: args.lensId,
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        description: true,
        completedAt: true,
        size: true,
        project: { select: { id: true, name: true } },
      },
    }),
    context.entities.Project.findMany({
      where: {
        userId: context.user.id,
        lensId: args.lensId,
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        name: true,
        completedAt: true,
        goal: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.description,
      completedAt: t.completedAt!,
      size: t.size,
      project: t.project,
      kind: "task" as const,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      title: p.name,
      completedAt: p.completedAt!,
      goal: p.goal,
      kind: "project" as const,
    })),
  };
}) satisfies GetLogbook<{ lensId: string }>;
