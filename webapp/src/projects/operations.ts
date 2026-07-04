import type {
  GetProjects,
  CreateProject,
  GetProject,
  CreateTask,
} from "wasp/server/operations";
import { FREE_LIMITS } from "../billing/config";
import { assertLensAllowed, assertUnderCap } from "../billing/entitlementHttp";

/**
 * Projects list for the Projects page, scoped to the active Lens.
 * Includes task counts (done / total) for progress, plus the next open action
 * (the top-priority non-done task in the project) as a preview.
 */
export const getProjects = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  // Entitlement: FREE users may only read the Me lens.
  await assertLensAllowed(context, args.lensId);

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
      _count: { select: { tasks: { where: { isDone: false } } } },
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

  // Entitlement: FREE users capped at FREE_LIMITS.projects per lens, and the
  // Work lens is locked. Count non-done projects so finishing work frees a slot.
  await assertLensAllowed(context, args.lensId);
  const projectCount = await context.entities.Project.count({
    where: { userId: context.user.id, lensId: args.lensId, isDone: false },
  });
  await assertUnderCap(context, args.lensId, projectCount, FREE_LIMITS.projects, {
    feature: "a 4th project",
    reason: "organize more than 3 projects with Pro",
  });

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

// ----------------------------------------------------------------
// Read: a single project for the detail page, with its tasks
// ----------------------------------------------------------------
// Tenancy-safe (findUnique by id + userId). Returns the project fields plus its
// full task list (open first by priority, then done) so the page can group by
// horizon. lensId is included so callers can scope new tasks to the project's
// lens — NOT the active sidebar lens, which may differ.
type ProjectTask = {
  id: string;
  description: string;
  isDone: boolean;
  priority: "LOW" | "NORMAL" | "IMPORTANT";
  size: "S" | "M" | "L" | "XL";
  status: "SOMEDAY" | "UPCOMING" | "TODAY";
  dueDate: Date | null;
};

export const getProject = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const project = await context.entities.Project.findUnique({
    where: { id: args.id, userId: context.user.id },
    include: {
      goal: { select: { id: true, name: true } },
      tasks: {
        orderBy: [{ isDone: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          description: true,
          isDone: true,
          priority: true,
          size: true,
          status: true,
          dueDate: true,
        },
      },
    },
  });
  if (!project) return null;
  // Entitlement: a FREE user may have an existing Work-lens project (seeded
  // before the cap, or created on a lapsed plan). They can still open and use
  // it (no data loss — spec invariant), so we do NOT block reads of existing
  // projects. The lens guard applies to list/create, not to detail reads.
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    dueDate: project.dueDate,
    isDone: project.isDone,
    lensId: project.lensId,
    goal: project.goal,
    tasks: project.tasks as ProjectTask[],
  };
}) satisfies GetProject<{ id: string }>;

// ----------------------------------------------------------------
// Create: a task directly in a project (the detail page's "add task")
// ----------------------------------------------------------------
// Mirrors createProject. A task added here is actionable on landing: it gets
// status UPCOMING (the triage default since 2026-06-25 — surfaces on Next,
// doesn't clutter Today) and the M / NORMAL defaults. lensId comes from the
// project (not the active lens) so a task always joins its project's lens.
export const createTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const description = args.description?.trim();
  if (!description) {
    throw new Error("Task description is required.");
  }
  if (args.projectId && args.goalId) {
    throw new Error("Task can only be attached to one parent.");
  }

  let lensId = args.lensId;
  if (args.projectId) {
    const project = await context.entities.Project.findUnique({
      where: { id: args.projectId, userId: context.user.id },
      select: { id: true, lensId: true },
    });
    if (!project) {
      throw new Error("Project not found.");
    }
    lensId = project.lensId;
  } else if (args.goalId) {
    const goal = await context.entities.Goal.findUnique({
      where: { id: args.goalId, userId: context.user.id },
      select: { id: true, lensId: true },
    });
    if (!goal) {
      throw new Error("Goal not found.");
    }
    lensId = goal.lensId;
  }

  await assertLensAllowed(context, lensId);

  const task = await context.entities.Task.create({
    data: {
      description,
      content: null,
      userId: context.user.id,
      lensId,
      // A task is filed under a Project OR a Goal (or neither — standalone in
      // the lens). Exactly one of projectId/goalId is typically set; both are
      // nullable at the DB layer to support either parent.
      projectId: args.projectId ?? null,
      goalId: args.goalId ?? null,
      status: "UPCOMING",
      priority: "NORMAL",
      size: "M",
    },
    select: { id: true },
  });
  return { id: task.id };
}) satisfies CreateTask<{
  description: string;
  lensId: string;
  projectId?: string;
  goalId?: string;
}, { id: string }>;
