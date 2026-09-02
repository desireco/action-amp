/**
 * The tasks contract — the first real oRPC contract (F8b), extended by the
 * S1 (What Now + Focus) + S4 (Tasks & lists) batch.
 *
 * Contract-first: zod schemas + `oc` builders define the wire surface here;
 * apps/api implements it (`implement(contractRouter)` → `.handler(...)`) and
 * every client consumes it as types (`ContractRouterClient`). Zod on `input`
 * gives the error taxonomy for free: a schema violation surfaces as an oRPC
 * `BAD_REQUEST` (4xx) before any handler runs.
 *
 * S1+S4 additions mirror the webapp ops (packages/contract/src/s1-what-now/
 * README.md + s4-tasks-lists/README.md are the parity checklists): the What
 Now engine (top task + alternatives + other-lens hints + focus lifecycle),
 the capped Today list + Week horizon + Done-today, lens-scoped lists,
 task detail/lifecycle writes, and the Simple-list checklist CRUD.
 *
 * Wire conventions for the new procedures:
 * - Temporal fields cross as JSON-safe strings: instants as ISO-8601
 *   (`2026-09-01T09:30:00.000Z`), calendar days (`Task.scheduledDate`,
 *   `@db.Date`) as plain `yyyy-MM-dd`. The API layer owns the conversion;
 *   outputs render as-is, inputs parse to UTC-midnight `Date`s.
 * - Output schemas are exactly the slices the screens render (the P0 notes'
 *   "output schemas = what the screens render").
 *
 * The original F8b procedures (`list`, `detail`) and DTOs are kept intact.
 */

import { oc } from "@orpc/contract";
import { z } from "zod";
import { ProGateErrorMap } from "./projects.js";

/** `enum TaskStatus` (webapp/schema.prisma) — wire format is the string union. */
export const TaskStatusSchema = z.enum(["SOMEDAY", "UPCOMING", "TODAY", "WONT_DO"]);

/** `enum Priority` (webapp/schema.prisma). */
export const PrioritySchema = z.enum(["LOW", "NORMAL", "IMPORTANT"]);

/** `enum Size` (webapp/schema.prisma). */
export const SizeSchema = z.enum(["S", "M", "L", "XL"]);

/** `enum TaskUpdateKind` (webapp/schema.prisma). */
export const TaskUpdateKindSchema = z.enum(["NOTE", "COMPLETED"]);

/** ISO-8601 instant on the wire (e.g. `2026-09-01T09:30:00.000Z`). */
const IsoDateTime = z.string();
/** Calendar day on the wire (`yyyy-MM-dd`) — `Task.scheduledDate` (`@db.Date`). */
const IsoDate = z.string();

/**
 * List-row slice of the `Task` model: the fields a list screen renders.
 * Supersedes the placeholder DTO that lived in router-type.ts before F8b.
 */
export const TaskSchema = z.object({
  id: z.string(),
  /** The title — what to do (`Task.description` in schema.prisma). */
  description: z.string(),
  status: TaskStatusSchema,
  priority: PrioritySchema,
  isDone: z.boolean(),
  /** Manual sort order within a list (`order Int @default(0)`). */
  order: z.number().int(),
});

/** Detail row: the list slice plus the fields a detail screen needs. */
export const TaskDetailSchema = TaskSchema.extend({
  /** Slug id for URLs (`Task.permalink`, unique per user). */
  permalink: z.string(),
  /** Long-form notes (`Task.content`) — null when the task has none. */
  content: z.string().nullable(),
});

// ----------------------------------------------------------------
// S1 + S4 DTOs — the slices What Now, Focus, the lists, the detail
// page, and the Simple-list checklist render.
// ----------------------------------------------------------------

/** Every `Task` scalar the S1/S4 screens read (temporal fields as strings). */
export const TaskFullSchema = z.object({
  id: z.string(),
  permalink: z.string(),
  description: z.string(),
  content: z.string().nullable(),
  outcome: z.string().nullable(),
  isDone: z.boolean(),
  isOnboardingSample: z.boolean(),
  priority: PrioritySchema,
  size: SizeSchema,
  status: TaskStatusSchema,
  order: z.number().int(),
  scheduledDate: IsoDate.nullable(),
  snoozedUntil: IsoDateTime.nullable(),
  startedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});

const TagSchema = z.object({ id: z.string(), name: z.string() });
const TaskUpdateDtoSchema = z.object({
  id: z.string(),
  body: z.string(),
  kind: TaskUpdateKindSchema,
  createdAt: IsoDateTime,
});
const AttachmentDtoSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
});
const GoalRefSchema = z.object({
  id: z.string(),
  permalink: z.string(),
  name: z.string(),
  description: z.string(),
});

/**
 * The What Now winner: full scalars + the hydrated history the card and
 * Focus render (project→goal chain, sessions, NOTE updates newest-first,
 * attachments). Mirrors `hydrateTopTaskData`'s include.
 */
export const WhatNowTaskSchema = TaskFullSchema.extend({
  project: z
    .object({
      id: z.string(),
      permalink: z.string(),
      name: z.string(),
      goal: z.object({ id: z.string(), name: z.string(), description: z.string() }).nullable(),
    })
    .nullable(),
  goal: GoalRefSchema.nullable(),
  /** Closed + open sessions, oldest first (continuity math input). */
  sessions: z.array(z.object({ startedAt: IsoDateTime, endedAt: IsoDateTime.nullable() })),
  /** NOTE-only updates, newest first (latest-note preview input). */
  notes: z.array(z.object({ body: z.string(), createdAt: IsoDateTime })),
  attachments: z.array(AttachmentDtoSchema),
});

/** A ranked-pool candidate (alternatives rail): scalars + light refs. */
export const RankedTaskSchema = TaskFullSchema.extend({
  project: z.object({ id: z.string(), name: z.string() }).nullable(),
  goal: z.object({ id: z.string(), name: z.string() }).nullable(),
});

/** The focused task: full thread + sessions + the user's session length. */
export const FocusedTaskSchema = WhatNowTaskSchema.extend({
  tags: z.array(TagSchema),
  /** Full activity thread, oldest first (Focus's append-only timeline). */
  updates: z.array(TaskUpdateDtoSchema),
  /** Focus sessions carry the countdown fields (plannedMinutes, completed). */
  sessions: z.array(
    z.object({
      startedAt: IsoDateTime,
      endedAt: IsoDateTime.nullable(),
      plannedMinutes: z.number().int().nullable(),
      completed: z.boolean(),
    }),
  ),
  /** `User.focusSessionMinutes` (closed set 25|45) for legacy sessions. */
  focusSessionMinutes: z.union([z.literal(25), z.literal(45)]),
});

/** A list row with tags + light project/goal refs (Upcoming/Someday rows). */
export const TaskListRowSchema = TaskFullSchema.extend({
  tags: z.array(TagSchema),
  project: z.object({ id: z.string(), name: z.string() }).nullable(),
  goal: z.object({ id: z.string(), name: z.string() }).nullable(),
});

/** A list row that also carries its lens (Today/Week/Done-today pills). */
export const TaskLensListRowSchema = TaskListRowSchema.extend({
  lens: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable(),
});

/** App-shell bootstrap data (S4): lenses + counts + the Today cap + prefs. */
export const AppDataSchema = z.object({
  lenses: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string().nullable(),
      isIncluded: z.boolean(),
      purpose: z.string().nullable(),
    }),
  ),
  counts: z.object({
    today: z.number().int(),
    upcoming: z.number().int(),
    someday: z.number().int(),
  }),
  todayCap: z.number().int(),
  focusSessionMinutes: z.union([z.literal(25), z.literal(45)]),
  timeZone: z.string(),
});

/** A Simple-list item + its captured attachments. */
export const ListItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  content: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  isDone: z.boolean(),
  order: z.number().int(),
  completedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  attachments: z.array(AttachmentDtoSchema),
});

/** The project row a SIMPLE_LIST page host needs (by permalink). */
export const ListProjectSchema = z.object({
  id: z.string(),
  permalink: z.string(),
  name: z.string(),
  type: z.enum(["STANDARD", "SIMPLE_LIST"]),
});

/** The snooze presets ("Not now" sheet). */
export const SnoozePresetSchema = z.enum(["1h", "3h", "tomorrow", "weekend", "someday"]);

/**
 * The user's open tasks in list order — what the work screen renders.
 * No input: the user comes from the request context (F10 wires real auth;
 * today the seeded dev user is resolved server-side).
 */
export const listTasks = oc.output(z.array(TaskSchema));

/**
 * One task by id or permalink — the detail-page lookup (the core matches
 * either). Missing task → `null`, not an error: callers null-check, keeping
 * the client error surface to transport failures. Input is zod-validated: an
 * empty id rejects with BAD_REQUEST (4xx).
 */
export const getTaskDetail = oc
  .input(z.object({ id: z.string().min(1) }))
  .output(TaskDetailSchema.nullable());

// ----------------------------------------------------------------
// S1 — What Now + Focus queries
// ----------------------------------------------------------------

/** The ranked #1 candidate for a lens, hydrated for the card (null = empty). */
export const topTask = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1) }))
  .output(WhatNowTaskSchema.nullable());

/** The alternatives rail: same ranked pool minus `excludeIds`, capped at 2. */
export const alternatives = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1), excludeIds: z.array(z.string()).optional() }))
  .output(z.array(RankedTaskSchema));

/** Per-other-lens actionable counts for the empty state's lens hints. */
export const otherLensCounts = oc
  .input(z.object({ excludeLensId: z.string().min(1) }))
  .output(z.array(z.object({ lensId: z.string(), lensName: z.string(), count: z.number().int() })));

/** The user's one started task with its full history (null = nothing started). */
export const focusedTask = oc.output(FocusedTaskSchema.nullable());

/** Full task detail by id or permalink — tags + chronological updates. */
export const task = oc
  .input(z.object({ id: z.string().min(1) }))
  .output(
    TaskFullSchema
      .extend({
        tags: z.array(TagSchema),
        updates: z.array(TaskUpdateDtoSchema),
        project: z.object({ id: z.string(), permalink: z.string(), name: z.string() }).nullable(),
        goal: z.object({ id: z.string(), permalink: z.string(), name: z.string() }).nullable(),
        attachments: z.array(AttachmentDtoSchema),
      })
      .nullable(),
  );

// ----------------------------------------------------------------
// S4 — list queries
// ----------------------------------------------------------------

/** Global Today: accessible lenses, status TODAY, not done (capped client-side). */
export const today = oc.output(z.array(TaskLensListRowSchema));

/** Global Week horizon: TODAY + dated-by-week-end UPCOMING (overdue admitted). */
export const week = oc.output(z.array(TaskLensListRowSchema));

/** Done-today (status TODAY, completed since local midnight, newest first). */
export const doneToday = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1).optional() }))
  .output(z.array(TaskLensListRowSchema));

/** Lens-scoped list by status (Upcoming / Someday). */
export const byLens = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      lensId: z.string().min(1),
      status: z.enum(["TODAY", "UPCOMING", "SOMEDAY"]).optional(),
      isDone: z.boolean().optional(),
    }),
  )
  .output(z.array(TaskListRowSchema));

/** App-shell bootstrap: lenses, counts, todayCap, focusSessionMinutes, timeZone. */
export const appData = oc
  .input(z.object({ lensId: z.string().min(1).optional() }))
  .output(AppDataSchema);

/** Project picker rows for the row-editor/detail chip pickers. */
export const pickProjects = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1) }))
  .output(z.array(z.object({ id: z.string(), name: z.string(), goalName: z.string().nullable() })));

/** Goal picker rows. */
export const pickGoals = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1) }))
  .output(z.array(z.object({ id: z.string(), name: z.string() })));

// ----------------------------------------------------------------
// S1 — focus lifecycle actions
// ----------------------------------------------------------------

/** Start (or re-navigate to) the Now state: single-Now invariant applies. */
export const start = oc
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ id: z.string(), startedAt: IsoDateTime.nullable() }));

/** Pause: back to Next; open session closed. */
export const pause = oc
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ id: z.string(), startedAt: IsoDateTime.nullable() }));

/** Record a countdown that reached zero (server-time guarded; planned end). */
export const completeSession = oc
  .input(z.object({ id: z.string().min(1) }))
  .output(
    z.union([
      z.object({ completed: z.literal(false) }),
      z.object({ completed: z.literal(true), endedAt: IsoDateTime }),
    ]),
  );

/** Complete from focus (idempotent; writes the COMPLETED thread event). */
export const complete = oc
  .input(z.object({ taskId: z.string().min(1), outcome: z.string().optional() }))
  .output(z.object({ id: z.string(), completedAt: IsoDateTime.nullable() }));

/** "Not now": exact-instant snooze presets. */
export const snooze = oc
  .input(z.object({ id: z.string().min(1), preset: SnoozePresetSchema }))
  .output(
    z.object({
      id: z.string(),
      status: TaskStatusSchema,
      scheduledDate: IsoDate.nullable(),
      snoozedUntil: IsoDateTime.nullable(),
    }),
  );

/** Flip done state (row/detail affordances); always clears startedAt. */
export const toggleDone = oc
  .input(z.object({ id: z.string().min(1), outcome: z.string().optional() }))
  .output(z.object({ id: z.string(), isDone: z.boolean(), completedAt: IsoDateTime.nullable() }));

/** Append a NOTE to the activity thread (never mutates task fields). */
export const addUpdate = oc
  .input(z.object({ taskId: z.string().min(1), body: z.string() }))
  .output(TaskUpdateDtoSchema);

/** The durable clarification (`Task.content`), separate from the thread. */
export const updateContent = oc
  .input(z.object({ taskId: z.string().min(1), content: z.string() }))
  .output(z.object({ id: z.string(), content: z.string().nullable() }));

/** The outcome note — writable anytime, independent of done state. */
export const setOutcome = oc
  .input(z.object({ taskId: z.string().min(1), outcome: z.string() }))
  .output(z.object({ id: z.string(), outcome: z.string().nullable() }));

/** Partial patch of the core task fields (row editors + detail Save). */
export const updateDetails = oc
  .input(
    z.object({
      taskId: z.string().min(1),
      description: z.string().optional(),
      content: z.string().optional(),
      priority: PrioritySchema.optional(),
      size: SizeSchema.optional(),
      status: z.enum(["TODAY", "UPCOMING", "SOMEDAY"]).optional(),
      scheduledDate: IsoDate.nullable().optional(),
      projectId: z.string().nullable().optional(),
      goalId: z.string().nullable().optional(),
    }),
  )
  .output(
    z.object({
      id: z.string(),
      description: z.string(),
      content: z.string().nullable(),
      priority: PrioritySchema,
      size: SizeSchema,
      status: TaskStatusSchema,
      scheduledDate: IsoDate.nullable(),
      snoozedUntil: IsoDateTime.nullable(),
      projectId: z.string().nullable(),
      goalId: z.string().nullable(),
    }),
  );

/** Move between Today / Upcoming / Someday (+ WONT_DO from detail). */
export const updateStatus = oc
  .input(
    z.object({
      id: z.string().min(1),
      status: TaskStatusSchema,
      scheduledDate: IsoDate.nullable().optional(),
      snoozedUntil: IsoDateTime.nullable().optional(),
    }),
  )
  .output(TaskFullSchema);

/** Clear past dates from the Upcoming bench (lens-scoped recovery action). */
export const unscheduleOverdue = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1) }))
  .output(z.object({ count: z.number().int() }));

// ----------------------------------------------------------------
// S4 — Simple-list checklist
// ----------------------------------------------------------------

/** A SIMPLE_LIST project by permalink (the checklist page host lookup). */
export const listProject = oc
  .errors(ProGateErrorMap)
  .input(z.object({ permalink: z.string().min(1) }))
  .output(ListProjectSchema.nullable());

/** The checklist body: open before checked, stable order.
 *  402 when the checklist's project sits in a non-included lens. */
export const simpleList = oc
  .errors(ProGateErrorMap)
  .input(z.object({ projectId: z.string().min(1) }))
  .output(z.array(ListItemSchema));

export const createListItem = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      projectId: z.string().min(1),
      text: z.string(),
      content: z.string().optional(),
      sourceUrl: z.string().optional(),
    }),
  )
  .output(ListItemSchema);

export const renameListItem = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string().min(1), text: z.string() }))
  .output(ListItemSchema);

export const setListItemDone = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string().min(1), isDone: z.boolean() }))
  .output(ListItemSchema);

export const deleteListItem = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ ok: z.literal(true) }));

export const clearCompletedListItems = oc
  .errors(ProGateErrorMap)
  .input(z.object({ projectId: z.string().min(1) }))
  .output(z.object({ count: z.number().int() }));

/**
 * The tasks namespace — paths: POST /rpc/tasks/list, POST /rpc/tasks/detail,
 * plus the S1/S4 paths above (`POST /rpc/tasks/<name>`). Composed into the
 * tree by src/router.ts (the one composition point).
 */
export const tasksContract = {
  list: listTasks,
  detail: getTaskDetail,
  // S1 — What Now + Focus:
  topTask,
  alternatives,
  otherLensCounts,
  focusedTask,
  task,
  start,
  pause,
  completeSession,
  complete,
  snooze,
  toggleDone,
  addUpdate,
  updateContent,
  // S4 — lists + writes:
  today,
  week,
  doneToday,
  byLens,
  appData,
  pickProjects,
  pickGoals,
  setOutcome,
  updateDetails,
  updateStatus,
  unscheduleOverdue,
  // S4 — Simple lists:
  listProject,
  simpleList,
  createListItem,
  renameListItem,
  setListItemDone,
  deleteListItem,
  clearCompletedListItems,
};
