import type { GetTask, GetTasks, GetTopTask, SnoozeTask, StartTask, PauseTask, ToggleTaskDone, UpdateTaskStatus } from "wasp/server/operations";

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
    data: { isDone: next, completedAt: next ? new Date() : null, startedAt: null },
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

// ----------------------------------------------------------------
// Read: the focus engine's top task (FEATURES.md F10 — MVP priority-first)
// ----------------------------------------------------------------
// Candidates = Tasks in the active Lens with status=TODAY, not done.
// Rank by priority (IMPORTANT > NORMAL > LOW), then size (smaller = quick win),
// then oldest. Returns the top 1, or null when nothing's on the table.
const PRIORITY_RANK: Record<string, number> = { IMPORTANT: 0, NORMAL: 1, LOW: 2 };
const SIZE_RANK: Record<string, number> = { S: 0, M: 1, L: 2, XL: 3 };

export const getTopTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const candidates = await context.entities.Task.findMany({
    where: {
      userId: context.user.id,
      lensId: args.lensId,
      status: "TODAY",
      isDone: false,
    },
    include: {
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
    },
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    // An in-progress task (startedAt != null) is ALWAYS #1 — "Now" survives
    // navigation. Among the rest, rank by priority > size > oldest.
    const aStarted = a.startedAt ? 0 : 1;
    const bStarted = b.startedAt ? 0 : 1;
    if (aStarted !== bStarted) return aStarted - bStarted;
    if (a.startedAt && b.startedAt) {
      return a.startedAt.getTime() - b.startedAt.getTime();
    }
    const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (pr !== 0) return pr;
    const sr = (SIZE_RANK[a.size] ?? 1) - (SIZE_RANK[b.size] ?? 1);
    if (sr !== 0) return sr;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return candidates[0];
}) satisfies GetTopTask<{ lensId: string }>;

// ----------------------------------------------------------------
// Snooze — "Not now" flow (FEATURES.md F11)
// ----------------------------------------------------------------
// Presets: 1h / 3h / tomorrow / weekend → Task(status=UPCOMING, dueDate=then)
//          someday                                   → Task(status=SOMEDAY, dueDate=null)
// The task leaves the focus queue until the snooze expires (then it's a
// candidate again via Upcoming/Today rollover).
const SNOWIZE_OFFSETS: Record<string, number> = {
  "1h": 3600_000,
  "3h": 3 * 3600_000,
};

export const snoozeTask = (async (args, context) => {
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

  let status: "UPCOMING" | "SOMEDAY" = "UPCOMING";
  let dueDate: Date | null = new Date();
  switch (args.preset) {
    case "1h":
    case "3h":
      dueDate = new Date(Date.now() + SNOWIZE_OFFSETS[args.preset]);
      break;
    case "tomorrow": {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      dueDate = d;
      break;
    }
    case "weekend": {
      const d = new Date();
      const dow = d.getDay();
      d.setDate(d.getDate() + ((6 - dow + 7) % 7 || 7)); // next Saturday
      d.setHours(9, 0, 0, 0);
      dueDate = d;
      break;
    }
    case "someday":
      status = "SOMEDAY";
      dueDate = null;
      break;
  }

  return await context.entities.Task.update({
    where: { id: args.id },
    data: { status, dueDate, startedAt: null },
    select: { id: true, status: true, dueDate: true },
  });
}) satisfies SnoozeTask<{
  id: string;
  preset: "1h" | "3h" | "tomorrow" | "weekend" | "someday";
}>;

// ----------------------------------------------------------------
// Start / Pause — the "Now" state (FEATURES.md F14: in-progress persists)
// ----------------------------------------------------------------
// Start → Now (startedAt = now). The task becomes #1 in getTopTask and stays
// there across navigation. Pause → back to Next (startedAt = null); the task
// remains a candidate but no longer holds the focus slot.
export const startTask = (async (args, context) => {
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
    data: { startedAt: new Date() },
    select: { id: true, startedAt: true },
  });
}) satisfies StartTask<{ id: string }, { id: string; startedAt: Date | null }>;

export const pauseTask = (async (args, context) => {
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
    data: { startedAt: null },
    select: { id: true, startedAt: true },
  });
}) satisfies PauseTask<{ id: string }, { id: string; startedAt: Date | null }>;
