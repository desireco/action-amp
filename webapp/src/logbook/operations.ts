import type { GetLogbook } from "wasp/server/operations";

/**
 * Logbook — the record of things no longer active, scoped to the active Lens.
 *
 * Four categories, all read-only here (restore/reopen/delete are separate
 * actions):
 *  - completed Tasks  (isDone, completedAt)
 *  - completed Projects
 *  - completed Goals  (goal-planning spec §D — same shape as projects, with
 *                      goal: null since a goal has no parent goal)
 *  - archived InboxItems ("I will not do now") — status ARCHIVED, archivedAt.
 *                      Kept (not deleted) so the user never loses a captured
 *                      note for declining to act on it.
 *
 * Note on scoping: Tasks, Projects, and Goals carry a lensId; archived
 * InboxItems do NOT (the inbox is universal). Archived notes are returned
 * regardless of the active lens — they belong to the user, not a context.
 */
export const getLogbook = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const [tasks, projects, goals, archived] = await Promise.all([
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
        outcome: true,
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
    // Completed Goals — lens-scoped like tasks/projects (goal-planning spec §D).
    context.entities.Goal.findMany({
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
      },
    }),
    // Archived notes — universal (no lens filter).
    context.entities.InboxItem.findMany({
      where: {
        userId: context.user.id,
        status: "ARCHIVED",
      },
      orderBy: { archivedAt: "desc" },
      select: {
        id: true,
        text: true,
        archivedAt: true,
      },
    }),
  ]);

  return {
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.description,
      completedAt: t.completedAt!,
      size: t.size,
      outcome: t.outcome,
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
    goals: goals.map((g) => ({
      id: g.id,
      title: g.name,
      completedAt: g.completedAt!,
      goal: null,
      kind: "goal" as const,
    })),
    archived: archived.map((a) => ({
      id: a.id,
      title: a.text,
      archivedAt: a.archivedAt!,
      kind: "archived" as const,
    })),
  };
}) satisfies GetLogbook<{ lensId: string }>;
