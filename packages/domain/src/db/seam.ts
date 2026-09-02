// F4b — the SEAM CONTRACT: Prisma-shaped argument types + delegate interfaces.
//
// The ported `operationsCore`s speak Prisma's delegate dialect (`findMany({
// where, orderBy, include })`, `.update({ where, data, select })`, …). This
// module re-expresses that dialect without the Prisma client: filter/where/
// orderBy/data types covering exactly the shapes the ported cores pass (each
// is inventoried in docs/plans/tasks-port-inventory.md), plus the
// `Task`/`TaskSession`/`Lens` delegate interfaces `createEntities`
// (`./client.ts`) implements and F4c's Vitest mocks will fake.
//
// Fidelity notes (inherited from the original core slices, kept deliberately):
// - `undefined` means "leave untouched", `null` means "set NULL" — the Drizzle
//   implementation preserves both (Prisma semantics).
// - Where a core passed a `select` but its slice declared the full-row return
//   (e.g. `TaskSession.findFirst`), the seam keeps that widened return type;
//   the implementation still prunes the runtime payload to the select.
import type {
  Lens,
  ManualAccessGrant,
  Plan,
  Priority,
  Size,
  Tag,
  Task,
  TaskSession,
  TaskStatus,
  TaskUpdateKind,
} from "./types.js";

// ----------------------------------------------------------------
// Scalar filter primitives (the Prisma `XFilter` subset actually used)
// ----------------------------------------------------------------

export type SortOrder = "asc" | "desc";

export interface StringFilter {
  equals?: string;
  in?: string[];
  not?: string | StringFilter;
}

export interface StringNullableFilter {
  equals?: string | null;
  in?: string[];
  not?: string | StringNullableFilter | null;
}

export interface BoolFilter {
  equals?: boolean;
  not?: boolean;
}

export interface EnumFilter<T extends string> {
  equals?: T;
  in?: T[];
  not?: T | EnumFilter<T>;
}

export interface EnumNullableFilter<T extends string> {
  equals?: T | null;
  in?: T[];
  not?: T | EnumNullableFilter<T> | null;
}

export interface DateTimeFilter {
  equals?: Date;
  in?: Date[];
  lt?: Date;
  lte?: Date;
  gt?: Date;
  gte?: Date;
  not?: Date | DateTimeFilter;
}

export interface DateTimeNullableFilter {
  equals?: Date | null;
  in?: Date[];
  lt?: Date | null;
  lte?: Date | null;
  gt?: Date | null;
  gte?: Date | null;
  not?: Date | DateTimeNullableFilter | null;
}

// ----------------------------------------------------------------
// Where inputs (Prisma `XWhereInput` for the three delegates in play)
// ----------------------------------------------------------------

export interface TaskWhereInput {
  id?: string;
  permalink?: string;
  userId?: string;
  lensId?: string | StringNullableFilter;
  projectId?: string | StringNullableFilter;
  goalId?: string | StringNullableFilter;
  description?: string | StringFilter;
  content?: string | StringNullableFilter;
  outcome?: string | StringNullableFilter;
  isDone?: boolean | BoolFilter;
  isOnboardingSample?: boolean | BoolFilter;
  priority?: Priority | EnumNullableFilter<Priority>;
  size?: Size | EnumNullableFilter<Size>;
  status?: TaskStatus | EnumNullableFilter<TaskStatus>;
  createdAt?: Date | DateTimeFilter;
  updatedAt?: Date | DateTimeFilter;
  completedAt?: Date | null | DateTimeNullableFilter;
  startedAt?: Date | null | DateTimeNullableFilter;
  scheduledDate?: Date | null | DateTimeNullableFilter;
  snoozedUntil?: Date | null | DateTimeNullableFilter;
  AND?: TaskWhereInput[];
  OR?: TaskWhereInput[];
  NOT?: TaskWhereInput | TaskWhereInput[];
}

export interface TaskSessionWhereInput {
  id?: string;
  taskId?: string;
  userId?: string;
  completed?: boolean | BoolFilter;
  startedAt?: Date | DateTimeFilter;
  endedAt?: Date | null | DateTimeNullableFilter;
  AND?: TaskSessionWhereInput[];
  OR?: TaskSessionWhereInput[];
  NOT?: TaskSessionWhereInput | TaskSessionWhereInput[];
}

export interface LensWhereInput {
  id?: string;
  userId?: string;
  name?: string | StringFilter;
  color?: string | StringNullableFilter;
  purpose?: string | StringNullableFilter;
  isDefault?: boolean | BoolFilter;
  isIncluded?: boolean | BoolFilter;
  createdAt?: Date | DateTimeFilter;
  AND?: LensWhereInput[];
  OR?: LensWhereInput[];
  NOT?: LensWhereInput | LensWhereInput[];
}

/** User filters — only what billing constants + future billing cores pass
 *  (e.g. `FOUNDER_MEMBERSHIP_WHERE`). No delegate exists for it yet. */
export interface UserWhereInput {
  id?: string;
  plan?: Plan | EnumFilter<Plan>;
  manualAccessGrant?: ManualAccessGrant | null | EnumNullableFilter<ManualAccessGrant>;
  AND?: UserWhereInput[];
  OR?: UserWhereInput[];
  NOT?: UserWhereInput | UserWhereInput[];
}

// ----------------------------------------------------------------
// OrderBy inputs (Prisma `XOrderByWithRelationInput`, scalars only)
// ----------------------------------------------------------------

export interface TaskOrderBy {
  id?: SortOrder;
  permalink?: SortOrder;
  userId?: SortOrder;
  lensId?: SortOrder;
  projectId?: SortOrder;
  goalId?: SortOrder;
  description?: SortOrder;
  content?: SortOrder;
  outcome?: SortOrder;
  isDone?: SortOrder;
  isOnboardingSample?: SortOrder;
  priority?: SortOrder;
  size?: SortOrder;
  status?: SortOrder;
  order?: SortOrder;
  createdAt?: SortOrder;
  updatedAt?: SortOrder;
  completedAt?: SortOrder;
  startedAt?: SortOrder;
  scheduledDate?: SortOrder;
  snoozedUntil?: SortOrder;
}
export type TaskOrderByInput = TaskOrderBy | TaskOrderBy[];

export interface TaskSessionOrderBy {
  id?: SortOrder;
  taskId?: SortOrder;
  userId?: SortOrder;
  completed?: SortOrder;
  plannedMinutes?: SortOrder;
  startedAt?: SortOrder;
  endedAt?: SortOrder;
}
export type TaskSessionOrderByInput = TaskSessionOrderBy | TaskSessionOrderBy[];

export interface LensOrderBy {
  id?: SortOrder;
  userId?: SortOrder;
  name?: SortOrder;
  color?: SortOrder;
  purpose?: SortOrder;
  isDefault?: SortOrder;
  isIncluded?: SortOrder;
  createdAt?: SortOrder;
}
export type LensOrderByInput = LensOrderBy | LensOrderBy[];

// ----------------------------------------------------------------
// Write inputs (Prisma `XUpdateInput` / `XCreateInput` scalars)
// ----------------------------------------------------------------

/** Task patch — `undefined` leaves a field untouched, `null` clears it. */
export interface TaskUpdateInput {
  description?: string;
  content?: string | null;
  outcome?: string | null;
  isDone?: boolean;
  isOnboardingSample?: boolean;
  priority?: Priority;
  size?: Size;
  status?: TaskStatus;
  order?: number;
  permalink?: string;
  lensId?: string;
  projectId?: string | null;
  goalId?: string | null;
  completedAt?: Date | null;
  startedAt?: Date | null;
  scheduledDate?: Date | null;
  snoozedUntil?: Date | null;
}

export interface TaskSessionCreateInput {
  id?: string;
  taskId: string;
  userId: string;
  startedAt?: Date;
  endedAt?: Date | null;
  completed?: boolean;
  plannedMinutes?: number | null;
}

export interface TaskSessionUpdateInput {
  taskId?: string;
  userId?: string;
  startedAt?: Date;
  endedAt?: Date | null;
  completed?: boolean;
  plannedMinutes?: number | null;
}

/** Prisma's `{ count }` result for updateMany/deleteMany. */
export interface BatchPayload {
  count: number;
}

// ----------------------------------------------------------------
// Include shapes — the literal relation projections the cores pass
// ----------------------------------------------------------------

export interface ProjectRefInclude {
  select: { id: true; name: true };
}
export interface ProjectPermalinkInclude {
  select: { id: true; permalink: true; name: true };
}
export interface ProjectWithGoalInclude {
  select: {
    id: true;
    permalink: true;
    name: true;
    goal: { select: { id: true; name: true; description: true } };
  };
}
export interface GoalPermalinkInclude {
  select: { id: true; permalink: true; name: true; description: true };
}
export interface LensPillInclude {
  select: { id: true; name: true; color: true };
}
export interface AttachmentsInclude {
  select: { id: true; filename: true; mimeType: true };
}
export interface UpdatesChronoInclude {
  orderBy: { createdAt: SortOrder };
}
export interface NoteUpdatesInclude {
  where: { kind: TaskUpdateKind };
  orderBy: { createdAt: SortOrder };
  select: { body: true; createdAt: true };
}
export interface SessionsInclude {
  orderBy: { startedAt: SortOrder };
  select: { startedAt: true; endedAt: true };
}

// ---- Composite include families (one per read shape) ----

/** getTasksData — Today/Upcoming/Someday/Logbook list rows. */
export interface TaskListInclude {
  tags: true;
  project: ProjectRefInclude;
  goal: ProjectRefInclude;
}
/** getTodayTasksData / getWeekTasksData / getDoneTodayData — list rows + lens. */
export interface TaskLensListInclude extends TaskListInclude {
  lens: LensPillInclude;
}
/** fetchRankedActiveTasks (getTopTaskData / getTaskAlternativesData). */
export interface RankedPoolInclude {
  project: ProjectRefInclude;
  goal: ProjectRefInclude;
}
/** getTaskData — the task-detail lookup. */
export interface TaskDetailInclude {
  tags: true;
  updates: UpdatesChronoInclude;
  project: ProjectPermalinkInclude;
  goal: ProjectPermalinkInclude;
  attachments: AttachmentsInclude;
}
/** hydrateTopTaskData — the focus winner's Project→Goal + history payload. */
export interface TaskHydrateInclude {
  project: ProjectWithGoalInclude;
  goal: GoalPermalinkInclude;
  sessions: SessionsInclude;
  updates: NoteUpdatesInclude;
  attachments: AttachmentsInclude;
}

// ----------------------------------------------------------------
// Row shapes the includes produce (the cores' exported row types live here
// so delegate overloads and core slices share one definition)
// ----------------------------------------------------------------

/** A list row: base task + tags + the light project/goal refs list pages render. */
export interface TaskListRow extends Task {
  tags: Tag[];
  project: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
}

/** A list row that also carries its lens (grouped/global views). */
export interface TaskLensListRow extends TaskListRow {
  lens: { id: string; name: string; color: string | null } | null;
}

/** A ranked-pool candidate: base task + the project/goal refs rankTopTask ties
 *  break on and the Next/Focus surfaces display. */
export interface RankedPoolRow extends Task {
  project: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
}

/** A detail row: base task + permalink-carrying project/goal refs. */
export interface TaskDetailRow extends Task {
  project: { id: string; permalink: string; name: string } | null;
  goal: { id: string; permalink: string; name: string } | null;
  attachments: Array<{ id: string; filename: string; mimeType: string }>;
}

/** getTaskData's full payload: detail row + tags + the chronological updates. */
export type TaskDetailFullRow = TaskDetailRow & {
  tags: Tag[];
  updates: Array<{ id: string; body: string; kind: string; createdAt: Date }>;
};

/** A winner row hydrated with its Project→Goal chain, sessions, NOTEs —
 *  the include payload hydrateTopTaskData attaches. */
export interface HydratedTask extends Task {
  project: {
    id: string;
    permalink: string;
    name: string;
    goal: { id: string; name: string; description: string } | null;
  } | null;
  goal: {
    id: string;
    permalink: string;
    name: string;
    description: string;
  } | null;
  sessions: { startedAt: Date; endedAt: Date | null }[];
  updates: { body: string; createdAt: Date }[];
  attachments: { id: string; filename: string; mimeType: string }[];
}

// ----------------------------------------------------------------
// Delegate arg aliases (what the cores' `XEntities` slices reference)
// ----------------------------------------------------------------

export type TaskFindUniqueArgs = {
  where: { id: string };
  /** Guard-read selects (toggle/snooze/status/start/pause read ownership +
   *  done-state fields). The implementation returns the FULL row — a superset
   *  by-PK fetch whose result stays internal to the cores, so the original
   *  slices' widened `Promise<Task | null>` stays truthful. */
  select?: {
    isDone?: true;
    userId?: true;
    isOnboardingSample?: true;
  };
};

export type TaskFindFirstArgs =
  | { where: TaskWhereInput; include: TaskDetailInclude }
  | { where: TaskWhereInput; include: TaskHydrateInclude };

export type TaskFindManyArgs =
  | { where: TaskWhereInput; orderBy?: TaskOrderByInput; include: TaskListInclude }
  | {
      where: TaskWhereInput;
      orderBy?: TaskOrderByInput;
      include: TaskLensListInclude;
    }
  | { where: TaskWhereInput; include: RankedPoolInclude };

export type TaskUpdateArgs =
  | { where: { id: string }; data: TaskUpdateInput }
  | {
      where: { id: string };
      data: TaskUpdateInput;
      select: { id: true; status: true; scheduledDate: true; snoozedUntil: true };
    }
  | { where: { id: string }; data: TaskUpdateInput; select: { id: true; startedAt: true } };

export interface TaskUpdateManyArgs {
  where: TaskWhereInput;
  data: TaskUpdateInput;
}

export interface TaskCountArgs {
  where: TaskWhereInput;
}

export interface TaskSessionFindFirstArgs {
  where: TaskSessionWhereInput;
  orderBy?: TaskSessionOrderByInput;
  select?: {
    id?: true;
    taskId?: true;
    userId?: true;
    startedAt?: true;
    endedAt?: true;
    completed?: true;
    plannedMinutes?: true;
  };
}

export interface TaskSessionCreateArgs {
  data: TaskSessionCreateInput;
}

export interface TaskSessionUpdateArgs {
  where: { id: string };
  data: TaskSessionUpdateInput;
}

export interface TaskSessionUpdateManyArgs {
  where: TaskSessionWhereInput;
  data: TaskSessionUpdateInput;
}

export interface LensSelect {
  id?: true;
  userId?: true;
  name?: true;
  color?: true;
  purpose?: true;
  isDefault?: true;
  isIncluded?: true;
  createdAt?: true;
}

export interface LensFindFirstArgs {
  where: LensWhereInput;
  select?: LensSelect;
}

export interface LensFindManyArgs {
  where?: LensWhereInput;
  select?: LensSelect;
  orderBy?: LensOrderByInput;
}

// ----------------------------------------------------------------
// Delegates — one overload per inventoried query shape; the arg-type aliases
// above and these overloads must stay in lockstep (each overload pairs one
// where/include shape with the row type it returns).
// ----------------------------------------------------------------

export interface TaskDelegate {
  findUnique(args: TaskFindUniqueArgs): Promise<Task | null>;
  findFirst(args: {
    where: TaskWhereInput;
    include: TaskDetailInclude;
  }): Promise<TaskDetailFullRow | null>;
  findFirst(args: {
    where: TaskWhereInput;
    include: TaskHydrateInclude;
  }): Promise<HydratedTask | null>;
  findMany(args: {
    where: TaskWhereInput;
    orderBy?: TaskOrderByInput;
    include: TaskListInclude;
  }): Promise<TaskListRow[]>;
  findMany(args: {
    where: TaskWhereInput;
    orderBy?: TaskOrderByInput;
    include: TaskLensListInclude;
  }): Promise<TaskLensListRow[]>;
  findMany(args: {
    where: TaskWhereInput;
    include: RankedPoolInclude;
  }): Promise<RankedPoolRow[]>;
  update(args: { where: { id: string }; data: TaskUpdateInput }): Promise<Task>;
  update(args: {
    where: { id: string };
    data: TaskUpdateInput;
    select: { id: true; status: true; scheduledDate: true; snoozedUntil: true };
  }): Promise<{
    id: string;
    status: TaskStatus;
    scheduledDate: Date | null;
    snoozedUntil: Date | null;
  }>;
  update(args: {
    where: { id: string };
    data: TaskUpdateInput;
    select: { id: true; startedAt: true };
  }): Promise<{ id: string; startedAt: Date | null }>;
  updateMany(args: TaskUpdateManyArgs): Promise<BatchPayload>;
  count(args: TaskCountArgs): Promise<number>;
}

export interface TaskSessionDelegate {
  findFirst(args: TaskSessionFindFirstArgs): Promise<TaskSession | null>;
  create(args: TaskSessionCreateArgs): Promise<TaskSession>;
  update(args: TaskSessionUpdateArgs): Promise<TaskSession>;
  updateMany(args: TaskSessionUpdateManyArgs): Promise<BatchPayload>;
}

export interface LensDelegate {
  findFirst(args: LensFindFirstArgs): Promise<Lens | null>;
  findMany(args: LensFindManyArgs): Promise<Lens[]>;
}

/** The entities object a core receives: the Prisma-delegate slice, built over
 *  Drizzle by `createEntities` (`./client.ts`) or faked by F4c mocks. */
export interface Entities {
  Task: TaskDelegate;
  TaskSession: TaskSessionDelegate;
  Lens: LensDelegate;
}
