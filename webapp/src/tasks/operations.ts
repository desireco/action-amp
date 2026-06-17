import type { GetTask, GetTasks, ToggleTaskDone, UpdateTaskStatus } from "wasp/server/operations";

/**
 * Task operations for the Phase 4 list views.
 *
 * Every query/action is scoped by userId AND lensId — the active Lens (Work/Me)
 * determines what the user sees. All mutations are tenancy-safe via the
 * compound where-clause on userId.
 */

// ----------------------------------------------------------------
// Read: single task (existing — kept for the detail page)
// ----------------------------------------------------------------
export const getTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await context.entities.Task.findUnique({
    where: { id: args.id, userId: context.user.id },
    include: { tags: true, updates: { orderBy: { createdAt: "desc" } } },
  });
}) satisfies GetTask<{ id: string }>;

// ----------------------------------------------------------------
// Read: list tasks in a lens, optionally filtered by status
// ----------------------------------------------------------------
// Used by Today (status=TODAY, not done), Upcoming (status=UPCOMING or dueDate
// in the future), Someday (status=SOMEDAY), Logbook (isDone=true).
export const getTasks = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const where: Record<string, unknown> = {
    userId: context.user.id,
    lensId: args.lensId,
  };
  if (args.status) where.status = args.status;
  if (args.isDone !== undefined) where.isDone = args.isDone;

  return await context.entities.Task.findMany({
    where,
    orderBy: [{ order: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    include: {
      tags: true,
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
    },
  });
}) satisfies GetTasks<{ lensId: string; status?: "TODAY" | "UPCOMING" | "SOMEDAY"; isDone?: boolean }>;

// ----------------------------------------------------------------
// Write: toggle a task's done state
// ----------------------------------------------------------------
// Sets completedAt when marking done, clears it when un-done. The What Now /
// Today completion circle calls this; optimistic UI hides the row afterwards.
export const toggleTaskDone = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const task = await context.entities.Task.findUnique({
    where: { id: args.id },
    select: { isDone: true, userId: true },
  });
  if (!task || task.userId !== context.user.id) {
    throw new Error("Task not found.");
  }
  const next = !task.isDone;
  return await context.entities.Task.update({
    where: { id: args.id },
    data: { isDone: next, completedAt: next ? new Date() : null },
  });
}) satisfies ToggleTaskDone<{ id: string }>;

// ----------------------------------------------------------------
// Write: move a task between Today / Upcoming / Someday
// ----------------------------------------------------------------
// The "Not now" flow and promote/demote actions call this. (Today-cap
// enforcement happens client-side — see TodayPage.)
export const updateTaskStatus = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const task = await context.entities.Task.findUnique({
    where: { id: args.id },
    select: { userId: true },
  });
  if (!task || task.userId !== context.user.id) {
    throw new Error("Task not found.");
  }
  return await context.entities.Task.update({
    where: { id: args.id },
    data: { status: args.status, dueDate: args.dueDate ?? undefined },
  });
}) satisfies UpdateTaskStatus<{
  id: string;
  status: "TODAY" | "UPCOMING" | "SOMEDAY";
  dueDate?: Date | null;
}>;
