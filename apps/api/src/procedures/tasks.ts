/**
 * The tasks procedures (F8b) — thin wrappers over the domain cores — extended
 * by the S1 (What Now + Focus) + S4 (Tasks & lists) batch.
 *
 * Layering: resolve the acting user (`requireUser`), call a domain core from
 * @actionamp/domain with `context.entities`, map the row to the contract DTO.
 * No SQL and no business logic lives here; validation already happened in the
 * contract (zod on `oc.input` → 4xx before any handler runs).
 *
 * S1+S4 notes (this file is the fragment; composition is already `tasks:`):
 * - Entities compose per request: the seam's `context.entities` (Task,
 *   TaskSession, Lens) plus the batch's own delegates
 *   (`createTaskExtrasEntities` / `createSimpleListEntities`, both over
 *   `context.db` — plain object creation, no new sockets).
 * - Entitlement guard: the webapp's `assertLensAllowed` (resolveLens →
 *   lensViolation → 402) ported with the domain-billing pieces; the decision
 *   keys on `isIncluded`, message is the webapp's exact Pro-gate copy.
 * - Wire conversion: outputs map Dates → ISO strings and `scheduledDate`
 *   → `yyyy-MM-dd`; inputs parse `yyyy-MM-dd` → UTC-midnight `Date` (the
 *   `@db.Date` convention the cores expect).
 * - Core `Error`s are the webapp's user-facing validation messages
 *   ("Task title is required.", "Note cannot be empty.", …) — rethrown as
 *   oRPC BAD_REQUEST so the message reaches the client like HttpError(400)
 *   did in Wasp.
 */

import { implement } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { contractRouter } from "@actionamp/contract";
import {
  getTaskData,
  getTasksData,
  getTodayTasksData,
  getWeekTasksData,
  getDoneTodayData,
  getTopTaskData,
  getTaskAlternativesData,
  getOtherLensCountsData,
  hydrateTopTaskData,
  toggleTaskDoneCore,
  snoozeTaskCore,
  updateTaskStatusCore,
  startTaskCore,
  pauseTaskCore,
  completeFocusSessionCore,
  getAppDataCore,
  addTaskUpdateCore,
  updateTaskContentCore,
  setTaskOutcomeCore,
  updateTaskDetailsCore,
  unscheduleOverdueTasksCore,
  completeTaskFromFocusCore,
  getFocusedTaskData,
  createTaskExtrasEntities,
  type DoneTodayRow,
} from "@actionamp/domain/tasks";
import {
  createSimpleListEntities,
  getSimpleListCore,
  createListItemCore,
  renameListItemCore,
  setListItemDoneCore,
  deleteListItemCore,
  clearCompletedListItemsCore,
} from "@actionamp/domain/simpleLists";
import {
  resolveLens,
  lensViolation,
  resolveAccessibleLenses,
} from "@actionamp/domain/billing";
import {
  Temporal,
  instantToPlainDate,
  plainDateToDb,
} from "@actionamp/domain/shared/time";
import type {
  RankedPoolRow,
  TaskLensListRow,
  TaskListRow,
  HydratedTask,
} from "@actionamp/domain/db";
import type { FocusedTaskRow } from "@actionamp/domain/tasks";
import type { TaskDetailFullRow } from "@actionamp/domain/db";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(contractRouter).$context<ApiContext>();

// ----------------------------------------------------------------
// Entity + guard plumbing
// ----------------------------------------------------------------

/** The batch's extra delegates over the request's DB handle. */
function extras(context: ApiContext) {
  return createTaskExtrasEntities(context.db);
}

/**
 * The full delegate set the S1/S4 cores speak: the seam's entities plus the
 * batch's TaskUpdate/User/Project/Goal extras (the extras' slices win on
 * key collision, so the cores always see the shapes they were ported
 * against). The simple-list delegates stay separate
 * (`createSimpleListEntities`) — the checklist cores take them directly.
 */
function allEntities(context: ApiContext) {
  return { ...context.entities, ...extras(context) };
}

/** The simple-list delegates over the request's DB handle. */
function simpleEntities(context: ApiContext) {
  return createSimpleListEntities(context.db);
}

/** `User.focusSessionMinutes` + time zone for the cores (UTC fallback). */
async function prefs(context: ApiContext, userId: string) {
  const row = await extras(context).User.findUnique({ where: { id: userId } });
  return {
    timeZone: row?.timeZone ?? "UTC",
    focusSessionMinutes: row?.focusSessionMinutes === 45 ? (45 as const) : (25 as const),
  };
}

/**
 * The webapp's `assertLensAllowed`: resolve the lens tenancy-safely, decide
 * on `isIncluded` (rename-safe), and surface the webapp's exact Pro-gate copy
 * as a 402 (webapp throws HttpError(402) via entitlementHttp.throwIfViolation;
 * PAYMENT_REQUIRED is not an oRPC built-in code, so `status: 402` is
 * load-bearing on the wire — without it the answer is a 500).
 */
async function assertLensAllowed(context: ApiContext, userId: string, lensId: string) {
  const user = requireUser(context);
  const lens = await resolveLens(context.entities, userId, lensId);
  const violation = lensViolation(user, lens);
  if (violation) {
    throw new ORPCError("PAYMENT_REQUIRED", {
      status: 402,
      message: `${violation.feature} is a Pro feature.`,
      data: { feature: violation.feature, reason: violation.reason },
    });
  }
}

/** Core `Error`s are user-facing validation messages → BAD_REQUEST. */
function run<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((cause: unknown) => {
    if (cause instanceof ORPCError) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ORPCError("BAD_REQUEST", { message, cause: cause instanceof Error ? cause : undefined });
  });
}

// ----------------------------------------------------------------
// Wire conversions (JSON-safe outputs, `yyyy-MM-dd` calendar days)
// ----------------------------------------------------------------

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** `Date` (UTC midnight from `@db.Date`) → `yyyy-MM-dd`. */
function wireDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** `yyyy-MM-dd` → UTC-midnight `Date` (the `plainDateToDb` convention). */
function dbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toInstant(value: string): Date {
  return new Date(value);
}

// ----------------------------------------------------------------
// Row → DTO mappers (presentation slices, not business logic)
// ----------------------------------------------------------------

function toTaskDto(row: TaskListRow) {
  return {
    id: row.id,
    description: row.description,
    status: row.status,
    priority: row.priority,
    isDone: row.isDone,
    order: row.order,
  };
}

function toTaskDetailDto(row: TaskDetailFullRow) {
  return {
    id: row.id,
    description: row.description,
    status: row.status,
    priority: row.priority,
    isDone: row.isDone,
    order: row.order,
    permalink: row.permalink,
    content: row.content ?? null,
  };
}

/** Full scalars (temporal fields as strings) — shared by every S1/S4 row. */
function toFullDto(row: {
  id: string;
  permalink: string;
  description: string;
  content: string | null;
  outcome: string | null;
  isDone: boolean;
  isOnboardingSample: boolean;
  priority: "LOW" | "NORMAL" | "IMPORTANT";
  size: "S" | "M" | "L" | "XL";
  status: "SOMEDAY" | "UPCOMING" | "TODAY" | "WONT_DO";
  order: number;
  scheduledDate: Date | null;
  snoozedUntil: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    permalink: row.permalink,
    description: row.description,
    content: row.content ?? null,
    outcome: row.outcome ?? null,
    isDone: row.isDone,
    isOnboardingSample: row.isOnboardingSample,
    priority: row.priority,
    size: row.size,
    status: row.status,
    order: row.order,
    scheduledDate: wireDate(row.scheduledDate),
    snoozedUntil: iso(row.snoozedUntil),
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function toListRowDto(row: TaskListRow) {
  return {
    ...toFullDto(row),
    tags: row.tags.map((tag) => ({ id: tag.id, name: tag.name })),
    project: row.project ? { id: row.project.id, name: row.project.name } : null,
    goal: row.goal ? { id: row.goal.id, name: row.goal.name } : null,
  };
}

function toLensListRowDto(row: TaskLensListRow | DoneTodayRow) {
  return {
    ...toListRowDto(row),
    lens: row.lens
      ? { id: row.lens.id, name: row.lens.name, color: row.lens.color ?? null }
      : null,
  };
}

function toRankedDto(row: RankedPoolRow) {
  return {
    ...toFullDto(row),
    project: row.project ? { id: row.project.id, name: row.project.name } : null,
    goal: row.goal ? { id: row.goal.id, name: row.goal.name } : null,
  };
}

/** The What Now winner: hydration + NOTE-only updates, newest first. */
function toWhatNowDto(row: HydratedTask) {
  return {
    ...toFullDto(row),
    project: row.project
      ? {
          id: row.project.id,
          permalink: row.project.permalink,
          name: row.project.name,
          goal: row.project.goal
            ? {
                id: row.project.goal.id,
                name: row.project.goal.name,
                description: row.project.goal.description ?? null,
              }
            : null,
        }
      : null,
    goal: row.goal
      ? {
          id: row.goal.id,
          permalink: row.goal.permalink,
          name: row.goal.name,
          description: row.goal.description ?? null,
        }
      : null,
    sessions: row.sessions.map((session) => ({
      startedAt: session.startedAt.toISOString(),
      endedAt: iso(session.endedAt),
    })),
    notes: row.updates.map((update) => ({
      body: update.body,
      createdAt: update.createdAt.toISOString(),
    })),
    attachments: row.attachments,
  };
}

/** The focused task: hydration + the full thread (webapp getFocusedTask). */
function toFocusedDto(row: FocusedTaskRow, focusSessionMinutes: 25 | 45) {
  return {
    ...toWhatNowDto(row as unknown as HydratedTask),
    // SAFETY: the focused row's sessions carry the countdown fields the
    // hydrated include doesn't (plannedMinutes/completed).
    sessions: row.sessions.map((session) => ({
      startedAt: session.startedAt.toISOString(),
      endedAt: iso(session.endedAt),
      plannedMinutes: session.plannedMinutes ?? null,
      completed: session.completed,
    })),
    tags: row.tags,
    updates: row.updates.map((update) => ({
      id: update.id,
      body: update.body,
      kind: update.kind === "COMPLETED" ? ("COMPLETED" as const) : ("NOTE" as const),
      createdAt: update.createdAt.toISOString(),
    })),
    focusSessionMinutes,
  };
}

// ----------------------------------------------------------------
// Procedures — original F8b pair (kept intact)
// ----------------------------------------------------------------

const tasksList = ORPC.tasks.list.handler(async ({ context }) => {
  const userId = requireUser(context).id;
  const primaryLens = await context.entities.Lens.findMany({
    where: { userId, isIncluded: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const lens = primaryLens[0];
  if (!lens) return [];

  const rows = await getTasksData(context.entities, {
    userId,
    lensId: lens.id,
    isDone: false,
  });
  return rows.map(toTaskDto);
});

const tasksDetail = ORPC.tasks.detail.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  const row = await getTaskData(context.entities, {
    userId,
    id: input.id,
  });
  return row ? toTaskDetailDto(row) : null;
});

// ----------------------------------------------------------------
// S1 — What Now + Focus queries
// ----------------------------------------------------------------

const tasksTopTask = ORPC.tasks.topTask.handler(async ({ context, input }) => {
  const user = requireUser(context);
  await assertLensAllowed(context, user.id, input.lensId);
  const { timeZone } = await prefs(context, user.id);
  const ranked = await getTopTaskData(context.entities, {
    userId: user.id,
    lensId: input.lensId,
    timeZone,
  });
  if (!ranked) return null;
  // Rank → hydrate the owned winner only; a vanished row → null (never stale).
  const hydrated = await hydrateTopTaskData(context.entities, {
    userId: user.id,
    id: ranked.id,
  });
  return hydrated ? toWhatNowDto(hydrated) : null;
});

const tasksAlternatives = ORPC.tasks.alternatives.handler(async ({ context, input }) => {
  const user = requireUser(context);
  await assertLensAllowed(context, user.id, input.lensId);
  const { timeZone } = await prefs(context, user.id);
  const rows = await getTaskAlternativesData(context.entities, {
    userId: user.id,
    lensId: input.lensId,
    excludeIds: input.excludeIds,
    timeZone,
  });
  return rows.map(toRankedDto);
});

const tasksOtherLensCounts = ORPC.tasks.otherLensCounts.handler(async ({ context, input }) => {
  const user = requireUser(context);
  const { timeZone } = await prefs(context, user.id);
  return await getOtherLensCountsData(
    { Task: context.entities.Task, Lens: context.entities.Lens },
    {
      user,
      userId: user.id,
      excludeLensId: input.excludeLensId,
      timeZone,
    },
  );
});

const tasksFocusedTask = ORPC.tasks.focusedTask.handler(async ({ context }) => {
  const user = requireUser(context);
  const [row, { focusSessionMinutes }] = await Promise.all([
    getFocusedTaskData(context.db, { userId: user.id }),
    prefs(context, user.id),
  ]);
  return row ? toFocusedDto(row, focusSessionMinutes) : null;
});

const tasksTask = ORPC.tasks.task.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  const row = await getTaskData(context.entities, { userId, id: input.id });
  if (!row) return null;
  return {
    ...toFullDto(row),
    tags: row.tags.map((tag) => ({ id: tag.id, name: tag.name })),
    updates: row.updates.map((update) => ({
      id: update.id,
      body: update.body,
      kind: update.kind === "COMPLETED" ? ("COMPLETED" as const) : ("NOTE" as const),
      createdAt: update.createdAt.toISOString(),
    })),
    project: row.project
      ? { id: row.project.id, permalink: row.project.permalink, name: row.project.name }
      : null,
    goal: row.goal
      ? { id: row.goal.id, permalink: row.goal.permalink, name: row.goal.name }
      : null,
    attachments: row.attachments,
  };
});

// ----------------------------------------------------------------
// S4 — list queries
// ----------------------------------------------------------------

const tasksToday = ORPC.tasks.today.handler(async ({ context }) => {
  const user = requireUser(context);
  return await getTodayTasksData(context.entities, { user, userId: user.id })
    .then((rows) => rows.map(toLensListRowDto));
});

const tasksWeek = ORPC.tasks.week.handler(async ({ context }) => {
  const user = requireUser(context);
  const { timeZone } = await prefs(context, user.id);
  return await getWeekTasksData(context.entities, {
    user,
    userId: user.id,
    timeZone,
  }).then((rows) => rows.map(toLensListRowDto));
});

const tasksDoneToday = ORPC.tasks.doneToday.handler(async ({ context, input }) => {
  const user = requireUser(context);
  const { timeZone } = await prefs(context, user.id);
  let lensIds: string[];
  if (input?.lensId) {
    await assertLensAllowed(context, user.id, input.lensId);
    lensIds = [input.lensId];
  } else {
    const accessible = await resolveAccessibleLenses(
      { Lens: context.entities.Lens },
      user,
      user.id,
    );
    lensIds = accessible.map((lens) => lens.id);
  }
  return await getDoneTodayData(context.entities, {
    userId: user.id,
    lensIds,
    timeZone,
  }).then((rows) => rows.map(toLensListRowDto));
});

const tasksByLens = ORPC.tasks.byLens.handler(async ({ context, input }) => {
  const user = requireUser(context);
  await assertLensAllowed(context, user.id, input.lensId);
  const rows = await getTasksData(context.entities, {
    userId: user.id,
    lensId: input.lensId,
    status: input.status,
    isDone: input.isDone,
  });
  return rows.map(toListRowDto);
});

const tasksAppData = ORPC.tasks.appData.handler(async ({ context, input }) => {
  const user = requireUser(context);
  return await getAppDataCore(
    {
      Task: {
        count: (args: { where: { userId: string; lensId?: unknown; status?: unknown; isDone?: unknown } }) =>
          context.entities.Task.count(args as never),
        updateMany: (args: never) => context.entities.Task.updateMany(args),
      },
      Lens: {
        findMany: (args: never) => context.entities.Lens.findMany(args),
      },
      User: extras(context).User,
    },
    { user, userId: user.id, lensId: input?.lensId ?? null },
  );
});

const tasksPickProjects = ORPC.tasks.pickProjects.handler(async ({ context, input }) => {
  const user = requireUser(context);
  // Entitlement parity with the webapp's getProjects: the row-editor picker
  // is a lens-scoped read, so a locked lens stays behind the Pro gate.
  await assertLensAllowed(context, user.id, input.lensId);
  const rows = await extras(context).Project.findMany({
    where: { userId: user.id, lensId: input.lensId, isDone: false },
  });
  return rows.map((project) => ({
    id: project.id,
    name: project.name,
    goalName: project.goalName ?? null,
  }));
});

const tasksPickGoals = ORPC.tasks.pickGoals.handler(async ({ context, input }) => {
  const user = requireUser(context);
  // Entitlement parity with the webapp's getGoals (lens-scoped read).
  await assertLensAllowed(context, user.id, input.lensId);
  const rows = await extras(context).Goal.findMany({
    where: { userId: user.id, lensId: input.lensId, isDone: false },
  });
  return rows.map((goal) => ({ id: goal.id, name: goal.name }));
});

// ----------------------------------------------------------------
// S1 — focus lifecycle actions
// ----------------------------------------------------------------

const tasksStart = ORPC.tasks.start.handler(async ({ context, input }) => {
  const user = requireUser(context);
  const { focusSessionMinutes } = await prefs(context, user.id);
  return await run(async () => {
    const result = await startTaskCore(context.entities, {
      userId: user.id,
      id: input.id,
      focusSessionMinutes,
    });
    return { id: result.id, startedAt: iso(result.startedAt) };
  });
});

const tasksPause = ORPC.tasks.pause.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  return await run(async () => {
    const result = await pauseTaskCore(context.entities, {
      userId,
      id: input.id,
    });
    return { id: result.id, startedAt: iso(result.startedAt) };
  });
});

const tasksCompleteSession = ORPC.tasks.completeSession.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  return await run(async () => {
    const result = await completeFocusSessionCore(context.entities, {
      userId,
      id: input.id,
    });
    return result.completed
      ? { completed: true as const, endedAt: result.endedAt.toISOString() }
      : { completed: false as const };
  });
});

const tasksComplete = ORPC.tasks.complete.handler(async ({ context, input }) => {
  const user = requireUser(context);
  return await run(async () => {
    const result = await completeTaskFromFocusCore(allEntities(context), {
      userId: user.id,
      taskId: input.taskId,
      outcome: input.outcome,
    });
    return { id: result.id, completedAt: iso(result.completedAt) };
  });
});

const tasksSnooze = ORPC.tasks.snooze.handler(async ({ context, input }) => {
  const user = requireUser(context);
  const { timeZone } = await prefs(context, user.id);
  return await run(async () => {
    const result = await snoozeTaskCore(context.entities, {
      userId: user.id,
      id: input.id,
      preset: input.preset,
      timeZone,
    });
    return {
      id: result.id,
      status: result.status,
      scheduledDate: wireDate(result.scheduledDate),
      snoozedUntil: iso(result.snoozedUntil),
    };
  });
});

const tasksToggleDone = ORPC.tasks.toggleDone.handler(async ({ context, input }) => {
  const user = requireUser(context);
  return await run(async () => {
    const result = await toggleTaskDoneCore(context.entities, {
      userId: user.id,
      id: input.id,
      outcome: input.outcome,
    });
    if (result.isDone && result.isOnboardingSample) {
      await extras(context).User.updateMany({
        where: { id: user.id, onboardingStage: "SAMPLE_TASK" },
        data: { onboardingStage: "CAPTURE" },
      });
    }
    return { id: result.id, isDone: result.isDone, completedAt: iso(result.completedAt) };
  });
});

const tasksAddUpdate = ORPC.tasks.addUpdate.handler(async ({ context, input }) => {
  const user = requireUser(context);
  return await run(async () => {
    const row = await addTaskUpdateCore(allEntities(context), {
      userId: user.id,
      taskId: input.taskId,
      body: input.body,
    });
    return {
      id: row.id,
      body: row.body,
      kind: row.kind === "COMPLETED" ? ("COMPLETED" as const) : ("NOTE" as const),
      createdAt: row.createdAt.toISOString(),
    };
  });
});

const tasksUpdateContent = ORPC.tasks.updateContent.handler(async ({ context, input }) => {
  const user = requireUser(context);
  return await run(async () => {
    const row = await updateTaskContentCore(allEntities(context), {
      userId: user.id,
      taskId: input.taskId,
      content: input.content,
    });
    return { id: row.id, content: row.content ?? null };
  });
});

const tasksSetOutcome = ORPC.tasks.setOutcome.handler(async ({ context, input }) => {
  const user = requireUser(context);
  return await run(async () => {
    const row = await setTaskOutcomeCore(allEntities(context), {
      userId: user.id,
      taskId: input.taskId,
      outcome: input.outcome,
    });
    return { id: row.id, outcome: row.outcome ?? null };
  });
});

const tasksUpdateDetails = ORPC.tasks.updateDetails.handler(async ({ context, input }) => {
  const user = requireUser(context);
  return await run(async () => {
    const row = await updateTaskDetailsCore(allEntities(context), {
      userId: user.id,
      taskId: input.taskId,
      description: input.description,
      content: input.content,
      priority: input.priority,
      size: input.size,
      status: input.status,
      scheduledDate:
        input.scheduledDate === undefined
          ? undefined
          : input.scheduledDate === null
            ? null
            : dbDate(input.scheduledDate),
      projectId: input.projectId,
      goalId: input.goalId,
    });
    return {
      id: row.id,
      description: row.description,
      content: row.content ?? null,
      priority: row.priority,
      size: row.size,
      status: row.status,
      scheduledDate: wireDate(row.scheduledDate),
      snoozedUntil: iso(row.snoozedUntil),
      projectId: row.projectId ?? null,
      goalId: row.goalId ?? null,
    };
  });
});

const tasksUpdateStatus = ORPC.tasks.updateStatus.handler(async ({ context, input }) => {
  const user = requireUser(context);
  const { timeZone } = await prefs(context, user.id);
  return await run(async () => {
    const row = await updateTaskStatusCore(context.entities, {
      userId: user.id,
      id: input.id,
      status: input.status,
      scheduledDate:
        input.scheduledDate === undefined || input.scheduledDate === null
          ? input.scheduledDate
          : dbDate(input.scheduledDate),
      snoozedUntil:
        input.snoozedUntil === undefined || input.snoozedUntil === null
          ? input.snoozedUntil
          : toInstant(input.snoozedUntil),
      timeZone,
    });
    return toFullDto(row);
  });
});

const tasksUnscheduleOverdue = ORPC.tasks.unscheduleOverdue.handler(async ({ context, input }) => {
  const user = requireUser(context);
  await assertLensAllowed(context, user.id, input.lensId);
  const { timeZone } = await prefs(context, user.id);
  const today = plainDateToDb(instantToPlainDate(Temporal.Now.instant(), timeZone));
  return await unscheduleOverdueTasksCore(context.entities, {
    userId: user.id,
    lensId: input.lensId,
    today,
  });
});

// ----------------------------------------------------------------
// S4 — Simple-list checklist
// ----------------------------------------------------------------

/** Lens-entitlement parity for a list project (a locked lens stays gated). */
async function assertProjectLensAllowed(context: ApiContext, userId: string, projectId: string) {
  const lensRef = await simpleEntities(context).Project.findLens({
    where: { id: projectId, userId },
  });
  if (lensRef) await assertLensAllowed(context, userId, lensRef.lensId);
}

async function assertItemLensAllowed(context: ApiContext, userId: string, id: string) {
  const lensRef = await simpleEntities(context).Project.findLensByItem({
    where: { id, userId },
  });
  if (lensRef) await assertLensAllowed(context, userId, lensRef.lensId);
}

function toListItemDto(row: {
  id: string;
  text: string;
  content: string | null;
  sourceUrl: string | null;
  isDone: boolean;
  order: number;
  completedAt: Date | null;
  createdAt: Date;
  attachments?: Array<{ id: string; filename: string; mimeType: string }>;
}) {
  return {
    id: row.id,
    text: row.text,
    content: row.content ?? null,
    sourceUrl: row.sourceUrl ?? null,
    isDone: row.isDone,
    order: row.order,
    completedAt: iso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    attachments: row.attachments ?? [],
  };
}

const tasksListProject = ORPC.tasks.listProject.handler(async ({ context, input }) => {
  const user = requireUser(context);
  const row = await extras(context).Project.findFirst({
    where: { userId: user.id, permalink: input.permalink },
  });
  if (!row) return null;
  // Entitlement: the checklist page host must gate like the webapp's project
  // read — a SIMPLE_LIST project in a locked lens is behind the Pro gate.
  await assertLensAllowed(context, user.id, row.lensId);
  return { id: row.id, permalink: row.permalink, name: row.name, type: row.type };
});

const tasksSimpleList = ORPC.tasks.simpleList.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  await assertProjectLensAllowed(context, userId, input.projectId);
  return await run(async () => {
    const rows = await getSimpleListCore(simpleEntities(context), {
      userId,
      projectId: input.projectId,
    });
    return rows.map(toListItemDto);
  });
});

const tasksCreateListItem = ORPC.tasks.createListItem.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  await assertProjectLensAllowed(context, userId, input.projectId);
  return await run(async () => {
    const row = await createListItemCore(simpleEntities(context), {
      userId,
      projectId: input.projectId,
      text: input.text,
      content: input.content,
      sourceUrl: input.sourceUrl,
    });
    return toListItemDto(row);
  });
});

const tasksRenameListItem = ORPC.tasks.renameListItem.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  await assertItemLensAllowed(context, userId, input.id);
  return await run(async () => {
    const row = await renameListItemCore(simpleEntities(context), {
      userId,
      id: input.id,
      text: input.text,
    });
    return toListItemDto(row);
  });
});

const tasksSetListItemDone = ORPC.tasks.setListItemDone.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  await assertItemLensAllowed(context, userId, input.id);
  return await run(async () => {
    const row = await setListItemDoneCore(simpleEntities(context), {
      userId,
      id: input.id,
      isDone: input.isDone,
    });
    return toListItemDto(row);
  });
});

const tasksDeleteListItem = ORPC.tasks.deleteListItem.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  await assertItemLensAllowed(context, userId, input.id);
  return await run(async () => {
    await deleteListItemCore(simpleEntities(context), { userId, id: input.id });
    return { ok: true as const };
  });
});

const tasksClearCompletedListItems = ORPC.tasks.clearCompletedListItems.handler(
  async ({ context, input }) => {
    const userId = requireUser(context).id;
    await assertProjectLensAllowed(context, userId, input.projectId);
    return await run(async () => {
      const result = await clearCompletedListItemsCore(simpleEntities(context), {
        userId,
        projectId: input.projectId,
      });
      return { count: result.count };
    });
  },
);

/** The implemented tasks fragment — composed by src/router.ts. */
export const tasksProcedures = {
  list: tasksList,
  detail: tasksDetail,
  // S1 — What Now + Focus:
  topTask: tasksTopTask,
  alternatives: tasksAlternatives,
  otherLensCounts: tasksOtherLensCounts,
  focusedTask: tasksFocusedTask,
  task: tasksTask,
  start: tasksStart,
  pause: tasksPause,
  completeSession: tasksCompleteSession,
  complete: tasksComplete,
  snooze: tasksSnooze,
  toggleDone: tasksToggleDone,
  addUpdate: tasksAddUpdate,
  updateContent: tasksUpdateContent,
  // S4 — lists + writes:
  today: tasksToday,
  week: tasksWeek,
  doneToday: tasksDoneToday,
  byLens: tasksByLens,
  appData: tasksAppData,
  pickProjects: tasksPickProjects,
  pickGoals: tasksPickGoals,
  setOutcome: tasksSetOutcome,
  updateDetails: tasksUpdateDetails,
  updateStatus: tasksUpdateStatus,
  unscheduleOverdue: tasksUnscheduleOverdue,
  // S4 — Simple lists:
  listProject: tasksListProject,
  simpleList: tasksSimpleList,
  createListItem: tasksCreateListItem,
  renameListItem: tasksRenameListItem,
  setListItemDone: tasksSetListItemDone,
  deleteListItem: tasksDeleteListItem,
  clearCompletedListItems: tasksClearCompletedListItems,
};
