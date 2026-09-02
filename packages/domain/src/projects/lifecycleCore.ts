/**
 * Project lifecycle / edit / delete / re-file cores — ported from the op
 * bodies in `webapp/src/projects/operations.ts` (S5), which were Wasp ops
 * mixing guards with DB work. Entitlement guards moved to the API wrappers
 * (assertLensAllowed / assertStandardProject from ../projects/guards.js —
 * same placement as webapp: list/create/move guarded, detail reads open);
 * these cores keep the exact DB shapes, messages, and 404/400/409 statuses
 * (via ../projects/httpError.js).
 */

import { throwHttpStatus } from "./httpError.js";
import type {
  InboxItemCreateInput,
  InboxItemDelegate,
  ProjectDeleteArgs,
  ProjectUpdateArgs,
  ResourceDelegate,
  TaskDeleteManyArgs,
  TaskUpdateArgs,
} from "../db/index.js";
import type { ProjectEntities } from "./operationsCore.js";

// ----------------------------------------------------------------
// Lifecycle: complete / reopen a project (spec §A, §B)
// ----------------------------------------------------------------
// Mirror of setGoalDone. Hygiene — no cap check (the wrapper runs only the
// lens gate). Stamps completedAt on done, clears on reopen. Children
// (tasks) are left as-is. Idempotent when already in the requested state.
export async function setProjectDoneCore(
  entities: Pick<ProjectEntities, "Project">,
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
    // check, before the write — the FREE-Work-lens read invariant, no cap).
    assertLens?: (resolvedLensId: string) => Promise<void>;
  },
): Promise<{ id: string }> {
  const project = await entities.Project.findUnique({
    where: { id },
    select: { id: true, isDone: true, userId: true, lensId: true },
  });
  if (!project || project.userId !== userId) {
    throw new Error("Project not found.");
  }
  if (assertLens) {
    await assertLens(project.lensId);
  }
  const next = isDone;
  if (project.isDone === next) return { id: project.id };
  const updateArgs: ProjectUpdateArgs = {
    where: { id: project.id },
    data: { isDone: next, completedAt: next ? new Date() : null },
    select: { id: true },
  };
  const updated = await entities.Project.update(updateArgs);
  return { id: updated.id };
}

// ----------------------------------------------------------------
// Archive: completes + hides the project (decluttering). Idempotent.
// ----------------------------------------------------------------
export async function archiveProjectCore(
  entities: Pick<ProjectEntities, "Project">,
  {
    userId,
    id,
    assertLens,
  }: {
    userId: string;
    id: string;
    assertLens?: (resolvedLensId: string) => Promise<void>;
  },
): Promise<{ id: string }> {
  const project = await entities.Project.findUnique({
    where: { id },
    select: { id: true, userId: true, lensId: true, completedAt: true, archivedAt: true },
  });
  if (!project || project.userId !== userId) {
    throw new Error("Project not found.");
  }
  if (assertLens) {
    await assertLens(project.lensId);
  }
  if (project.archivedAt) return { id: project.id };
  const updateArgs: ProjectUpdateArgs = {
    where: { id: project.id },
    data: {
      archivedAt: new Date(),
      isDone: true,
      completedAt: project.completedAt ?? new Date(),
    },
    select: { id: true },
  };
  const updated = await entities.Project.update(updateArgs);
  return { id: updated.id };
}

// ----------------------------------------------------------------
// Move: keep a project (and its work/history) together while changing its
// Life-area Lens. A project cannot retain a goal from its previous Lens.
// ----------------------------------------------------------------
export async function moveProjectCore(
  entities: Pick<ProjectEntities, "Project" | "Task" | "Goal" | "Lens">,
  {
    userId,
    id,
    targetLensId,
    assertLens,
  }: {
    userId: string;
    id: string;
    targetLensId: string;
    // Injected entitlement callback — webapp guards BOTH lenses (source then
    // destination) after the two 404 checks.
    assertLens?: (resolvedLensId: string) => Promise<void>;
  },
): Promise<{ id: string; movedTaskCount: number }> {
  const existing = await entities.Project.findFirst({
    where: { id, userId },
    select: { id: true, lensId: true },
  });
  if (!existing) throwHttpStatus(404, "Project not found.");
  if (existing.lensId === targetLensId) return { id: existing.id, movedTaskCount: 0 };

  const target = await entities.Lens.findFirst({
    where: { id: targetLensId, userId },
    select: { id: true },
  });
  if (!target) throwHttpStatus(404, "Destination Lens not found.");
  if (assertLens) {
    await assertLens(existing.lensId);
    await assertLens(target.id);
  }

  // Goals are Lens-scoped, so detach this project from any source-Lens goal.
  // Every child task moves with the project and becomes project-owned only.
  const movedTasks = await entities.Task.updateMany({
    where: { projectId: existing.id, userId },
    data: { lensId: target.id, goalId: null },
  });
  await entities.Project.update({
    where: { id: existing.id },
    data: { lensId: target.id, goalId: null },
    select: { id: true },
  });
  return { id: existing.id, movedTaskCount: movedTasks.count };
}

// ----------------------------------------------------------------
// Edit: rename + description + re-link to goal (spec §C)
// ----------------------------------------------------------------
// Partial update. The re-link path enforces the same-Lens invariant: a goal
// and its project must share a Lens. goalId may be a different goal (same
// Lens), null (unlink), or omitted (unchanged). Cross-Lens re-link is
// rejected with a 400 — structural.
export async function updateProjectCore(
  entities: Pick<ProjectEntities, "Project" | "Goal" | "Task" | "ListItem">,
  {
    userId,
    id,
    name,
    description,
    goalId,
    dueDate,
    type,
  }: {
    userId: string;
    id: string;
    name?: string;
    description?: string;
    goalId?: string | null;
    dueDate?: Date | null;
    type?: "STANDARD" | "SIMPLE_LIST";
  },
): Promise<{ id: string; name: string; description: string | null; goalId: string | null }> {
  const existing = await entities.Project.findUnique({
    where: { id, userId },
    select: { id: true, name: true, lensId: true, type: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Project not found.");
  }
  const data: {
    name?: string;
    description?: string | null;
    goalId?: string | null;
    dueDate?: Date | null;
    type?: "STANDARD" | "SIMPLE_LIST";
  } = {};
  // Type conversion: only while empty — converting tasks or list items would
  // be ambiguous. Mirrors the old Lens rule (blocked with a reason, never
  // silently).
  const nextType = type ?? existing.type;
  if (type !== undefined && type !== existing.type) {
    const [taskCount, itemCount] = await Promise.all([
      entities.Task.count({ where: { projectId: existing.id } }),
      entities.ListItem.count({ where: { projectId: existing.id } }),
    ]);
    if (taskCount > 0 || itemCount > 0) {
      throwHttpStatus(
        400,
        taskCount > 0
          ? "Move or remove this project's actions before changing its type."
          : "Clear this list before changing its type.",
      );
    }
    data.type = type;
  }
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Project name cannot be empty.");
    data.name = trimmed;
  }
  if (description !== undefined) {
    data.description = description.trim() || null;
  }
  if (dueDate !== undefined) {
    if (nextType === "SIMPLE_LIST") {
      throwHttpStatus(400, "A Simple-list Project has no due date.");
    }
    data.dueDate = dueDate;
  }
  // Re-link: same-Lens invariant. Resolve the target goal and compare lensId.
  // goalId === null is valid (unlink to standalone in the same Lens).
  if (goalId !== undefined) {
    if (nextType === "SIMPLE_LIST" && goalId !== null) {
      throwHttpStatus(400, "A Simple-list Project cannot sit under a Goal.");
    }
    if (goalId !== null) {
      const targetGoal = await entities.Goal.findUnique({
        where: { id: goalId, userId },
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
    data.goalId = goalId;
  }
  try {
    const updated = await entities.Project.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, description: true, goalId: true },
    });
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      goalId: updated.goalId,
    };
  } catch (e) {
    if (isUniqueViolation(e)) {
      throwHttpStatus(409, `You already have a project named "${data.name}".`);
    }
    throw e;
  }
}

/** Shared P2002/23505 recognition — same shape as goals/lifecycleCore's. */
function isUniqueViolation(e: unknown): boolean {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code: unknown }).code;
    return code === "P2002" || code === "23505";
  }
  return false;
}

// ----------------------------------------------------------------
// Delete: an explicit action disposition prevents surprise data movement.
// ----------------------------------------------------------------
export async function deleteProjectCore(
  entities: Pick<ProjectEntities, "Project" | "Task" | "Goal"> & {
    InboxItem: Pick<InboxItemDelegate, "create">;
    Resource: Pick<ResourceDelegate, "deleteMany">;
  },
  {
    userId,
    id,
    taskDisposition,
    targetProjectId,
  }: {
    userId: string;
    id: string;
    taskDisposition?: "delete" | "reassign" | "triage";
    targetProjectId?: string;
  },
): Promise<{ id: string; affectedTaskCount: number }> {
  const existing = await entities.Project.findUnique({
    where: { id, userId },
    select: { id: true, lensId: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Project not found.");
  }
  const tasks = await entities.Task.findMany({
    where: { projectId: existing.id, userId },
    select: { id: true, description: true, content: true },
  });
  const disposition = taskDisposition ?? "delete";
  if (tasks.length > 0 && disposition === "reassign") {
    if (!targetProjectId) throwHttpStatus(400, "Choose a project for these actions.");
    const target = await entities.Project.findFirst({
      where: { id: targetProjectId, userId, lensId: existing.lensId, isDone: false, archivedAt: null },
      select: { id: true },
    });
    if (!target) throwHttpStatus(404, "Destination project not found.");
    await entities.Task.updateMany({
      where: { id: { in: tasks.map((task) => task.id) } },
      data: { projectId: target.id, goalId: null },
    });
  } else if (tasks.length > 0 && disposition === "triage") {
    for (const task of tasks) {
      const createArgs: { data: InboxItemCreateInput } = {
        data: { text: task.description, content: task.content, userId, parsedTags: [] },
      };
      await entities.InboxItem.create(createArgs);
    }
    const deleteManyArgs: TaskDeleteManyArgs = {
      where: { id: { in: tasks.map((task) => task.id) } },
    };
    await entities.Task.deleteMany(deleteManyArgs);
  } else if (tasks.length > 0) {
    const deleteManyArgs: TaskDeleteManyArgs = {
      where: { id: { in: tasks.map((task) => task.id) } },
    };
    await entities.Task.deleteMany(deleteManyArgs);
  }
  // Resources are project-owned, so they leave with the deleted project.
  await entities.Resource.deleteMany({
    where: { projectId: existing.id, userId },
  });
  const deleteArgs: ProjectDeleteArgs = {
    where: { id: existing.id },
    select: { id: true },
  };
  await entities.Project.delete(deleteArgs);
  return { id: existing.id, affectedTaskCount: tasks.length };
}

// ----------------------------------------------------------------
// Edit: re-file a standalone task to a project / goal / neither (spec §C)
// ----------------------------------------------------------------
// Same-Lens invariant enforced: projectId/goalId (whichever is being set)
// must share the task's Lens. One-parent rule: setting both throws.
// Tenancy-safe throughout.
export async function updateTaskParentCore(
  entities: Pick<ProjectEntities, "Project" | "Goal" | "Task">,
  {
    userId,
    id,
    projectId,
    goalId,
  }: {
    userId: string;
    id: string;
    projectId?: string | null;
    goalId?: string | null;
  },
): Promise<{ id: string; projectId: string | null; goalId: string | null }> {
  const task = await entities.Task.findUnique({
    where: { id, userId },
    select: { id: true, lensId: true, projectId: true, goalId: true },
  });
  if (!task) {
    throwHttpStatus(404, "Task not found.");
  }
  // Reject setting both parents — a task is filed under Project OR Goal (or
  // neither), never both. One of the args being undefined means "leave as-is".
  if (projectId && goalId) {
    throw new Error("Task can only be attached to one parent.");
  }
  const data: { projectId?: string | null; goalId?: string | null } = {};
  if (projectId !== undefined) {
    if (projectId !== null) {
      const project = await entities.Project.findUnique({
        where: { id: projectId, userId },
        select: { id: true, lensId: true, type: true },
      });
      if (!project) throwHttpStatus(404, "Project not found.");
      if (project.type === "SIMPLE_LIST") {
        throwHttpStatus(400, "A task cannot live in a Simple-list Project.");
      }
      if (project.lensId !== task.lensId) {
        throwHttpStatus(
          400,
          "A task and its project must be in the same Lens.",
        );
      }
    }
    // Clear goalId when moving into a project — one-parent rule on commit too.
    data.projectId = projectId;
    if (projectId !== null) data.goalId = null;
  }
  if (goalId !== undefined) {
    if (goalId !== null) {
      const goal = await entities.Goal.findUnique({
        where: { id: goalId, userId },
        select: { id: true, lensId: true },
      });
      if (!goal) throwHttpStatus(404, "Goal not found.");
      if (goal.lensId !== task.lensId) {
        throwHttpStatus(400, "A task and its goal must be in the same Lens.");
      }
    }
    data.goalId = goalId;
    if (goalId !== null) data.projectId = null;
  }
  const updateArgs: TaskUpdateArgs = {
    where: { id: task.id },
    data,
    select: { id: true, projectId: true, goalId: true },
  };
  const updated = await entities.Task.update(updateArgs);
  return { id: updated.id, projectId: updated.projectId, goalId: updated.goalId };
}
