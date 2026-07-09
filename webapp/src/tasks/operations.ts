import type {
  GetTask,
  GetTasks,
  GetDoneToday,
  GetTopTask,
  GetFocusedTask,
  SnoozeTask,
  StartTask,
  PauseTask,
  ToggleTaskDone,
  UpdateTaskStatus,
  AddTaskUpdate,
  UpdateTaskContent,
  UpdateTaskDetails,
  SetTaskOutcome,
  CompleteTaskFromFocus,
} from "wasp/server/operations";
import { assertLensAllowed } from "../billing/entitlementHttp";
import { activePoolWhere } from "./activePool";

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
// `updates` ordered oldest → newest so every consumer gets a chronological
// activity thread by default (focus mode, task detail). task-notes-
// completion-log spec.
export const getTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await context.entities.Task.findFirst({
    where: {
      userId: context.user.id,
      OR: [{ id: args.id }, { permalink: args.id }],
    },
    include: {
      tags: true,
      updates: { orderBy: { createdAt: "asc" } },
      project: { select: { id: true, permalink: true, name: true } },
      goal: { select: { id: true, permalink: true, name: true } },
    },
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

  // Entitlement: FREE users may only read the Me lens (Work is visible-but-
  // locked). The detail reads (getTask) are unguarded — no data loss for
  // existing content; only list/scope reads enforce the lens rule.
  await assertLensAllowed(context, args.lensId);

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
}) satisfies GetTasks<{
  lensId: string;
  status?: "TODAY" | "UPCOMING" | "SOMEDAY";
  isDone?: boolean;
}>;

// ----------------------------------------------------------------
// Read: tasks completed today (for the Today "Done today" section)
// ----------------------------------------------------------------
// Separate from getTasks (which has no date filter and returns full history).
// Scoped to the active lens + completed since local-midnight, newest first.
// Includes project/goal so the section can group the same way open tasks do.
export const getDoneToday = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  // Entitlement: FREE users may only read the Me lens.
  await assertLensAllowed(context, args.lensId);
  // Local-midnight boundary: completedAt is stamped server-side on toggle; we
  // compare against the start of "today" in the server's locale. Day-granular
  // is the right resolution for a "done today" section.
  // Status scoping: only tasks that were committed to Today (status=TODAY)
  // belong here. Completion (completeTaskFromFocus) sets isDone + completedAt
  // but leaves status untouched, so an Upcoming task finished via focus stays
  // status=UPCOMING and is correctly excluded. A Today task that rolls to
  // Upcoming at midnight and is then completed no longer counts as "today's
  // work" — by then it wasn't committed to the day.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return await context.entities.Task.findMany({
    where: {
      userId: context.user.id,
      lensId: args.lensId,
      status: "TODAY",
      isDone: true,
      completedAt: { gte: startOfToday },
    },
    orderBy: { completedAt: "desc" },
    include: {
      tags: true,
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
    },
  });
}) satisfies GetDoneToday<{ lensId: string }>;

// ----------------------------------------------------------------
// Write: toggle a task's done state
// ----------------------------------------------------------------
// Sets completedAt when marking done, clears it when un-done. The Next /
// Today completion circle calls this; optimistic UI hides the row afterwards.
//
// Outcome (task-fields spec §C): an optional `outcome?` may be written *only
// when marking done* (next === true). Un-completing never clears an existing
// outcome (toggling open shouldn't blow away a captured note). Empty/whitespace
// is normalised to null so "cleared" reads as absent downstream.
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
  const data: Record<string, unknown> = {
    isDone: next,
    completedAt: next ? new Date() : null,
    startedAt: null,
  };
  // Outcome is part of the completion act, not the un-completion act. A future
  // toggle-open preserves any captured note; re-completing with a new note is
  // last-write-wins.
  if (next && args.outcome !== undefined) {
    data.outcome = args.outcome.trim() || null;
  }
  return await context.entities.Task.update({
    where: { id: args.id },
    data,
  });
}) satisfies ToggleTaskDone<{ id: string; outcome?: string }>;

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
// Candidates = the shared actionable pool (tasks/activePool.ts): status TODAY
// or UPCOMING in the active Lens, not done, due null or ≤ now. The due-guard
// keeps snooze working: a snoozed task carries a future dueDate, so it stays
// off Next until its time arrives (then auto-resurfaces). A triaged-to-
// Upcoming task has no dueDate, so it surfaces as Next immediately — triage
// puts real work in front of you, not behind a toggle (WORKFLOW.md §5.2).
// Rank by priority (IMPORTANT > NORMAL > LOW), then size (smaller = quick win),
// then oldest. Returns the top 1, or null when nothing's on the table.
const PRIORITY_RANK: Record<string, number> = {
  IMPORTANT: 0,
  NORMAL: 1,
  LOW: 2,
};
const SIZE_RANK: Record<string, number> = { S: 0, M: 1, L: 2, XL: 3 };

export const getTopTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  // Entitlement: FREE users may only read the Me lens. The home screen (Next)
  // calls this; a FREE user lands on Me, so this passes — the guard exists for
  // the localStorage-bypass case where a Work lensId reaches the server.
  await assertLensAllowed(context, args.lensId);
  // Candidate pool = the shared actionable predicate (WORKFLOW.md §5.2). Same
  // filter the Today nav badge + lens pills count against, so Next and every
  // count can never diverge. See tasks/activePool.ts.
  const candidates = await context.entities.Task.findMany({
    where: activePoolWhere({
      userId: context.user.id,
      lensId: args.lensId,
    }),
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
    // A committed-Today task outranks a bench (Upcoming) task at equal
    // priority/size — you don't want a bench task stealing the slot of
    // something you explicitly put on the court.
    const aToday = a.status === "TODAY" ? 0 : 1;
    const bToday = b.status === "TODAY" ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    const pr =
      (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (pr !== 0) return pr;
    const sr = (SIZE_RANK[a.size] ?? 1) - (SIZE_RANK[b.size] ?? 1);
    if (sr !== 0) return sr;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return candidates[0];
}) satisfies GetTopTask<{ lensId: string }>;

// ----------------------------------------------------------------
// Read: the single task currently in focus
// ----------------------------------------------------------------
// Focus is a global mode, not a task-specific URL. The focused task is the
// user's one started task (startedAt != null), with the full activity thread.
export const getFocusedTask = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await context.entities.Task.findFirst({
    where: {
      userId: context.user.id,
      isDone: false,
      startedAt: { not: null },
    },
    orderBy: { startedAt: "desc" },
    include: {
      tags: true,
      updates: { orderBy: { createdAt: "asc" } },
      sessions: { orderBy: { startedAt: "asc" } },
      project: { select: { id: true, permalink: true, name: true } },
      goal: { select: { id: true, permalink: true, name: true } },
    },
  });
}) satisfies GetFocusedTask<void>;

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
// Start → Now (startedAt = now). Only one task can be Now/Focus at a time, so
// starting one clears every other started task for the same user. Pause → back
// to Next (startedAt = null); the task remains a candidate but no longer holds
// the focus slot.
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
  await context.entities.Task.updateMany({
    where: { userId: context.user.id, startedAt: { not: null } },
    data: { startedAt: null },
  });
  // Defensive close on any prior task's open session — the updateMany above
  // cleared the startedAt pointer on whatever was running, but its session row
  // is still open. Close it so the totals stay honest across task switches.
  await context.entities.TaskSession.updateMany({
    where: { userId: context.user.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  const now = new Date();
  await context.entities.TaskSession.create({
    data: { taskId: args.id, userId: context.user.id, startedAt: now },
  });
  return await context.entities.Task.update({
    where: { id: args.id },
    data: { startedAt: now },
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
  // Close this task's open session (if any) before clearing the pointer.
  // updateMany is idempotent — pausing an already-paused task is a no-op here.
  await context.entities.TaskSession.updateMany({
    where: { taskId: args.id, endedAt: null },
    data: { endedAt: new Date() },
  });
  return await context.entities.Task.update({
    where: { id: args.id },
    data: { startedAt: null },
    select: { id: true, startedAt: true },
  });
}) satisfies PauseTask<{ id: string }, { id: string; startedAt: Date | null }>;

// ----------------------------------------------------------------
// Task notes + completion log (task-notes-completion-log.md)
// ----------------------------------------------------------------
// Two ops that make the TaskUpdate timeline real: a plain append for user
// notes, and a typed focus-mode completion that stamps Task.completedAt AND
// writes a COMPLETED event in the same transaction. completionAt stays the
// source of truth for "when did this finish" (Today, Review); the COMPLETED
// row is the auditable activity-log record for the thread.

// Append a user-authored NOTE to a task's thread. Does not mutate task status
// or any filing field — append-only progress notes only.
export const addTaskUpdate = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const task = await context.entities.Task.findUnique({
    where: { id: args.taskId },
    select: { userId: true },
  });
  if (!task || task.userId !== context.user.id) {
    throw new Error("Task not found.");
  }
  const body = args.body.trim();
  if (!body) {
    throw new Error("Note cannot be empty.");
  }
  return await context.entities.TaskUpdate.create({
    data: {
      body,
      kind: "NOTE",
      taskId: args.taskId,
      userId: context.user.id,
    },
  });
}) satisfies AddTaskUpdate<{ taskId: string; body: string }>;

// Edit the durable task notes/body. This is separate from TaskUpdate: content
// is the current working note, while updates are the append-only activity log.
export const updateTaskContent = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const task = await context.entities.Task.findUnique({
    where: { id: args.taskId },
    select: { userId: true },
  });
  if (!task || task.userId !== context.user.id) {
    throw new Error("Task not found.");
  }
  const content = args.content.trim() || null;
  return await context.entities.Task.update({
    where: { id: args.taskId },
    data: { content },
    select: { id: true, content: true },
  });
}) satisfies UpdateTaskContent<
  { taskId: string; content: string },
  { id: string; content: string | null }
>;

// Edit a task's Outcome — the "what happened" note. Writable anytime from Task
// detail / Logbook so a note captured (or skipped) at completion can be added
// or revised afterwards (task-fields spec §C/§F). Empty string → null.
// Independent of done state: works on complete or incomplete tasks (the read
// surface chooses when to show it).
export const setTaskOutcome = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const task = await context.entities.Task.findUnique({
    where: { id: args.taskId },
    select: { userId: true },
  });
  if (!task || task.userId !== context.user.id) {
    throw new Error("Task not found.");
  }
  const outcome = args.outcome.trim() || null;
  return await context.entities.Task.update({
    where: { id: args.taskId },
    data: { outcome },
    select: { id: true, outcome: true },
  });
}) satisfies SetTaskOutcome<
  { taskId: string; outcome: string },
  { id: string; outcome: string | null }
>;

// Edit the core task fields shown on the task detail page. This is the full
// "edit task" path; list rows should navigate here instead of editing notes.
// Title + notes arrive together from the Save footer (buffered prose), while
// structural fields (priority/size/status/dueDate/projectId/goalId) arrive
// one at a time from the chip popovers (live edits). Any subset of the
// structural fields may be present; only the passed ones are written.
// Server enforces: title required (when description is present + non-empty
// after trim — but if a structural-only call omits description, we skip the
// title check), one-parent rule (project XOR goal), and same-Lens invariant
// on project/goal reassignment.
export const updateTaskDetails = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const task = await context.entities.Task.findUnique({
    where: { id: args.taskId },
    select: { userId: true, lensId: true, projectId: true, goalId: true },
  });
  if (!task || task.userId !== context.user.id) {
    throw new Error("Task not found.");
  }

  // Build the write payload from whichever fields are present.
  const data: Record<string, unknown> = {};

  if (args.description !== undefined) {
    const description = args.description.trim();
    if (!description) {
      throw new Error("Task title is required.");
    }
    data.description = description;
  }
  if (args.content !== undefined) {
    data.content = args.content.trim() || null;
  }
  if (args.priority !== undefined) {
    data.priority = args.priority;
  }
  if (args.size !== undefined) {
    data.size = args.size;
  }
  if (args.status !== undefined) {
    data.status = args.status;
  }
  if (args.dueDate !== undefined) {
    data.dueDate = args.dueDate;
  }

  // Project / goal reassignment — enforce one-parent + same-Lens invariants.
  // Resolve the next-state projectId / goalId (use the new value if passed,
  // otherwise carry the existing one) so we can validate the rule against the
  // post-write state, not just the delta.
  const nextProjectId =
    args.projectId === undefined ? task.projectId : args.projectId;
  const nextGoalId = args.goalId === undefined ? task.goalId : args.goalId;

  if (args.projectId !== undefined) {
    if (args.projectId === null) {
      data.projectId = null;
    } else {
      const project = await context.entities.Project.findUnique({
        where: { id: args.projectId },
        select: { userId: true, lensId: true },
      });
      if (!project || project.userId !== context.user.id) {
        throw new Error("Project not found.");
      }
      if (project.lensId !== task.lensId) {
        throw new Error("Project must be in the same Lens.");
      }
      data.projectId = args.projectId;
      // One-parent rule: a task with a project clears its direct goal link
      // (the project carries the goal). Mirrors createTask / updateTask.
      data.goalId = null;
    }
  }
  if (args.goalId !== undefined) {
    if (args.goalId === null) {
      data.goalId = null;
    } else {
      // A task can't hold both a project and a goal directly.
      if (nextProjectId !== null) {
        throw new Error("A task can't have both a project and a goal.");
      }
      const goal = await context.entities.Goal.findUnique({
        where: { id: args.goalId },
        select: { userId: true, lensId: true },
      });
      if (!goal || goal.userId !== context.user.id) {
        throw new Error("Goal not found.");
      }
      if (goal.lensId !== task.lensId) {
        throw new Error("Goal must be in the same Lens.");
      }
      data.goalId = args.goalId;
    }
  }

  return await context.entities.Task.update({
    where: { id: args.taskId },
    data,
    select: {
      id: true,
      description: true,
      content: true,
      priority: true,
      size: true,
      status: true,
      dueDate: true,
      projectId: true,
      goalId: true,
    },
  });
}) satisfies UpdateTaskDetails<
  {
    taskId: string;
    description?: string;
    content?: string;
    priority?: "LOW" | "NORMAL" | "IMPORTANT";
    size?: "S" | "M" | "L" | "XL";
    status?: "TODAY" | "UPCOMING" | "SOMEDAY";
    dueDate?: Date | null;
    projectId?: string | null;
    goalId?: string | null;
  },
  {
    id: string;
    description: string;
    content: string | null;
    priority: string;
    size: string;
    status: string;
    dueDate: Date | null;
    projectId: string | null;
    goalId: string | null;
  }
>;

// Complete a task from focus mode. Requires startedAt != null (focus is only
// reachable via Start, so this holds by construction — the guard keeps the
// product rule explicit in code). Idempotent: an already-done task returns its
// existing completion without writing a second COMPLETED event. Otherwise, in
// a single op sequence: isDone=true, completedAt=now, startedAt=null, and
// exactly one TaskUpdate(kind=COMPLETED). (The three writes are not wrapped in
// a $transaction; outcome + isDone + completedAt ride on the first Task.update
// together, so the outcome's integrity doesn't depend on the later writes.)
//
// Outcome (task-fields spec §C/§F): an optional `outcome?` written alongside
// the completion — the natural "what happened?" capture moment.
// Empty/whitespace → null; passing undefined leaves any existing outcome intact.
export const completeTaskFromFocus = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const task = await context.entities.Task.findUnique({
    where: { id: args.taskId },
    select: { isDone: true, completedAt: true, startedAt: true, userId: true },
  });
  if (!task || task.userId !== context.user.id) {
    throw new Error("Task not found.");
  }
  // Idempotent: double-clicking Complete must not double-log. Return the
  // existing completion timestamp; no second event row. (A re-complete with a
  // fresh outcome uses setTaskOutcome, not this path.)
  if (task.isDone) {
    return { id: args.taskId, completedAt: task.completedAt };
  }
  // Product rule: completion happens from focus, after Start.
  if (!task.startedAt) {
    throw new Error("Start the task before completing it.");
  }
  const completedAt = new Date();
  const data: Record<string, unknown> = {
    isDone: true,
    completedAt,
    startedAt: null,
  };
  if (args.outcome !== undefined) {
    data.outcome = args.outcome.trim() || null;
  }
  const updated = await context.entities.Task.update({
    where: { id: args.taskId },
    data,
    select: { id: true, completedAt: true },
  });
  // Close the open session so the focused time on this segment counts.
  await context.entities.TaskSession.updateMany({
    where: { taskId: args.taskId, endedAt: null },
    data: { endedAt: completedAt },
  });
  await context.entities.TaskUpdate.create({
    data: {
      body: "Completed",
      kind: "COMPLETED",
      taskId: args.taskId,
      userId: context.user.id,
    },
  });
  return { id: updated.id, completedAt: updated.completedAt };
}) satisfies CompleteTaskFromFocus<
  { taskId: string; outcome?: string },
  { id: string; completedAt: Date | null }
>;
