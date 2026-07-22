import type {
  GetTask,
  GetTasks,
  GetTodayTasks,
  GetDoneToday,
  GetTopTask,
  GetFocusedTask,
  SnoozeTask,
  StartTask,
  PauseTask,
  ToggleTaskDone,
  UpdateTaskStatus,
  UnscheduleOverdueTasks,
  AddTaskUpdate,
  UpdateTaskContent,
  UpdateTaskDetails,
  SetTaskOutcome,
  CompleteTaskFromFocus,
} from "wasp/server/operations";
import { assertLensAllowed } from "../billing/entitlementHttp";
import { resolveAccessibleLenses } from "../billing/entitlements";
// Pure cores shared with /api/cli/* routes — auth + entitlement guards stay
// here (the wrapper), the DB shape lives in the core. See operationsCore.ts.
import {
  getTaskData,
  getTasksData,
  getTodayTasksData,
  getDoneTodayData,
  getTopTaskData,
  toggleTaskDoneCore,
  snoozeTaskCore,
  updateTaskStatusCore,
  startTaskCore,
  pauseTaskCore,
  PRIORITY_RANK,
  SIZE_RANK,
} from "./operationsCore";
// Re-export the ranks + cores for back-compat: patRoutes.ts imports
// PRIORITY_RANK/SIZE_RANK from this module, and other callers may reach the
// cores through the familiar path.
export {
  PRIORITY_RANK,
  SIZE_RANK,
  getTopTaskData,
  toggleTaskDoneCore,
  snoozeTaskCore,
  startTaskCore,
  pauseTaskCore,
};

/**
 * Task operations for the Phase 4 list views.
 *
 * Every query/action is scoped by userId; list reads are additionally scoped
 * by lensId (the active Lens determines what the user sees) — except the
 * global Today list, which spans all accessible lenses (WORKFLOW.md §5.11).
 * All mutations are tenancy-safe via the compound where-clause on userId.
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
  return await getTaskData(context.entities, {
    userId: context.user.id,
    id: args.id,
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

  return await getTasksData(context.entities, {
    userId: context.user.id,
    lensId: args.lensId,
    status: args.status,
    isDone: args.isDone,
  });
}) satisfies GetTasks<{
  lensId: string;
  status?: "TODAY" | "UPCOMING" | "SOMEDAY";
  isDone?: boolean;
}>;

// ----------------------------------------------------------------
// Read: global Today list (across all accessible lenses)
// ----------------------------------------------------------------
// Today is universal (WORKFLOW.md §5.11) — the committed-for-today list spans
// every lens the user can read, not just the active one. This is the
// Inbox-shaped query: no lensId arg, filters by userId only, and the
// entitlement gate is the accessible-lens SET (not a per-task assertLensAllowed).
// `lens` is included per row so the page can render a provenance pill.
//
// Entitlement: resolveAccessibleLenses returns FREE → PERSONAL-only lenses,
// PRO/admin → all lenses. So a downgraded user can't see Today tasks from
// now-inaccessible lenses — the set filter replaces the per-task guard that
// lens-scoped getTasks uses.
export const getTodayTasks = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  // The core resolves the accessible-lens set internally (entitlement gate for
  // the global Today list) and returns [] when none are accessible.
  return await getTodayTasksData(context.entities, {
    user: context.user,
    userId: context.user.id,
  });
}) satisfies GetTodayTasks<never>;

// ----------------------------------------------------------------
// Read: tasks completed today (for the Today "Done today" section)
// ----------------------------------------------------------------
// Separate from getTasks (which has no date filter and returns full history).
// Completed since local-midnight, newest first. Includes project/goal so the
// section can group the same way open tasks do.
//
// Lens scoping: when `lensId` is passed the query is lens-scoped (guarded by
// assertLensAllowed — the FREE-lens rule). When `lensId` is omitted the query
// is global across accessible lenses (WORKFLOW.md §5.11), same accessible-set
// filter as getTodayTasks — that's how Today's Done-today section now reads.
export const getDoneToday = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  let lensIds: string[] | null = null;
  if (args?.lensId) {
    // Lens-scoped path: enforce the FREE-lens entitlement for this one lens.
    await assertLensAllowed(context, args.lensId);
    lensIds = [args.lensId];
  } else {
    // Global path: filter by the accessible-lens SET (entitlement-preserving).
    const accessible = await resolveAccessibleLenses(
      context.entities,
      context.user,
      context.user.id,
    );
    lensIds = accessible.map((l) => l.id);
  }
  // The startOfToday boundary + status=TODAY scoping live in the core so both
  // paths share them; the caller only decides WHICH lens set applies.
  return await getDoneTodayData(context.entities, {
    userId: context.user.id,
    lensIds,
  });
}) satisfies GetDoneToday<{ lensId?: string }>;

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
  // Tenancy (findUnique + userId check) + the outcome/done-state payload live
  // in the core; the wrapper is just auth.
  return await toggleTaskDoneCore(context.entities, {
    userId: context.user.id,
    id: args.id,
    outcome: args.outcome,
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
  return await updateTaskStatusCore(context.entities, {
    userId: context.user.id,
    id: args.id,
    status: args.status,
    dueDate: args.dueDate,
  });
}) satisfies UpdateTaskStatus<{
  id: string;
  status: "TODAY" | "UPCOMING" | "SOMEDAY";
  dueDate?: Date | null;
}>;

// ----------------------------------------------------------------
// Write: clear stale dates from the Upcoming bench
// ----------------------------------------------------------------
// An overdue date is a planning signal, not a permanent task property. This
// recovery action deliberately keeps tasks on the bench while clearing only
// their past dates; future-scheduled, Today, Someday, and completed tasks are
// never touched.
export const unscheduleOverdueTasks = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  await assertLensAllowed(context, args.lensId);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return await context.entities.Task.updateMany({
    where: {
      userId: context.user.id,
      lensId: args.lensId,
      status: "UPCOMING",
      isDone: false,
      dueDate: { lt: startOfToday },
    },
    data: { dueDate: null },
  });
}) satisfies UnscheduleOverdueTasks<{ lensId: string }, { count: number }>;

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
// PRIORITY_RANK/SIZE_RANK + the comparator live in operationsCore.ts (re-
// exported above) so the CLI's patRoutes.ts can rank the same pool.

export const getTopTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  // Entitlement: FREE users may only read the Me lens. The home screen (Next)
  // calls this; a FREE user lands on Me, so this passes — the guard exists for
  // the localStorage-bypass case where a Work lensId reaches the server.
  await assertLensAllowed(context, args.lensId);
  // Candidate fetch + sort live in the core so the CLI `/api/cli/now` route
  // can rank candidates identically without re-implementing the comparator.
  return await getTopTaskData(context.entities, {
    userId: context.user.id,
    lensId: args.lensId,
  });
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
// candidate again via Upcoming/Today rollover). The pure `snoozeTarget`
// helper (preset → {status, dueDate}) lives in operationsCore.ts and is unit-
// tested there; the wrapper is just auth + tenancy + the write.

export const snoozeTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await snoozeTaskCore(context.entities, {
    userId: context.user.id,
    id: args.id,
    preset: args.preset,
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
  return await startTaskCore(context.entities, {
    userId: context.user.id,
    id: args.id,
  });
}) satisfies StartTask<{ id: string }, { id: string; startedAt: Date | null }>;

export const pauseTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await pauseTaskCore(context.entities, {
    userId: context.user.id,
    id: args.id,
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
