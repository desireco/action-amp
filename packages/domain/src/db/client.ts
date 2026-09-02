// F4b — the Drizzle-backed SEAM: a `createDb` factory plus `createEntities`,
// which exposes the exact Prisma-delegate surface the ported operationsCores
// speak, implemented over the introspected schema (`./schema`).
//
// Layering (v3 architecture): apps/api calls ONLY packages/domain for logic —
// it builds `const entities = createEntities(createDb(DATABASE_URL))` once and
// passes it as every core's first argument (the seam `entities` object the
// cores' docs describe). Tests (F4c) fake the same surface with plain objects.
//
// Prisma behaviors this seam emulates (docs/plans/introspection-report.md §4):
// - uuid PKs: app-minted `crypto.randomUUID()` on insert (DB has no default).
// - `@updatedAt`: re-stamped on every update (and set on insert) — for this
//   port that is `Task.updatedAt` (TaskSession/Tag/Lens carry none).
// - update semantics: `undefined` leaves a field untouched, `null` writes
//   NULL; update returns the full row (or the `select` projection); a missing
//   row throws (Prisma's P2025 analogue).
// - includes: resolved through Drizzle's relational query API (`with:`), then
//   projected to the exact shapes the cores read (tags, project/goal refs,
//   lens pill, updates, sessions, attachments).
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, not, or, sql } from "drizzle-orm";
import type { SQL, AnyColumn } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schemaTables from "./schema/index.js";
import * as schemaRelations from "./schema/relations.js";
import {
  lens,
  task,
  taskSession,
  taskUpdate,
} from "./schema/index.js";
import type {
  BatchPayload,
  Entities,
  GoalPermalinkInclude,
  HydratedTask,
  LensDelegate,
  LensFindFirstArgs,
  LensFindManyArgs,
  LensOrderBy,
  LensWhereInput,
  NoteUpdatesInclude,
  ProjectPermalinkInclude,
  ProjectRefInclude,
  ProjectWithGoalInclude,
  RankedPoolInclude,
  RankedPoolRow,
  SessionsInclude,
  StringFilter,
  StringNullableFilter,
  BoolFilter,
  EnumNullableFilter,
  DateTimeNullableFilter,
  TaskDelegate,
  TaskDetailFullRow,
  TaskDetailInclude,
  TaskFindFirstArgs,
  TaskFindManyArgs,
  TaskFindUniqueArgs,
  TaskHydrateInclude,
  TaskLensListInclude,
  TaskLensListRow,
  TaskListInclude,
  TaskListRow,
  TaskOrderBy,
  TaskSessionCreateArgs,
  TaskSessionDelegate,
  TaskSessionFindFirstArgs,
  TaskSessionOrderBy,
  TaskSessionUpdateArgs,
  TaskSessionUpdateManyArgs,
  TaskSessionWhereInput,
  TaskUpdateArgs,
  TaskUpdateInput,
  TaskUpdateManyArgs,
  TaskWhereInput,
  UpdatesChronoInclude,
} from "./seam.js";
import type {
  Goal,
  Lens,
  Project,
  Tag,
  Task,
  TaskAttachment,
  TaskSession,
  TaskUpdate,
} from "./types.js";

/** The schema config drizzle() expects: tables AND Relations entries in one
 *  map (drizzle-orm 0.45 builds the relational-query config from exactly
 *  this — there is no separate `relations` config key). */
export const domainSchema = { ...schemaTables, ...schemaRelations };

export type DomainDb = PostgresJsDatabase<typeof domainSchema> & {
  $client: postgres.Sql;
};

/** Open the domain database. The postgres.js client connects lazily — nothing
 *  touches the wire until the first query. Close with `db.$client.end()`. */
export function createDb(databaseUrl: string): DomainDb {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema: domainSchema });
}

/** Build the seam entities object over an open database (see file header). */
export function createEntities(db: DomainDb): Entities {
  return {
    Task: createTaskDelegate(db),
    TaskSession: createTaskSessionDelegate(db),
    Lens: createLensDelegate(db),
  };
}

// ================================================================
// Prisma where → SQL translation
// ================================================================

type Column = AnyColumn;

function combine(parts: SQL[]): SQL {
  if (parts.length === 1) return parts[0];
  return and(...parts) ?? sql`true`;
}

function stringCond(column: Column, value: string | StringFilter): SQL {
  if (typeof value === "string") return eq(column, value);
  const parts: SQL[] = [];
  if (value.equals !== undefined) parts.push(eq(column, value.equals));
  if (value.in !== undefined) parts.push(inArray(column, value.in));
  if (value.not !== undefined) {
    parts.push(
      typeof value.not === "string"
        ? ne(column, value.not)
        : not(stringCond(column, value.not)),
    );
  }
  return parts.length === 0 ? sql`true` : combine(parts);
}

function nullableStringCond(
  column: Column,
  value: string | StringNullableFilter,
): SQL {
  if (typeof value === "string") return eq(column, value);
  const parts: SQL[] = [];
  if (value.equals !== undefined) {
    parts.push(value.equals === null ? isNull(column) : eq(column, value.equals));
  }
  if (value.in !== undefined) parts.push(inArray(column, value.in));
  if (value.not !== undefined) {
    parts.push(
      value.not === null
        ? isNotNull(column)
        : typeof value.not === "string"
          ? ne(column, value.not)
          : not(nullableStringCond(column, value.not)),
    );
  }
  return parts.length === 0 ? sql`true` : combine(parts);
}

function boolCond(column: Column, value: boolean | BoolFilter): SQL {
  if (typeof value === "boolean") return eq(column, value);
  const parts: SQL[] = [];
  if (value.equals !== undefined) parts.push(eq(column, value.equals));
  if (value.not !== undefined) parts.push(ne(column, value.not));
  return parts.length === 0 ? sql`true` : combine(parts);
}

function enumCond(
  column: Column,
  value: string | EnumNullableFilter<string>,
): SQL {
  if (typeof value === "string") return eq(column, value);
  const parts: SQL[] = [];
  if (value.equals !== undefined) {
    parts.push(value.equals === null ? isNull(column) : eq(column, value.equals));
  }
  if (value.in !== undefined) parts.push(inArray(column, value.in));
  if (value.not !== undefined) {
    parts.push(
      value.not === null
        ? isNotNull(column)
        : typeof value.not === "string"
          ? ne(column, value.not)
          : not(enumCond(column, value.not)),
    );
  }
  return parts.length === 0 ? sql`true` : combine(parts);
}

function dateCond(
  column: Column,
  value: Date | null | DateTimeNullableFilter,
): SQL {
  if (value === null) return isNull(column);
  if (value instanceof Date) return eq(column, value);
  const parts: SQL[] = [];
  if (value.equals !== undefined) {
    parts.push(value.equals === null ? isNull(column) : eq(column, value.equals));
  }
  if (value.in !== undefined) parts.push(inArray(column, value.in));
  if (value.lt != null) parts.push(lt(column, value.lt));
  if (value.lte != null) parts.push(lte(column, value.lte));
  if (value.gt != null) parts.push(gt(column, value.gt));
  if (value.gte != null) parts.push(gte(column, value.gte));
  if (value.not !== undefined) {
    parts.push(
      value.not === null
        ? isNotNull(column)
        : value.not instanceof Date
          ? ne(column, value.not)
          : not(dateCond(column, value.not)),
    );
  }
  return parts.length === 0 ? sql`true` : combine(parts);
}

const TASK_ORDER_COLUMNS: Record<keyof TaskOrderBy, Column> = {
  id: task.id,
  permalink: task.permalink,
  userId: task.userId,
  lensId: task.lensId,
  projectId: task.projectId,
  goalId: task.goalId,
  description: task.description,
  content: task.content,
  outcome: task.outcome,
  isDone: task.isDone,
  isOnboardingSample: task.isOnboardingSample,
  priority: task.priority,
  size: task.size,
  status: task.status,
  order: task.order,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  completedAt: task.completedAt,
  startedAt: task.startedAt,
  scheduledDate: task.scheduledDate,
  snoozedUntil: task.snoozedUntil,
};

const TASK_SESSION_ORDER_COLUMNS: Record<keyof TaskSessionOrderBy, Column> = {
  id: taskSession.id,
  taskId: taskSession.taskId,
  userId: taskSession.userId,
  completed: taskSession.completed,
  plannedMinutes: taskSession.plannedMinutes,
  startedAt: taskSession.startedAt,
  endedAt: taskSession.endedAt,
};

const LENS_ORDER_COLUMNS: Record<keyof LensOrderBy, Column> = {
  id: lens.id,
  userId: lens.userId,
  name: lens.name,
  color: lens.color,
  purpose: lens.purpose,
  isDefault: lens.isDefault,
  isIncluded: lens.isIncluded,
  createdAt: lens.createdAt,
};

type OrderMap = Record<string, Column>;

function orderByCond(order: object, columns: OrderMap): SQL[] {
  const specs = Array.isArray(order) ? order : [order];
  const parts: SQL[] = [];
  for (const spec of specs as Record<string, string | undefined>[]) {
    for (const key of Object.keys(spec)) {
      const dir = spec[key];
      const column = columns[key];
      if (dir === undefined || column === undefined) continue;
      parts.push(dir === "desc" ? desc(column) : asc(column));
    }
  }
  return parts;
}

export function taskWhereToSql(where: TaskWhereInput): SQL | undefined {
  const parts: SQL[] = [];
  if (where.id !== undefined) parts.push(eq(task.id, where.id));
  if (where.permalink !== undefined) parts.push(eq(task.permalink, where.permalink));
  if (where.userId !== undefined) parts.push(eq(task.userId, where.userId));
  if (where.lensId !== undefined) parts.push(nullableStringCond(task.lensId, where.lensId));
  if (where.projectId !== undefined) parts.push(nullableStringCond(task.projectId, where.projectId));
  if (where.goalId !== undefined) parts.push(nullableStringCond(task.goalId, where.goalId));
  if (where.description !== undefined) parts.push(stringCond(task.description, where.description));
  if (where.content !== undefined) parts.push(nullableStringCond(task.content, where.content));
  if (where.outcome !== undefined) parts.push(nullableStringCond(task.outcome, where.outcome));
  if (where.isDone !== undefined) parts.push(boolCond(task.isDone, where.isDone));
  if (where.isOnboardingSample !== undefined) parts.push(boolCond(task.isOnboardingSample, where.isOnboardingSample));
  if (where.priority !== undefined) parts.push(enumCond(task.priority, where.priority));
  if (where.size !== undefined) parts.push(enumCond(task.size, where.size));
  if (where.status !== undefined) parts.push(enumCond(task.status, where.status));
  if (where.createdAt !== undefined) parts.push(dateCond(task.createdAt, where.createdAt));
  if (where.updatedAt !== undefined) parts.push(dateCond(task.updatedAt, where.updatedAt));
  if (where.completedAt !== undefined) parts.push(dateCond(task.completedAt, where.completedAt));
  if (where.startedAt !== undefined) parts.push(dateCond(task.startedAt, where.startedAt));
  if (where.scheduledDate !== undefined) parts.push(dateCond(task.scheduledDate, where.scheduledDate));
  if (where.snoozedUntil !== undefined) parts.push(dateCond(task.snoozedUntil, where.snoozedUntil));
  if (where.AND !== undefined) {
    const inner = where.AND.map(taskWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(combine(inner));
  }
  if (where.OR !== undefined) {
    const inner = where.OR.map(taskWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) {
      // or() returns undefined only for an empty/all-undefined input, which
      // `inner.length > 0` rules out when every member compiled.
      const anyOf = or(...inner);
      if (anyOf) parts.push(anyOf);
    }
  }
  if (where.NOT !== undefined) {
    const members = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    const inner = members.map(taskWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(not(combine(inner)));
  }
  return parts.length === 0 ? undefined : combine(parts);
}

function taskSessionWhereToSql(where: TaskSessionWhereInput): SQL | undefined {
  const parts: SQL[] = [];
  if (where.id !== undefined) parts.push(eq(taskSession.id, where.id));
  if (where.taskId !== undefined) parts.push(eq(taskSession.taskId, where.taskId));
  if (where.userId !== undefined) parts.push(eq(taskSession.userId, where.userId));
  if (where.completed !== undefined) parts.push(boolCond(taskSession.completed, where.completed));
  if (where.startedAt !== undefined) parts.push(dateCond(taskSession.startedAt, where.startedAt));
  if (where.endedAt !== undefined) parts.push(dateCond(taskSession.endedAt, where.endedAt));
  if (where.AND !== undefined) {
    const inner = where.AND.map(taskSessionWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(combine(inner));
  }
  if (where.OR !== undefined) {
    const inner = where.OR.map(taskSessionWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) {
      const anyOf = or(...inner);
      if (anyOf) parts.push(anyOf);
    }
  }
  if (where.NOT !== undefined) {
    const members = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    const inner = members.map(taskSessionWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(not(combine(inner)));
  }
  return parts.length === 0 ? undefined : combine(parts);
}

function lensWhereToSql(where: LensWhereInput): SQL | undefined {
  const parts: SQL[] = [];
  if (where.id !== undefined) parts.push(eq(lens.id, where.id));
  if (where.userId !== undefined) parts.push(eq(lens.userId, where.userId));
  if (where.name !== undefined) parts.push(stringCond(lens.name, where.name));
  if (where.color !== undefined) parts.push(nullableStringCond(lens.color, where.color));
  if (where.purpose !== undefined) parts.push(nullableStringCond(lens.purpose, where.purpose));
  if (where.isDefault !== undefined) parts.push(boolCond(lens.isDefault, where.isDefault));
  if (where.isIncluded !== undefined) parts.push(boolCond(lens.isIncluded, where.isIncluded));
  if (where.createdAt !== undefined) parts.push(dateCond(lens.createdAt, where.createdAt));
  if (where.AND !== undefined) {
    const inner = where.AND.map(lensWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(combine(inner));
  }
  if (where.OR !== undefined) {
    const inner = where.OR.map(lensWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) {
      const anyOf = or(...inner);
      if (anyOf) parts.push(anyOf);
    }
  }
  if (where.NOT !== undefined) {
    const members = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    const inner = members.map(lensWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(not(combine(inner)));
  }
  return parts.length === 0 ? undefined : combine(parts);
}

// ================================================================
// Include handling — relational fetch config + row projection
// ================================================================

/** Every include family in one union (the five read shapes, seam.ts). */
type AnyTaskInclude =
  | TaskListInclude
  | TaskLensListInclude
  | RankedPoolInclude
  | TaskDetailInclude
  | TaskHydrateInclude;

/** The `with:` half of a relational task query, built from a seam include. */
interface TaskRelationalWith {
  tagToTasks?: { with: { tag: true } };
  project?: true | { with: { goal: true } };
  goal?: true;
  len?: true; // the introspected relation name for the Lens FK
  taskUpdates?: { where?: SQL; orderBy?: SQL };
  taskSessions?: { orderBy?: SQL };
  taskAttachments?: true;
}

function withConfigFor(include: AnyTaskInclude): TaskRelationalWith {
  const withConfig: TaskRelationalWith = {};
  if ("tags" in include) withConfig.tagToTasks = { with: { tag: true } };
  if ("project" in include) {
    withConfig.project =
      "goal" in include.project.select ? { with: { goal: true } } : true;
  }
  if ("goal" in include) withConfig.goal = true;
  if ("lens" in include) withConfig.len = true;
  if ("updates" in include) {
    const updates: UpdatesChronoInclude | NoteUpdatesInclude = include.updates;
    withConfig.taskUpdates = {
      orderBy:
        updates.orderBy.createdAt === "desc"
          ? desc(taskUpdate.createdAt)
          : asc(taskUpdate.createdAt),
      ...("where" in updates ? { where: eq(taskUpdate.kind, updates.where.kind) } : {}),
    };
  }
  if ("sessions" in include) {
    const sessions: SessionsInclude = include.sessions;
    withConfig.taskSessions = {
      orderBy:
        sessions.orderBy.startedAt === "desc"
          ? desc(taskSession.startedAt)
          : asc(taskSession.startedAt),
    };
  }
  if ("attachments" in include) withConfig.taskAttachments = true;
  return withConfig;
}

/** The raw relational row: base task + whichever relations the include asked
 *  for. SAFETY: guaranteed at runtime by `withConfigFor` for the same include;
 *  Drizzle's inferred result type for a dynamically-built `with` is not
 *  precise enough to use directly. */
type RawTaskWith = Task & {
  tagToTasks?: Array<{ tag: Tag }> | null;
  project?: (Project & { goal?: Goal | null }) | null;
  goal?: Goal | null;
  len?: Lens | null;
  taskUpdates?: TaskUpdate[] | null;
  taskSessions?: TaskSession[] | null;
  taskAttachments?: TaskAttachment[] | null;
};

function scalarTaskRow(raw: RawTaskWith): Task {
  const {
    tagToTasks: _tagToTasks,
    project: _project,
    goal: _goal,
    len: _len,
    taskUpdates: _taskUpdates,
    taskSessions: _taskSessions,
    taskAttachments: _taskAttachments,
    ...scalars
  } = raw;
  return scalars;
}

type ProjectRow = Project & { goal?: Goal | null };

// Overloads are ordered most-specific-first: both the permalink and with-goal
// select shapes are structurally assignable to the loosest ({id, name}), so
// the loosest overload must come LAST or it would swallow the others.
function projectProjection(
  project: ProjectRow | null | undefined,
  select: ProjectWithGoalInclude["select"],
): HydratedTask["project"];
function projectProjection(
  project: ProjectRow | null | undefined,
  select: ProjectPermalinkInclude["select"],
): TaskDetailFullRow["project"];
function projectProjection(
  project: ProjectRow | null | undefined,
  select: ProjectRefInclude["select"],
): TaskListRow["project"];
function projectProjection(
  project: ProjectRow | null | undefined,
  select:
    | ProjectRefInclude["select"]
    | ProjectPermalinkInclude["select"]
    | ProjectWithGoalInclude["select"],
):
  | TaskListRow["project"]
  | TaskDetailFullRow["project"]
  | HydratedTask["project"] {
  if (!project) return null;
  if ("goal" in select) {
    // SAFETY: HydratedTask (like the original webapp interface) types goal
    // description as `string`; a DB null passes through, as it always has.
    return {
      id: project.id,
      permalink: project.permalink,
      name: project.name,
      goal: project.goal
        ? {
            id: project.goal.id,
            name: project.goal.name,
            description: project.goal.description as string,
          }
        : null,
    };
  }
  if ("permalink" in select) {
    return { id: project.id, permalink: project.permalink, name: project.name };
  }
  return { id: project.id, name: project.name };
}

function goalProjection(
  goalRow: Goal | null | undefined,
  select: GoalPermalinkInclude["select"],
): HydratedTask["goal"];
function goalProjection(
  goalRow: Goal | null | undefined,
  select: ProjectPermalinkInclude["select"],
): TaskDetailFullRow["goal"];
function goalProjection(
  goalRow: Goal | null | undefined,
  select: ProjectRefInclude["select"],
): TaskListRow["goal"];
function goalProjection(
  goalRow: Goal | null | undefined,
  select: ProjectRefInclude["select"] | ProjectPermalinkInclude["select"] | GoalPermalinkInclude["select"],
): TaskListRow["goal"] | TaskDetailFullRow["goal"] | HydratedTask["goal"] {
  if (!goalRow) return null;
  if ("description" in select) {
    // SAFETY: matches the original HydratedTask contract (`description:
    // string`); a DB null passes through, as in the Prisma era.
    return {
      id: goalRow.id,
      permalink: goalRow.permalink,
      name: goalRow.name,
      description: goalRow.description as string,
    };
  }
  if ("permalink" in select) {
    return { id: goalRow.id, permalink: goalRow.permalink, name: goalRow.name };
  }
  return { id: goalRow.id, name: goalRow.name };
}

function tagsOf(raw: RawTaskWith): Tag[] {
  return (raw.tagToTasks ?? []).map((join) => join.tag);
}

function attachmentsOf(raw: RawTaskWith): TaskDetailFullRow["attachments"] {
  return (raw.taskAttachments ?? []).map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
  }));
}

function assembleListRow(raw: RawTaskWith, include: TaskListInclude): TaskListRow {
  return {
    ...scalarTaskRow(raw),
    tags: tagsOf(raw),
    project: projectProjection(raw.project, include.project.select),
    goal: goalProjection(raw.goal, include.goal.select),
  };
}

function assembleLensListRow(
  raw: RawTaskWith,
  include: TaskLensListInclude,
): TaskLensListRow {
  return {
    ...scalarTaskRow(raw),
    tags: tagsOf(raw),
    project: projectProjection(raw.project, include.project.select),
    goal: goalProjection(raw.goal, include.goal.select),
    lens: raw.len
      ? { id: raw.len.id, name: raw.len.name, color: raw.len.color }
      : null,
  };
}

function assembleRankedRow(raw: RawTaskWith, include: RankedPoolInclude): RankedPoolRow {
  return {
    ...scalarTaskRow(raw),
    project: projectProjection(raw.project, include.project.select),
    goal: goalProjection(raw.goal, include.goal.select),
  };
}

function assembleDetailRow(raw: RawTaskWith, include: TaskDetailInclude): TaskDetailFullRow {
  return {
    ...scalarTaskRow(raw),
    tags: tagsOf(raw),
    updates: (raw.taskUpdates ?? []).map((update) => ({
      id: update.id,
      body: update.body,
      kind: update.kind,
      createdAt: update.createdAt,
    })),
    project: projectProjection(raw.project, include.project.select),
    goal: goalProjection(raw.goal, include.goal.select),
    attachments: attachmentsOf(raw),
  };
}

function assembleHydratedRow(raw: RawTaskWith, include: TaskHydrateInclude): HydratedTask {
  return {
    ...scalarTaskRow(raw),
    project: projectProjection(raw.project, include.project.select),
    goal: goalProjection(raw.goal, include.goal.select),
    sessions: (raw.taskSessions ?? []).map((sessionRow) => ({
      startedAt: sessionRow.startedAt,
      endedAt: sessionRow.endedAt,
    })),
    updates: (raw.taskUpdates ?? []).map((update) => ({
      body: update.body,
      createdAt: update.createdAt,
    })),
    attachments: attachmentsOf(raw),
  };
}

// ================================================================
// Client-side defaults (introspection report §4.1/§4.2)
// ================================================================

/** Mint a primary key — the DB has no default on any id column; Prisma's
 *  `@default(uuid())` was client-evaluated. */
export function mintId(): string {
  return crypto.randomUUID();
}

/** The SET payload for a Task write: the caller's patch plus the re-stamped
 *  `@updatedAt` (Task.updatedAt is ordering-critical — the Logbook sorts
 *  WONT_DO declines on it). */
function taskUpdateSet(data: TaskUpdateInput): TaskUpdateInput & { updatedAt: Date } {
  return { ...data, updatedAt: new Date() };
}

function assertFound(row: unknown | undefined, model: string): void {
  if (row === undefined || row === null) {
    // Prisma's P2025 analogue. Every core checks existence with a read first,
    // so this only fires on a race between read and write.
    throw new Error(`${model} not found.`);
  }
}

// ================================================================
// Delegates
// ================================================================

function createTaskDelegate(db: DomainDb): TaskDelegate {
  const findUniqueImpl = async (args: TaskFindUniqueArgs): Promise<Task | null> => {
    // By-PK fetch; the optional select is a guard-read (cores only check
    // ownership/done-state on it), so the full row is returned — a superset
    // whose result never reaches API payloads.
    const rows = await db.select().from(task).where(eq(task.id, args.where.id)).limit(1);
    return rows[0] ?? null;
  };

  const findFirstImpl = async (
    args: TaskFindFirstArgs,
  ): Promise<TaskDetailFullRow | HydratedTask | null> => {
    const raw = (await db.query.task.findFirst({
      where: taskWhereToSql(args.where),
      with: withConfigFor(args.include),
    })) as unknown as RawTaskWith | undefined;
    if (!raw) return null;
    // Branch on family keys (hydrate is the only include with `sessions`).
    if ("sessions" in args.include) return assembleHydratedRow(raw, args.include);
    return assembleDetailRow(raw, args.include);
  };

  const findManyImpl = async (
    args: TaskFindManyArgs,
  ): Promise<TaskListRow[] | TaskLensListRow[] | RankedPoolRow[]> => {
    const raw = (await db.query.task.findMany({
      where: taskWhereToSql(args.where),
      orderBy: orderByCond("orderBy" in args ? args.orderBy ?? {} : {}, TASK_ORDER_COLUMNS),
      with: withConfigFor(args.include),
    })) as unknown as RawTaskWith[];
    // Branch on family keys: lens-list has `lens`, list has `tags`, ranked
    // (the ranked pool fetch) has neither.
    return raw.map((row) => {
      if ("lens" in args.include) return assembleLensListRow(row, args.include);
      if ("tags" in args.include) return assembleListRow(row, args.include);
      return assembleRankedRow(row, args.include);
    });
  };

  const updateImpl = async (
    args: TaskUpdateArgs,
  ): Promise<Task | { id: string; status: Task["status"]; scheduledDate: Date | null; snoozedUntil: Date | null } | { id: string; startedAt: Date | null }> => {
    const rows = await db
      .update(task)
      .set(taskUpdateSet(args.data))
      .where(eq(task.id, args.where.id))
      .returning();
    const row = rows[0];
    assertFound(row, "Task");
    if (row !== undefined && "select" in args && args.select) {
      if ("scheduledDate" in args.select) {
        const { id, status, scheduledDate, snoozedUntil } = row;
        return { id, status, scheduledDate, snoozedUntil };
      }
      return { id: row.id, startedAt: row.startedAt };
    }
    return row;
  };

  const updateManyImpl = async (args: TaskUpdateManyArgs): Promise<BatchPayload> => {
    const rows = await db
      .update(task)
      .set(taskUpdateSet(args.data))
      .where(taskWhereToSql(args.where))
      .returning({ id: task.id });
    return { count: rows.length };
  };

  const countImpl = async (args: { where: TaskWhereInput }): Promise<number> => {
    const rows = await db
      .select({ value: count() })
      .from(task)
      .where(taskWhereToSql(args.where));
    return rows[0]?.value ?? 0;
  };

  // SAFETY: the impls above handle the full union of inventoried arg shapes;
  // the overload surface (seam.ts) pairs each shape with its exact row type.
  return {
    findUnique: findUniqueImpl,
    findFirst: findFirstImpl,
    findMany: findManyImpl,
    update: updateImpl,
    updateMany: updateManyImpl,
    count: countImpl,
  } as unknown as TaskDelegate;
}

function createTaskSessionDelegate(db: DomainDb): TaskSessionDelegate {
  const findFirstImpl = async (
    args: TaskSessionFindFirstArgs,
  ): Promise<TaskSession | null> => {
    const rows = await db
      .select()
      .from(taskSession)
      .where(taskSessionWhereToSql(args.where))
      .orderBy(...orderByCond(args.orderBy ?? {}, TASK_SESSION_ORDER_COLUMNS))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (args.select) {
      // Prune to the select, as Prisma would; the slice keeps Prisma-era
      // widened typing (the cores only read fields their select carried).
      const pruned: Record<string, unknown> = {};
      for (const key of Object.keys(args.select) as (keyof typeof args.select)[]) {
        if (args.select[key] === true) pruned[key] = row[key];
      }
      return pruned as TaskSession;
    }
    return row;
  };

  const createImpl = async (args: TaskSessionCreateArgs): Promise<TaskSession> => {
    const data = args.data;
    const rows = await db
      .insert(taskSession)
      .values({
        // Client-side defaults (report §4): uuid PK; Prisma's client-side
        // `@default(now())` equivalent for startedAt.
        id: data.id ?? mintId(),
        taskId: data.taskId,
        userId: data.userId,
        startedAt: data.startedAt ?? new Date(),
        endedAt: data.endedAt,
        completed: data.completed ?? false,
        plannedMinutes: data.plannedMinutes,
      })
      .returning();
    const row = rows[0];
    assertFound(row, "TaskSession");
    return row;
  };

  const updateImpl = async (args: TaskSessionUpdateArgs): Promise<TaskSession> => {
    const rows = await db
      .update(taskSession)
      .set(args.data)
      .where(eq(taskSession.id, args.where.id))
      .returning();
    const row = rows[0];
    assertFound(row, "TaskSession");
    return row;
  };

  const updateManyImpl = async (
    args: TaskSessionUpdateManyArgs,
  ): Promise<BatchPayload> => {
    const rows = await db
      .update(taskSession)
      .set(args.data)
      .where(taskSessionWhereToSql(args.where))
      .returning({ id: taskSession.id });
    return { count: rows.length };
  };

  return {
    findFirst: findFirstImpl,
    create: createImpl,
    update: updateImpl,
    updateMany: updateManyImpl,
  } satisfies TaskSessionDelegate;
}

function createLensDelegate(db: DomainDb): LensDelegate {
  return {
    findFirst: async (args: LensFindFirstArgs): Promise<Lens | null> => {
      const rows = await db
        .select()
        .from(lens)
        .where(lensWhereToSql(args.where))
        .limit(1);
      return rows[0] ?? null;
    },
    findMany: async (args: LensFindManyArgs): Promise<Lens[]> => {
      // Full rows: every core read only selects Lens fields the row already
      // carries, so the superset return satisfies the slices (no pruning).
      return await db
        .select()
        .from(lens)
        .where(lensWhereToSql(args.where ?? {}))
        .orderBy(...orderByCond(args.orderBy ?? {}, LENS_ORDER_COLUMNS));
    },
  };
}
