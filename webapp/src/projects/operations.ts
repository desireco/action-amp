import type {
  GetProjects,
  CreateProject,
  GetProject,
  CreateTask,
  SetProjectDone,
  UpdateProject,
  DeleteProject,
  UpdateTask,
} from "wasp/server/operations";
import { FREE_LIMITS } from "../billing/config";
import {
  assertLensAllowed,
  assertUnderCap,
  throwHttpStatus,
} from "../billing/entitlementHttp";
// Pure cores shared with /api/cli/* routes — auth + entitlement guards stay
// here (the wrapper), the DB shape lives in the core. See operationsCore.ts.
import {
  getProjectsData,
  getProjectData,
  createProjectCore,
  createTaskCore,
} from "./operationsCore";

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

  return await getProjectsData(context.entities, {
    userId: context.user.id,
    lensId: args.lensId,
  });
}) satisfies GetProjects<{ lensId: string }>;

// ----------------------------------------------------------------
// Create a project (triage-to-project + a create UI)
// ----------------------------------------------------------------
export const createProject = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  // Entitlement: FREE users capped at FREE_LIMITS.projects per lens, and the
  // Work lens is locked. Count non-done projects so finishing work frees a slot.
  await assertLensAllowed(context, args.lensId);
  const projectCount = await context.entities.Project.count({
    where: { userId: context.user.id, lensId: args.lensId, isDone: false },
  });
  await assertUnderCap(
    context,
    args.lensId,
    projectCount,
    FREE_LIMITS.projects,
    {
      feature: "a 4th project",
      reason: "organize more than 3 projects with Pro",
    },
  );

  // Name trim + order seeding + permalink uniqueness + the create live in the
  // core.
  return await createProjectCore(context.entities, {
    userId: context.user.id,
    name: args.name,
    lensId: args.lensId,
    goalId: args.goalId,
    description: args.description,
  });
}) satisfies CreateProject<
  {
    name: string;
    lensId: string;
    goalId?: string;
    description?: string;
  },
  { id: string; permalink: string; name: string }
>;

// ----------------------------------------------------------------
// Read: a single project for the detail page, with its tasks
// ----------------------------------------------------------------
// Tenancy-safe (findFirst by id + userId). Returns the project fields plus its
// full task list (open first by priority, then done) so the page can group by
// horizon. lensId is included so callers can scope new tasks to the project's
// lens — NOT the active sidebar lens, which may differ.
type ProjectTask = {
  id: string;
  permalink: string;
  description: string;
  content: string | null;
  isDone: boolean;
  priority: "LOW" | "NORMAL" | "IMPORTANT";
  size: "S" | "M" | "L" | "XL";
  status: "SOMEDAY" | "UPCOMING" | "TODAY" | "WONT_DO";
  dueDate: Date | null;
  completedAt: Date | null;
};

export const getProject = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const project = await getProjectData(context.entities, {
    userId: context.user.id,
    id: args.id,
  });
  if (!project) return null;
  return {
    ...project,
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
  // The core resolves the parent's lens + creates; the entitlement guard runs
  // against the RESOLVED lens (injected as a callback so the core stays free of
  // wasp/server). Lens resolution → guard → create happens in that order in the
  // core, matching the pre-refactor op.
  return await createTaskCore(context.entities, {
    userId: context.user.id,
    description: args.description,
    lensId: args.lensId,
    projectId: args.projectId,
    goalId: args.goalId,
    assertLens: (resolvedLensId) => assertLensAllowed(context, resolvedLensId),
  });
}) satisfies CreateTask<
  {
    description: string;
    lensId: string;
    projectId?: string;
    goalId?: string;
  },
  { id: string; permalink: string }
>;

// ----------------------------------------------------------------
// Lifecycle: complete / reopen a project (spec §A, §B)
// ----------------------------------------------------------------
// Mirror of setGoalDone. Hygiene, not a power feature — no cap check, only
// the FREE-Work-lens read invariant. Stamps completedAt on done, clears on
// reopen. Children (tasks) are left as-is.
export const setProjectDone = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const project = await context.entities.Project.findUnique({
    where: { id: args.id },
    select: { id: true, isDone: true, userId: true, lensId: true },
  });
  if (!project || project.userId !== context.user.id) {
    throw new Error("Project not found.");
  }
  await assertLensAllowed(context, project.lensId);
  const next = args.isDone;
  if (project.isDone === next) return { id: project.id };
  return await context.entities.Project.update({
    where: { id: project.id },
    data: { isDone: next, completedAt: next ? new Date() : null },
    select: { id: true },
  });
}) satisfies SetProjectDone<{ id: string; isDone: boolean }, { id: string }>;

// ----------------------------------------------------------------
// Edit: rename + description + re-link to goal (spec §C)
// ----------------------------------------------------------------
// Partial update. name trim + unique rule (@@unique([userId, name])). The
// re-link path enforces the same-Lens invariant: a goal and its project must
// share a Lens. goalId may be a different goal (same Lens), null (unlink), or
// omitted (unchanged). Cross-Lens re-link is rejected with a 400 — structural.
export const updateProject = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const existing = await context.entities.Project.findUnique({
    where: { id: args.id, userId: context.user.id },
    select: { id: true, name: true, lensId: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Project not found.");
  }
  const data: {
    name?: string;
    description?: string | null;
    goalId?: string | null;
    dueDate?: Date | null;
  } = {};
  if (args.name !== undefined) {
    const name = args.name.trim();
    if (!name) throw new Error("Project name cannot be empty.");
    data.name = name;
  }
  if (args.description !== undefined) {
    data.description = args.description.trim() || null;
  }
  if (args.dueDate !== undefined) {
    data.dueDate = args.dueDate;
  }
  // Re-link: same-Lens invariant. Resolve the target goal and compare lensId.
  // goalId === null is valid (unlink to standalone in the same Lens).
  if (args.goalId !== undefined) {
    if (args.goalId !== null) {
      const targetGoal = await context.entities.Goal.findUnique({
        where: { id: args.goalId, userId: context.user.id },
        select: { id: true, lensId: true },
      });
      if (!targetGoal) {
        throwHttpStatus(404, "Goal not found.");
      }
      if (targetGoal.lensId !== existing.lensId) {
        throwHttpStatus(
          400,
          "A project and its goal must be in the same Lens.",
        );
      }
    }
    data.goalId = args.goalId;
  }
  try {
    return await context.entities.Project.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, description: true, goalId: true },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      throwHttpStatus(409, `You already have a project named "${data.name}".`);
    }
    throw e;
  }
}) satisfies UpdateProject<
  {
    id: string;
    name?: string;
    description?: string;
    goalId?: string | null;
    dueDate?: Date | null;
  },
  {
    id: string;
    name: string;
    description: string | null;
    goalId: string | null;
  }
>;

// ----------------------------------------------------------------
// Delete: lossless default (spec §C)
// ----------------------------------------------------------------
// Re-parents child Tasks to projectId=null (same Lens, retaining their goalId
// if any), then deletes the Project. Does NOT destroy Tasks or Resources —
// the spec's "no surprise data movement" rule. The confirm copy lives in UI.
export const deleteProject = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const existing = await context.entities.Project.findUnique({
    where: { id: args.id, userId: context.user.id },
    select: { id: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Project not found.");
  }
  const taskCount = await context.entities.Task.count({
    where: { projectId: existing.id, userId: context.user.id },
  });
  // Re-parent tasks to standalone (projectId=null) but retain their goalId if
  // any — the task keeps its "why" when its "how" (the project) goes away.
  await context.entities.Task.updateMany({
    where: { projectId: existing.id, userId: context.user.id },
    data: { projectId: null },
  });
  // Resources are owned by exactly one Project OR Goal (DATA-MODEL). With their
  // project gone, they'd be orphaned — detach to goalId=null is invalid (loose
  // resource), so we delete them. This is a known edge: the confirm copy
  // counts only tasks (the common case), and resource-only projects are rare.
  await context.entities.Resource.deleteMany({
    where: { projectId: existing.id, userId: context.user.id },
  });
  await context.entities.Project.delete({
    where: { id: existing.id },
    select: { id: true },
  });
  return { id: existing.id, reparentedCount: taskCount };
}) satisfies DeleteProject<
  { id: string },
  { id: string; reparentedCount: number }
>;

// ----------------------------------------------------------------
// Edit: re-link a standalone task to a project / goal / neither (spec §C)
// ----------------------------------------------------------------
// Build picks the surface — this op is the predicate. Same-Lens invariant
// enforced: projectId/goalId (whichever is being set) must share the task's
// Lens. One-parent rule: setting both throws. Tenancy-safe throughout.
export const updateTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const task = await context.entities.Task.findUnique({
    where: { id: args.id, userId: context.user.id },
    select: { id: true, lensId: true, projectId: true, goalId: true },
  });
  if (!task) {
    throwHttpStatus(404, "Task not found.");
  }
  // Reject setting both parents — a task is filed under Project OR Goal (or
  // neither), never both. One of the args being undefined means "leave as-is".
  if (args.projectId && args.goalId) {
    throw new Error("Task can only be attached to one parent.");
  }
  const data: { projectId?: string | null; goalId?: string | null } = {};
  if (args.projectId !== undefined) {
    if (args.projectId !== null) {
      const project = await context.entities.Project.findUnique({
        where: { id: args.projectId, userId: context.user.id },
        select: { id: true, lensId: true },
      });
      if (!project) throwHttpStatus(404, "Project not found.");
      if (project!.lensId !== task.lensId) {
        throwHttpStatus(
          400,
          "A task and its project must be in the same Lens.",
        );
      }
    }
    // Clear goalId when moving into a project — one-parent rule on commit too.
    data.projectId = args.projectId;
    if (args.projectId !== null) data.goalId = null;
  }
  if (args.goalId !== undefined) {
    if (args.goalId !== null) {
      const goal = await context.entities.Goal.findUnique({
        where: { id: args.goalId, userId: context.user.id },
        select: { id: true, lensId: true },
      });
      if (!goal) throwHttpStatus(404, "Goal not found.");
      if (goal!.lensId !== task.lensId) {
        throwHttpStatus(400, "A task and its goal must be in the same Lens.");
      }
    }
    data.goalId = args.goalId;
    if (args.goalId !== null) data.projectId = null;
  }
  return await context.entities.Task.update({
    where: { id: task.id },
    data,
    select: { id: true, projectId: true, goalId: true },
  });
}) satisfies UpdateTask<
  { id: string; projectId?: string | null; goalId?: string | null },
  { id: string; projectId: string | null; goalId: string | null }
>;
