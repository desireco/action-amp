/**
 * S1+S4 task-lifecycle cores — the write paths that live in the webapp's
 * `tasks/operations.ts` wrappers (not in its operationsCore) ported into the
 * domain layer as pure `(entities, args)` functions, so the API fragment is
 * auth + entitlement only, exactly like the F4b cores.
 *
 * Ported verbatim from webapp/src/tasks/operations.ts (completeTaskFromFocus,
 * addTaskUpdate, updateTaskContent, setTaskOutcome, updateTaskDetails,
 * unscheduleOverdueTasks): same messages, same one-parent + one-field-may-
 * say-today rules, same idempotency. Two deviations, both layering moves:
 * - the onboarding advance rides the `User.updateMany` delegate (the seam has
 *   no User delegate; ours lives in ./extrasEntities.ts),
 * - analytics stays out (no analytics delegate in packages/ — fire-and-forget
 *   webapp-side concern; the behavioral contract is unaffected).
 *
 * `Task`/`TaskSession` slices come from the seam entities; `TaskUpdate`/
 * `User`/`Project`/`Goal` from `createTaskExtrasEntities` (./extrasEntities.ts).
 */

import type {
  BatchPayload,
  Task,
  TaskUpdateArgs,
  TaskUpdateInput,
  TaskFindUniqueArgs,
  TaskWhereInput,
} from "../db/index.js";
import type { TaskExtrasEntities } from "./extrasEntities.js";
import { instantToDate, systemClock } from "../shared/time/temporal.js";

/** The task slice the write cores share (seam entities satisfy it). */
export interface TaskWriteEntities {
  Task: {
    findUnique(args: TaskFindUniqueArgs): Promise<Task | null>;
    update(args: TaskUpdateArgs): Promise<Task>;
    updateMany(args: { where: TaskWhereInput; data: TaskUpdateInput }): Promise<BatchPayload>;
  };
}

// ----------------------------------------------------------------
// Complete from focus (task-notes-completion-log + task-fields §C/§F)
// ----------------------------------------------------------------

export interface CompleteTaskFromFocusEntities extends TaskWriteEntities {
  TaskSession: {
    updateMany(args: {
      where: { taskId: string; endedAt: null };
      data: { endedAt: Date };
    }): Promise<BatchPayload>;
  };
  TaskUpdate: TaskExtrasEntities["TaskUpdate"];
  User: TaskExtrasEntities["User"];
}

export async function completeTaskFromFocusCore(
  entities: CompleteTaskFromFocusEntities,
  {
    userId,
    taskId,
    outcome,
  }: { userId: string; taskId: string; outcome?: string },
): Promise<{ id: string; completedAt: Date | null }> {
  // Guard-read: the seam returns the full row by PK (the select in the
  // webapp wrapper was advisory); the core reads the same fields from it.
  const task = await entities.Task.findUnique({
    where: { id: taskId },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }
  // Idempotent: double-clicking Complete must not double-log. Return the
  // existing completion timestamp; no second event row.
  if (task.isDone) {
    return { id: taskId, completedAt: task.completedAt };
  }
  // Product rule: completion happens from focus, after Start.
  if (!task.startedAt) {
    throw new Error("Start the task before completing it.");
  }
  const completedAt = instantToDate(systemClock.instant());
  const data: TaskUpdateInput = {
    isDone: true,
    completedAt,
    startedAt: null,
  };
  if (outcome !== undefined) {
    data.outcome = outcome.trim() || null;
  }
  // Full-row update (the seam's plain-update overload); the payload is the
  // id + completedAt slice the webapp wrapper selected.
  const updated = await entities.Task.update({
    where: { id: taskId },
    data,
  });
  // Close the open session so the focused time on this segment counts.
  await entities.TaskSession.updateMany({
    where: { taskId, endedAt: null },
    data: { endedAt: completedAt },
  });
  await entities.TaskUpdate.create({
    data: {
      body: "Completed",
      kind: "COMPLETED",
      taskId,
      userId,
    },
  });
  if (task.isOnboardingSample) {
    await entities.User.updateMany({
      where: { id: userId, onboardingStage: "SAMPLE_TASK" },
      data: { onboardingStage: "CAPTURE" },
    });
  }
  return { id: updated.id, completedAt: updated.completedAt };
}

// ----------------------------------------------------------------
// Activity thread + durable notes (task-notes-completion-log.md)
// ----------------------------------------------------------------

export async function addTaskUpdateCore(
  entities: Pick<TaskWriteEntities, "Task"> & Pick<TaskExtrasEntities, "TaskUpdate">,
  { userId, taskId, body }: { userId: string; taskId: string; body: string },
) {
  const task = await entities.Task.findUnique({
    where: { id: taskId },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Note cannot be empty.");
  }
  return await entities.TaskUpdate.create({
    data: {
      body: trimmed,
      kind: "NOTE",
      taskId,
      userId,
    },
  });
}

export async function updateTaskContentCore(
  entities: Pick<TaskWriteEntities, "Task">,
  { userId, taskId, content }: { userId: string; taskId: string; content: string },
) {
  const task = await entities.Task.findUnique({
    where: { id: taskId },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }
  const updated = await entities.Task.update({
    where: { id: taskId },
    data: { content: content.trim() || null },
  });
  return { id: updated.id, content: updated.content };
}

export async function setTaskOutcomeCore(
  entities: Pick<TaskWriteEntities, "Task">,
  { userId, taskId, outcome }: { userId: string; taskId: string; outcome: string },
) {
  const task = await entities.Task.findUnique({
    where: { id: taskId },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }
  const updated = await entities.Task.update({
    where: { id: taskId },
    data: { outcome: outcome.trim() || null },
  });
  return { id: updated.id, outcome: updated.outcome };
}

// ----------------------------------------------------------------
// Edit the core task fields (detail Save + the row editors' chips)
// ----------------------------------------------------------------

export interface TaskDetailsRow {
  id: string;
  description: string;
  content: string | null;
  priority: Task["priority"];
  size: Task["size"];
  status: Task["status"];
  scheduledDate: Date | null;
  snoozedUntil: Date | null;
  projectId: string | null;
  goalId: string | null;
}

export interface UpdateTaskDetailsArgs {
  userId: string;
  taskId: string;
  description?: string;
  content?: string;
  priority?: Task["priority"];
  size?: Task["size"];
  status?: "TODAY" | "UPCOMING" | "SOMEDAY";
  scheduledDate?: Date | null;
  projectId?: string | null;
  goalId?: string | null;
}

export async function updateTaskDetailsCore(
  entities: Pick<TaskWriteEntities, "Task"> & Pick<TaskExtrasEntities, "Project" | "Goal">,
  args: UpdateTaskDetailsArgs,
): Promise<TaskDetailsRow> {
  const { taskId } = args;
  // Guard-read (full row by PK — see the note in completeTaskFromFocusCore).
  const task = await entities.Task.findUnique({
    where: { id: taskId },
  });
  if (!task || task.userId !== args.userId) {
    throw new Error("Task not found.");
  }

  // Build the write payload from whichever fields are present.
  const data: TaskUpdateInput = {};

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
    // One field may say "today" (same rule as updateTaskStatusCore): the
    // status is the commitment, scheduledDate is bench scheduling —
    // committing (TODAY) or parking (SOMEDAY) always drops the date, so a
    // committed row can never render "today" twice.
    if (args.status === "TODAY" || args.status === "SOMEDAY") {
      data.scheduledDate = null;
    }
  }
  if (args.scheduledDate !== undefined) {
    data.scheduledDate = args.scheduledDate;
  }

  // Project / goal reassignment — enforce one-parent + same-Lens invariants.
  // Resolve the next-state projectId / goalId (use the new value if passed,
  // otherwise carry the existing one) so we can validate the rule against the
  // post-write state, not just the delta.
  const nextProjectId =
    args.projectId === undefined ? task.projectId : args.projectId;

  if (args.projectId !== undefined) {
    if (args.projectId === null) {
      data.projectId = null;
    } else {
      const project = await entities.Project.findUnique({
        where: { id: args.projectId },
      });
      if (!project || project.userId !== args.userId) {
        throw new Error("Project not found.");
      }
      if (project.type === "SIMPLE_LIST") {
        throw new Error("A task cannot live in a Simple-list Project.");
      }
      if (project.lensId !== task.lensId) {
        throw new Error("Project must be in the same Lens.");
      }
      data.projectId = args.projectId;
      // One-parent rule: a task with a project clears its direct goal link
      // (the project carries the goal).
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
      const goal = await entities.Goal.findUnique({
        where: { id: args.goalId },
      });
      if (!goal || goal.userId !== args.userId) {
        throw new Error("Goal not found.");
      }
      if (goal.lensId !== task.lensId) {
        throw new Error("Goal must be in the same Lens.");
      }
      data.goalId = args.goalId;
    }
  }

  // Full-row update (the seam's plain-update overload); project the
  // details slice the webapp wrapper selected out of it.
  const updated = await entities.Task.update({
    where: { id: taskId },
    data,
  });
  return {
    id: updated.id,
    description: updated.description,
    content: updated.content,
    priority: updated.priority,
    size: updated.size,
    status: updated.status,
    scheduledDate: updated.scheduledDate,
    snoozedUntil: updated.snoozedUntil,
    projectId: updated.projectId,
    goalId: updated.goalId,
  };
}

// ----------------------------------------------------------------
// Clear stale dates from the Upcoming bench (recovery action)
// ----------------------------------------------------------------

export async function unscheduleOverdueTasksCore(
  entities: Pick<TaskWriteEntities, "Task">,
  {
    userId,
    lensId,
    today,
  }: { userId: string; lensId: string; /** UTC-midnight `Date` for today. */ today: Date },
): Promise<{ count: number }> {
  const result = await entities.Task.updateMany({
    where: {
      userId,
      lensId,
      status: "UPCOMING",
      isDone: false,
      scheduledDate: { lt: today },
    },
    data: { scheduledDate: null },
  });
  return { count: result.count };
}
