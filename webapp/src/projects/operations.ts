import type {
  GetProjects,
  CreateProject,
  GetProject,
  CreateTask,
  SetProjectDone,
  ArchiveProject,
  MoveProject,
  UpdateProject,
  DeleteProject,
  UpdateTask,
} from "wasp/server/operations";
import { FREE_LIMITS } from "../billing/config";
import {
  assertLensAllowed,
  assertStandardProject,
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
    includeCompleted: args.includeCompleted,
    includeArchived: args.includeArchived,
  });
}) satisfies GetProjects<{
  lensId: string;
  includeCompleted?: boolean;
  includeArchived?: boolean;
}>;

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
  // core. SIMPLE_LIST projects reject goalId there.
  return await createProjectCore(context.entities, {
    userId: context.user.id,
    name: args.name,
    lensId: args.lensId,
    goalId: args.goalId,
    description: args.description,
    type: args.type,
  });
}) satisfies CreateProject<
  {
    name: string;
    lensId: string;
    goalId?: string;
    description?: string;
    type?: "STANDARD" | "SIMPLE_LIST";
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
  attachments: { id: string; filename: string; mimeType: string }[];
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
    // SAFETY: type assertion is safe — value is validated or from a trusted source.
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
  // A checklist project takes list items only — tasks need a STANDARD project.
  if (args.projectId) {
    await assertStandardProject(context, args.projectId);
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
    assertLens: async (resolvedLensId) => {
      await assertLensAllowed(context, resolvedLensId);
    },
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

export const archiveProject = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  const project = await context.entities.Project.findUnique({
    where: { id: args.id },
    select: { id: true, userId: true, lensId: true, completedAt: true, archivedAt: true },
  });
  if (!project || project.userId !== context.user.id) {
    throw new Error("Project not found.");
  }
  await assertLensAllowed(context, project.lensId);
  if (project.archivedAt) return { id: project.id };
  return await context.entities.Project.update({
    where: { id: project.id },
    data: {
      archivedAt: new Date(),
      isDone: true,
      completedAt: project.completedAt ?? new Date(),
    },
    select: { id: true },
  });
}) satisfies ArchiveProject<{ id: string }, { id: string }>;

// ----------------------------------------------------------------
// Move: keep a project (and its work/history) together while changing its
// Life-area Lens. A project cannot retain a goal from its previous Lens.
// ----------------------------------------------------------------
export const moveProject = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  const existing = await context.entities.Project.findFirst({
    where: { id: args.id, userId: context.user.id },
    select: { id: true, lensId: true },
  });
  if (!existing) throwHttpStatus(404, "Project not found.");
  if (existing.lensId === args.targetLensId) return { id: existing.id, movedTaskCount: 0 };

  const target = await context.entities.Lens.findFirst({
    where: { id: args.targetLensId, userId: context.user.id },
    select: { id: true },
  });
  if (!target) throwHttpStatus(404, "Destination Lens not found.");
  await assertLensAllowed(context, existing.lensId);
  await assertLensAllowed(context, target.id);

  // Goals are Lens-scoped, so detach this project from any source-Lens goal.
  // Every child task moves with the project and becomes project-owned only.
  const movedTasks = await context.entities.Task.updateMany({
    where: { projectId: existing.id, userId: context.user.id },
    data: { lensId: target.id, goalId: null },
  });
  await context.entities.Project.update({
    where: { id: existing.id },
    data: { lensId: target.id, goalId: null },
    select: { id: true },
  });
  return { id: existing.id, movedTaskCount: movedTasks.count };
}) satisfies MoveProject<{ id: string; targetLensId: string }, { id: string; movedTaskCount: number }>;

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
    select: { id: true, name: true, lensId: true, type: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Project not found.");
  }
  type ProjectUpdateData = {
    name?: string;
    description?: string | null;
    goalId?: string | null;
    dueDate?: Date | null;
    type?: "STANDARD" | "SIMPLE_LIST";
  };
  const data: ProjectUpdateData = {};
  // Type conversion: only while empty — converting tasks or list items would
  // be ambiguous. Mirrors the old Lens rule (blocked with a reason, never
  // silently).
  const nextType = args.type ?? existing.type;
  if (args.type !== undefined && args.type !== existing.type) {
    const [taskCount, itemCount] = await Promise.all([
      context.entities.Task.count({ where: { projectId: existing.id } }),
      context.entities.ListItem.count({ where: { projectId: existing.id } }),
    ]);
    if (taskCount > 0 || itemCount > 0) {
      throwHttpStatus(
        400,
        taskCount > 0
          ? "Move or remove this project's actions before changing its type."
          : "Clear this list before changing its type.",
      );
    }
    data.type = args.type;
  }
  if (args.name !== undefined) {
    const name = args.name.trim();
    if (!name) throw new Error("Project name cannot be empty.");
    data.name = name;
  }
  if (args.description !== undefined) {
    data.description = args.description.trim() || null;
  }
  if (args.dueDate !== undefined) {
    if (nextType === "SIMPLE_LIST") {
      throwHttpStatus(400, "A Simple-list Project has no due date.");
    }
    data.dueDate = args.dueDate;
  }
  // Re-link: same-Lens invariant. Resolve the target goal and compare lensId.
  // goalId === null is valid (unlink to standalone in the same Lens).
  if (args.goalId !== undefined) {
    if (nextType === "SIMPLE_LIST" && args.goalId !== null) {
      throwHttpStatus(400, "A Simple-list Project cannot sit under a Goal.");
    }
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
    type?: "STANDARD" | "SIMPLE_LIST";
  },
  {
    id: string;
    name: string;
    description: string | null;
    goalId: string | null;
  }
>;

// ----------------------------------------------------------------
// Delete: an explicit action disposition prevents surprise data movement.
// ----------------------------------------------------------------
export const deleteProject = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const existing = await context.entities.Project.findUnique({
    where: { id: args.id, userId: context.user.id },
    select: { id: true, lensId: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Project not found.");
  }
  const tasks = await context.entities.Task.findMany({
    where: { projectId: existing.id, userId: context.user.id },
    select: { id: true, description: true, content: true },
  });
  const taskDisposition = args.taskDisposition ?? "delete";
  if (tasks.length > 0 && taskDisposition === "reassign") {
    if (!args.targetProjectId) throwHttpStatus(400, "Choose a project for these actions.");
    const target = await context.entities.Project.findFirst({
      where: { id: args.targetProjectId, userId: context.user.id, lensId: existing.lensId, isDone: false, archivedAt: null },
      select: { id: true },
    });
    if (!target) throwHttpStatus(404, "Destination project not found.");
    await context.entities.Task.updateMany({
      where: { id: { in: tasks.map((task: { id: string }) => task.id) } },
      data: { projectId: target.id, goalId: null },
    });
  } else if (tasks.length > 0 && taskDisposition === "triage") {
    for (const task of tasks) {
      await context.entities.InboxItem.create({
        data: { text: task.description, content: task.content, userId: context.user.id, parsedTags: [] },
      });
    }
    await context.entities.Task.deleteMany({
      where: { id: { in: tasks.map((task: { id: string }) => task.id) } },
    });
  } else if (tasks.length > 0) {
    await context.entities.Task.deleteMany({
      where: { id: { in: tasks.map((task: { id: string }) => task.id) } },
    });
  }
  // Resources are project-owned, so they leave with the deleted project.
  await context.entities.Resource.deleteMany({
    where: { projectId: existing.id, userId: context.user.id },
  });
  await context.entities.Project.delete({
    where: { id: existing.id },
    select: { id: true },
  });
  return { id: existing.id, affectedTaskCount: tasks.length };
}) satisfies DeleteProject<
  { id: string; taskDisposition?: "delete" | "reassign" | "triage"; targetProjectId?: string },
  { id: string; affectedTaskCount: number }
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
  type TaskParentData = { projectId?: string | null; goalId?: string | null };
  const data: TaskParentData = {};
  if (args.projectId !== undefined) {
    if (args.projectId !== null) {
      const project = await context.entities.Project.findUnique({
        where: { id: args.projectId, userId: context.user.id },
        select: { id: true, lensId: true, type: true },
      });
      if (!project) throwHttpStatus(404, "Project not found.");
      if (project.type === "SIMPLE_LIST") {
        throwHttpStatus(400, "A task cannot live in a Simple-list Project.");
      }
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
