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
  goal,
  inboxAttachment,
  inboxItem,
  lens,
  listItem,
  listItemAttachment,
  project,
  projectAttachment,
  resource,
  resourceAttachment,
  tag,
  task,
  taskAttachment,
  taskSession,
  taskUpdate,
  tagToTask,
} from "./schema/index.js";
import type {
  BatchPayload,
  Entities,
  GoalDelegate,
  GoalDetailInclude,
  GoalDetailRow,
  GoalFindFirstArgs,
  GoalFindManyArgs,
  GoalFindUniqueArgs,
  GoalListInclude,
  GoalListRow,
  GoalOrderBy,
  GoalCreateArgs,
  GoalUpdateArgs,
  GoalWhereInput,
  GoalPermalinkInclude,
  HydratedTask,
  InboxAttachmentBlobRow,
  InboxAttachmentDelegate,
  InboxItemCreateInput,
  InboxItemDelegate,
  InboxItemFindManyArgs,
  InboxItemFindUniqueArgs,
  InboxItemListRow,
  InboxItemUpdateArgs,
  InboxItemWhereInput,
  InboxItemWithAttachments,
  LensDelegate,
  LensFindFirstArgs,
  LensFindManyArgs,
  LensOrderBy,
  LensWhereInput,
  ListItemCountArgs,
  ListItemCreateArgs,
  ListItemDelegate,
  ListItemFindFirstArgs,
  NoteUpdatesInclude,
  ProjectCreateArgs,
  ProjectDelegate,
  ProjectDeleteArgs,
  ProjectDetailInclude,
  ProjectDetailRow,
  ProjectFindFirstArgs,
  ProjectFindManyArgs,
  ProjectFindUniqueArgs,
  ProjectListInclude,
  ProjectListRow,
  ProjectOrderBy,
  ProjectPermalinkInclude,
  ProjectRefInclude,
  ProjectTotalsRow,
  ProjectUpdateArgs,
  ProjectUpdateInput,
  ProjectWithGoalInclude,
  ProjectWhereInput,
  RankedPoolInclude,
  RankedPoolRow,
  ResourceCreateArgs,
  ResourceDelegate,
  ResourceWhereInput,
  SessionsInclude,
  SortOrder,
  StringFilter,
  StringNullableFilter,
  BoolFilter,
  EnumNullableFilter,
  DateTimeNullableFilter,
  TagDelegate,
  TagUpsertArgs,
  TaskCreateArgs,
  TaskDelegate,
  TaskDeleteManyArgs,
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
  InboxItem,
  Lens,
  Project,
  ProjectAttachment,
  Resource,
  ResourceAttachment,
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
    Project: createProjectDelegate(db),
    Goal: createGoalDelegate(db),
    Tag: createTagDelegate(db),
    InboxItem: createInboxItemDelegate(db),
    InboxAttachment: createInboxAttachmentDelegate(db),
    Resource: createResourceDelegate(db),
    ListItem: createListItemDelegate(db),
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

const PROJECT_ORDER_COLUMNS: Record<keyof ProjectOrderBy, Column> = {
  id: project.id,
  permalink: project.permalink,
  userId: project.userId,
  lensId: project.lensId,
  goalId: project.goalId,
  name: project.name,
  isDone: project.isDone,
  order: project.order,
  type: project.type,
  createdAt: project.createdAt,
  completedAt: project.completedAt,
  archivedAt: project.archivedAt,
  dueDate: project.dueDate,
};

const GOAL_ORDER_COLUMNS: Record<keyof GoalOrderBy, Column> = {
  id: goal.id,
  permalink: goal.permalink,
  userId: goal.userId,
  lensId: goal.lensId,
  name: goal.name,
  isDone: goal.isDone,
  createdAt: goal.createdAt,
  completedAt: goal.completedAt,
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
  if (where.id !== undefined) parts.push(stringCond(task.id, where.id));
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
// S5/S6 — Project/Goal where → SQL translation
// ================================================================

export function projectWhereToSql(where: ProjectWhereInput): SQL | undefined {
  const parts: SQL[] = [];
  if (where.id !== undefined) parts.push(stringCond(project.id, where.id));
  if (where.permalink !== undefined) parts.push(eq(project.permalink, where.permalink));
  if (where.userId !== undefined) parts.push(eq(project.userId, where.userId));
  if (where.lensId !== undefined) parts.push(eq(project.lensId, where.lensId));
  if (where.goalId !== undefined) parts.push(nullableStringCond(project.goalId, where.goalId));
  if (where.name !== undefined) parts.push(stringCond(project.name, where.name));
  if (where.isDone !== undefined) parts.push(boolCond(project.isDone, where.isDone));
  if (where.archivedAt !== undefined) parts.push(dateCond(project.archivedAt, where.archivedAt));
  if (where.type !== undefined) parts.push(enumCond(project.type, where.type));
  if (where.dueDate !== undefined) parts.push(dateCond(project.dueDate, where.dueDate));
  if (where.AND !== undefined) {
    const inner = where.AND.map(projectWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(combine(inner));
  }
  if (where.OR !== undefined) {
    const inner = where.OR.map(projectWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) {
      const anyOf = or(...inner);
      if (anyOf) parts.push(anyOf);
    }
  }
  if (where.NOT !== undefined) {
    const members = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    const inner = members.map(projectWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(not(combine(inner)));
  }
  return parts.length === 0 ? undefined : combine(parts);
}

export function goalWhereToSql(where: GoalWhereInput): SQL | undefined {
  const parts: SQL[] = [];
  if (where.id !== undefined) parts.push(eq(goal.id, where.id));
  if (where.permalink !== undefined) parts.push(eq(goal.permalink, where.permalink));
  if (where.userId !== undefined) parts.push(eq(goal.userId, where.userId));
  if (where.lensId !== undefined) parts.push(eq(goal.lensId, where.lensId));
  if (where.name !== undefined) parts.push(stringCond(goal.name, where.name));
  if (where.isDone !== undefined) parts.push(boolCond(goal.isDone, where.isDone));
  if (where.AND !== undefined) {
    const inner = where.AND.map(goalWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(combine(inner));
  }
  if (where.OR !== undefined) {
    const inner = where.OR.map(goalWhereToSql).filter((c): c is SQL => c !== undefined);
    if (inner.length > 0) {
      const anyOf = or(...inner);
      if (anyOf) parts.push(anyOf);
    }
  }
  if (where.NOT !== undefined) {
    const members = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    const inner = members.map(goalWhereToSql).filter((c): c is SQL => c !== undefined);
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
    // By-PK fetch (optionally tenancy-scoped); the optional select is a
    // guard-read (cores only check ownership/done-state on it), so the full
    // row is returned — a superset whose result never reaches API payloads.
    const rows = await db
      .select()
      .from(task)
      .where(taskFindUniqueWhereToSql(args.where))
      .limit(1);
    return rows[0] ?? null;
  };

  const findFirstImpl = async (
    args: TaskFindFirstArgs | { where: TaskWhereInput; select?: { id?: true } },
  ): Promise<TaskDetailFullRow | HydratedTask | Task | null> => {
    // Select-only guard read (S5 createTaskCore's permalink probe): a plain
    // by-filter fetch, full row returned (the select is advisory).
    if (!("include" in args) || !args.include) {
      const rows = await db.select().from(task).where(taskWhereToSql(args.where)).limit(1);
      return rows[0] ?? null;
    }
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
  ): Promise<TaskListRow[] | TaskLensListRow[] | RankedPoolRow[] | Task[]> => {
    // Select-only fetch (S5 deleteProject's task list): plain rows, full shape.
    if (!("include" in args) || !args.include) {
      return await db
        .select()
        .from(task)
        .where(taskWhereToSql(args.where))
        .orderBy(...orderByCond("orderBy" in args ? args.orderBy ?? {} : {}, TASK_ORDER_COLUMNS));
    }
    const raw = (await db.query.task.findMany({
      where: taskWhereToSql(args.where),
      orderBy: orderByCond("orderBy" in args ? args.orderBy ?? {} : {}, TASK_ORDER_COLUMNS),
      with: withConfigFor(args.include),
    })) as unknown as RawTaskWith[];
    // Branch on family keys: lens-list has `lens`, list has `tags`, ranked
    // (the ranked pool fetch) has neither.
    const include = args.include;
    return raw.map((row) => {
      if (include && "lens" in include) return assembleLensListRow(row, include);
      if (include && "tags" in include) return assembleListRow(row, include);
      return assembleRankedRow(row, include as RankedPoolInclude);
    });
  };

  const updateImpl = async (
    args: TaskUpdateArgs,
  ): Promise<
    | Task
    | { id: string; status: Task["status"]; scheduledDate: Date | null; snoozedUntil: Date | null }
    | { id: string; startedAt: Date | null }
    | { id: string; projectId: string | null; goalId: string | null }
  > => {
    const rows = await db
      .update(task)
      .set(taskUpdateSet(args.data))
      .where(eq(task.id, args.where.id))
      .returning();
    const row = rows[0];
    assertFound(row, "Task");
    if (row !== undefined && "select" in args && args.select) {
      if ("goalId" in args.select) {
        return { id: row.id, projectId: row.projectId, goalId: row.goalId };
      }
      if ("scheduledDate" in args.select) {
        const { id, status, scheduledDate, snoozedUntil } = row;
        return { id, status, scheduledDate, snoozedUntil };
      }
      return { id: row.id, startedAt: row.startedAt };
    }
    return row;
  };

  const createImpl = async (args: TaskCreateArgs): Promise<Task> => {
    const rows = await db
      .insert(task)
      .values({
        // Client-side defaults (report §4): uuid PK; Task.updatedAt has no DB
        // default and is ordering-critical, so the seam stamps it here.
        id: mintId(),
        description: args.data.description,
        permalink: args.data.permalink,
        content: args.data.content ?? null,
        userId: args.data.userId,
        lensId: args.data.lensId,
        projectId: args.data.projectId ?? null,
        goalId: args.data.goalId ?? null,
        status: args.data.status,
        priority: args.data.priority,
        size: args.data.size,
        scheduledDate: args.data.scheduledDate,
        snoozedUntil: args.data.snoozedUntil,
        updatedAt: new Date(),
      })
      .returning();
    const row = rows[0];
    assertFound(row, "Task");
    // S3 triage — resolved parsed tags connect inline (Prisma's nested
    // connect): join rows ride on the same logical write.
    if (args.data.tags?.connect?.length) {
      await db.insert(tagToTask).values(
        args.data.tags.connect.map((t) => ({ a: t.id, b: row.id })),
      );
    }
    // S3 triage — captured images move with the item (nested TaskAttachment
    // creates in the same logical write).
    if (args.data.attachments?.create?.length) {
      await db.insert(taskAttachment).values(
        args.data.attachments.create.map((a) => ({
          id: mintId(),
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          data: a.data,
          taskId: row.id,
        })),
      );
    }
    return row;
  };

  const deleteManyImpl = async (args: TaskDeleteManyArgs): Promise<BatchPayload> => {
    const rows = await db
      .delete(task)
      .where(taskWhereToSql(args.where))
      .returning({ id: task.id });
    return { count: rows.length };
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
    create: createImpl,
    deleteMany: deleteManyImpl,
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

// ================================================================
// S5/S6 delegates — Project / Goal + the supporting writes
// ================================================================

/** The raw relational project row: base project + whichever relations the
 *  include asked for. SAFETY: guaranteed at runtime by the `with` config for
 *  the same include; Drizzle's inferred result type for a dynamically-built
 *  `with` is not precise enough to use directly. */
type RawProjectWith = Project & {
  goal?: Goal | null;
  tasks?: (Task & { taskAttachments?: TaskAttachment[] | null })[] | null;
  resources?: (Resource & { resourceAttachments?: ResourceAttachment[] | null })[] | null;
  projectAttachments?: ProjectAttachment[] | null;
};

type RawGoalWith = Goal & {
  projects?: (Project & { tasks?: Task[] | null })[] | null;
};

function scalarProjectRow(raw: RawProjectWith): Project {
  const {
    goal: _goal,
    tasks: _tasks,
    resources: _resources,
    projectAttachments: _projectAttachments,
    ...scalars
  } = raw;
  return scalars;
}

function scalarGoalRow(raw: RawGoalWith): Goal {
  const { projects: _projects, ...scalars } = raw;
  return scalars;
}

/** Relational `with` shapes for the project/goal includes (the seam's
 *  Prisma-shaped includes translated to Drizzle's config). Same approach as
 *  TaskRelationalWith above: literal-typed interfaces so the configs
 *  typecheck against Drizzle's precise DBQueryConfig. */
interface ProjectRelationalWith {
  goal?: true;
  tasks?: {
    where?: SQL;
    orderBy?: SQL | SQL[];
    limit?: number;
    with?: { taskAttachments: true };
  };
  resources?: { orderBy?: SQL | SQL[]; with?: { resourceAttachments: true } };
  projectAttachments?: true;
}

interface GoalRelationalWith {
  projects?: { orderBy?: SQL | SQL[]; with?: { tasks: true } };
}

/** Relational `with` for the project-detail include (fixed shape). */
const PROJECT_DETAIL_WITH: ProjectRelationalWith = {
  goal: true,
  tasks: {
    orderBy: [asc(task.isDone), desc(task.priority), asc(task.createdAt)],
    with: { taskAttachments: true },
  },
  resources: {
    orderBy: [desc(resource.createdAt)],
    with: { resourceAttachments: true },
  },
  projectAttachments: true,
};

/** Relational `with` for the projects-list include (dynamic count/limit). */
function projectListWith(include: ProjectListInclude): ProjectRelationalWith {
  return {
    goal: true,
    tasks: {
      where: taskWhereToSql(include.tasks.where),
      orderBy: taskRelationOrder(include.tasks.orderBy),
      limit: include.tasks.take,
    },
    resources: { orderBy: [desc(resource.createdAt)] },
  };
}

function goalListWith(include: GoalListInclude): GoalRelationalWith {
  return { projects: { orderBy: projectRelationOrder(include.projects.orderBy) } };
}

function goalDetailWith(include: GoalDetailInclude): GoalRelationalWith {
  return {
    projects: {
      orderBy: projectRelationOrder(include.projects.orderBy),
      with: { tasks: true },
    },
  };
}

/** Relation order columns for the tasks nested under a project include. */
function taskRelationOrder(
  specs: Array<Record<string, SortOrder | undefined>>,
): SQL[] {
  const map: Record<string, Column> = {
    isDone: task.isDone,
    priority: task.priority,
    createdAt: task.createdAt,
  };
  const parts: SQL[] = [];
  for (const spec of specs) {
    for (const key of Object.keys(spec)) {
      const dir = spec[key];
      const column = map[key];
      if (dir === undefined || column === undefined) continue;
      parts.push(dir === "desc" ? desc(column) : asc(column));
    }
  }
  return parts;
}

/** Relation order columns for the projects nested under a goal include. */
function projectRelationOrder(
  specs: Array<Record<string, SortOrder | undefined>>,
): SQL[] {
  const map: Record<string, Column> = {
    order: project.order,
    name: project.name,
  };
  const parts: SQL[] = [];
  for (const spec of specs) {
    for (const key of Object.keys(spec)) {
      const dir = spec[key];
      const column = map[key];
      if (dir === undefined || column === undefined) continue;
      parts.push(dir === "desc" ? desc(column) : asc(column));
    }
  }
  return parts;
}

/** Per-project task counts (the `_count` translations). Keyed by projectId;
 *  projects with no matching rows are simply absent (callers default 0). */
async function taskCountByProject(
  db: DomainDb,
  projectIds: string[],
  countWhere: TaskWhereInput,
): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: task.projectId, value: count() })
    .from(task)
    .where(and(inArray(task.projectId, projectIds), taskWhereToSql(countWhere)))
    .groupBy(task.projectId);
  return new Map(rows.map((r) => [r.projectId ?? "", Number(r.value)]));
}

async function listItemCountByProject(
  db: DomainDb,
  projectIds: string[],
  isDone?: boolean,
): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const filter =
    isDone === undefined
      ? inArray(listItem.projectId, projectIds)
      : and(inArray(listItem.projectId, projectIds), eq(listItem.isDone, isDone));
  const rows = await db
    .select({ projectId: listItem.projectId, value: count() })
    .from(listItem)
    .where(filter)
    .groupBy(listItem.projectId);
  return new Map(rows.map((r) => [r.projectId ?? "", Number(r.value)]));
}

function attachmentsOfProjectRow(
  attachments: TaskAttachment[] | ProjectAttachment[] | ResourceAttachment[] | null | undefined,
): Array<{ id: string; filename: string; mimeType: string }> {
  return (attachments ?? []).map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
  }));
}

function assembleProjectListRow(
  raw: RawProjectWith,
  include: ProjectListInclude,
  openTasks: number,
  openItems: number,
): ProjectListRow {
  return {
    ...scalarProjectRow(raw),
    goal: raw.goal ? { id: raw.goal.id, name: raw.goal.name } : null,
    tasks: (raw.tasks ?? []).map((t) => ({
      id: t.id,
      permalink: t.permalink,
      description: t.description,
      priority: t.priority,
      size: t.size,
      status: t.status,
      isDone: t.isDone,
    })),
    resources: (raw.resources ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      notes: r.notes,
      createdAt: r.createdAt,
    })),
    // The include's count wheres drive the grouped queries above; the shape
    // (tasks + listItems) is fixed by ProjectListInclude._count.
    _count: { tasks: openTasks, listItems: openItems },
  };
}

function assembleProjectDetailRow(
  raw: RawProjectWith,
  _include: ProjectDetailInclude,
): ProjectDetailRow {
  return {
    ...scalarProjectRow(raw),
    goal: raw.goal
      ? { id: raw.goal.id, permalink: raw.goal.permalink, name: raw.goal.name }
      : null,
    tasks: (raw.tasks ?? []).map((t) => ({
      id: t.id,
      permalink: t.permalink,
      description: t.description,
      content: t.content,
      isDone: t.isDone,
      priority: t.priority,
      size: t.size,
      status: t.status,
      scheduledDate: t.scheduledDate,
      snoozedUntil: t.snoozedUntil,
      completedAt: t.completedAt,
      attachments: attachmentsOfProjectRow(t.taskAttachments),
    })),
    resources: (raw.resources ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      notes: r.notes,
      createdAt: r.createdAt,
      attachments: attachmentsOfProjectRow(r.resourceAttachments),
    })),
    attachments: attachmentsOfProjectRow(raw.projectAttachments),
  };
}

function assembleGoalListRow(raw: RawGoalWith, _include: GoalListInclude): GoalListRow {
  return {
    ...scalarGoalRow(raw),
    projects: (raw.projects ?? []).map((p) => ({
      id: p.id,
      permalink: p.permalink,
      name: p.name,
      isDone: p.isDone,
      order: p.order,
    })),
  };
}

function assembleGoalDetailRow(raw: RawGoalWith, _include: GoalDetailInclude): GoalDetailRow {
  return {
    ...scalarGoalRow(raw),
    projects: (raw.projects ?? []).map((p) => ({
      id: p.id,
      permalink: p.permalink,
      name: p.name,
      isDone: p.isDone,
      order: p.order,
      dueDate: p.dueDate,
      tasks: (p.tasks ?? []).map((t) => ({ id: t.id, isDone: t.isDone })),
    })),
  };
}

function projectFindUniqueWhere(where: { id: string; userId?: string }): SQL {
  return where.userId !== undefined
    ? and(eq(project.id, where.id), eq(project.userId, where.userId)) ?? eq(project.id, where.id)
    : eq(project.id, where.id);
}

/** By-PK (+optional tenancy) fetch for the Task guard reads. */
function taskFindUniqueWhereToSql(where: { id: string; userId?: string }): SQL {
  return where.userId !== undefined
    ? and(eq(task.id, where.id), eq(task.userId, where.userId)) ?? eq(task.id, where.id)
    : eq(task.id, where.id);
}

function goalFindUniqueWhere(where: { id: string; userId?: string }): SQL {
  return where.userId !== undefined
    ? and(eq(goal.id, where.id), eq(goal.userId, where.userId)) ?? eq(goal.id, where.id)
    : eq(goal.id, where.id);
}

function createProjectDelegate(db: DomainDb): ProjectDelegate {
  return {
    findUnique: async (args: ProjectFindUniqueArgs): Promise<Project | null> => {
      const rows = await db
        .select()
        .from(project)
        .where(projectFindUniqueWhere(args.where))
        .limit(1);
      return rows[0] ?? null;
    },
    findFirst: (async (args: ProjectFindFirstArgs) => {
      if (args.include) {
        const raw = (await db.query.project.findFirst({
          where: projectWhereToSql(args.where),
          with: PROJECT_DETAIL_WITH,
        })) as unknown as RawProjectWith | undefined;
        if (!raw) return null;
        return assembleProjectDetailRow(raw, args.include);
      }
      const rows = await db
        .select()
        .from(project)
        .where(projectWhereToSql(args.where))
        .limit(1);
      return rows[0] ?? null;
    }) as ProjectDelegate["findFirst"],
    findMany: (async (args: ProjectFindManyArgs) => {
      if (args.include) {
        const raw = (await db.query.project.findMany({
          where: projectWhereToSql(args.where),
          orderBy: orderByCond(args.orderBy ?? {}, PROJECT_ORDER_COLUMNS),
          with: projectListWith(args.include),
        })) as unknown as RawProjectWith[];
        const ids = raw.map((r) => r.id);
        const [openTasks, openItems] = await Promise.all([
          taskCountByProject(db, ids, args.include._count.select.tasks.where),
          listItemCountByProject(db, ids, args.include._count.select.listItems.where.isDone),
        ]);
        return raw.map((row) =>
          assembleProjectListRow(
            row,
            args.include as ProjectListInclude,
            openTasks.get(row.id) ?? 0,
            openItems.get(row.id) ?? 0,
          ),
        );
      }
      // The done-totals rollup (select: { id, _count }).
      const rows = await db
        .select({ id: project.id })
        .from(project)
        .where(projectWhereToSql(args.where));
      const ids = rows.map((r) => r.id);
      const [doneTasks, doneItems] = await Promise.all([
        taskCountByProject(db, ids, { isDone: true }),
        listItemCountByProject(db, ids, true),
      ]);
      const totals: ProjectTotalsRow[] = rows.map((r) => ({
        id: r.id,
        _count: {
          tasks: doneTasks.get(r.id) ?? 0,
          listItems: doneItems.get(r.id) ?? 0,
        },
      }));
      return totals;
    }) as ProjectDelegate["findMany"],
    create: async (args: ProjectCreateArgs): Promise<Project> => {
      // S3 triage: nested image attachments are extracted and inserted after
      // the parent (Prisma nested-create semantics) — never handed to Drizzle.
      const { attachments, ...scalars } = args.data;
      const rows = await db
        .insert(project)
        .values({ id: mintId(), ...scalars })
        .returning();
      const row = rows[0];
      assertFound(row, "Project");
      if (attachments?.create?.length) {
        await db.insert(projectAttachment).values(
          attachments.create.map((a) => ({
            id: mintId(),
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            data: a.data,
            projectId: row.id,
          })),
        );
      }
      return row;
    },
    update: async (args: ProjectUpdateArgs): Promise<Project> => {
      const rows = await db
        .update(project)
        .set(args.data)
        .where(eq(project.id, args.where.id))
        .returning();
      const row = rows[0];
      assertFound(row, "Project");
      return row;
    },
    updateMany: async (args: {
      where: ProjectWhereInput;
      data: ProjectUpdateInput;
    }): Promise<BatchPayload> => {
      const rows = await db
        .update(project)
        .set(args.data)
        .where(projectWhereToSql(args.where))
        .returning({ id: project.id });
      return { count: rows.length };
    },
    count: async (args: { where: ProjectWhereInput }): Promise<number> => {
      const rows = await db
        .select({ value: count() })
        .from(project)
        .where(projectWhereToSql(args.where));
      return rows[0]?.value ?? 0;
    },
    delete: async (args: ProjectDeleteArgs): Promise<Project> => {
      const rows = await db
        .delete(project)
        .where(eq(project.id, args.where.id))
        .returning();
      const row = rows[0];
      assertFound(row, "Project");
      return row;
    },
  };
}

function createGoalDelegate(db: DomainDb): GoalDelegate {
  return {
    findUnique: async (args: GoalFindUniqueArgs): Promise<Goal | null> => {
      const rows = await db
        .select()
        .from(goal)
        .where(goalFindUniqueWhere(args.where))
        .limit(1);
      return rows[0] ?? null;
    },
    findFirst: (async (args: GoalFindFirstArgs) => {
      if (args.include) {
        const raw = (await db.query.goal.findFirst({
          where: goalWhereToSql(args.where),
          with: goalDetailWith(args.include),
        })) as unknown as RawGoalWith | undefined;
        if (!raw) return null;
        return assembleGoalDetailRow(raw, args.include);
      }
      const rows = await db
        .select()
        .from(goal)
        .where(goalWhereToSql(args.where))
        .limit(1);
      return rows[0] ?? null;
    }) as GoalDelegate["findFirst"],
    findMany: (async (args: GoalFindManyArgs) => {
      if (args.include) {
        const raw = (await db.query.goal.findMany({
          where: goalWhereToSql(args.where),
          orderBy: orderByCond(args.orderBy ?? {}, GOAL_ORDER_COLUMNS),
          with: goalListWith(args.include),
        })) as unknown as RawGoalWith[];
        return raw.map((row) => assembleGoalListRow(row, args.include as GoalListInclude));
      }
      return await db
        .select()
        .from(goal)
        .where(goalWhereToSql(args.where))
        .orderBy(...orderByCond(args.orderBy ?? {}, GOAL_ORDER_COLUMNS));
    }) as GoalDelegate["findMany"],
    create: async (args: GoalCreateArgs): Promise<Goal> => {
      const rows = await db
        .insert(goal)
        .values({ id: mintId(), ...args.data })
        .returning();
      const row = rows[0];
      assertFound(row, "Goal");
      return row;
    },
    update: async (args: GoalUpdateArgs): Promise<Goal> => {
      const rows = await db
        .update(goal)
        .set(args.data)
        .where(eq(goal.id, args.where.id))
        .returning();
      const row = rows[0];
      assertFound(row, "Goal");
      return row;
    },
    count: async (args: { where: GoalWhereInput }): Promise<number> => {
      const rows = await db
        .select({ value: count() })
        .from(goal)
        .where(goalWhereToSql(args.where));
      return rows[0]?.value ?? 0;
    },
    delete: async (args: { where: { id: string } }): Promise<Goal> => {
      const rows = await db.delete(goal).where(eq(goal.id, args.where.id)).returning();
      const row = rows[0];
      assertFound(row, "Goal");
      return row;
    },
  };
}

// ================================================================
// S2/S3 — inbox delegates: capture create (with attachment metadata reads),
// the UNPROCESSED list, text edits, archive/delete, plus Tag/InboxAttachment
// for the triage orchestrator.
// ================================================================

function inboxItemWhereToSql(where: InboxItemWhereInput): SQL | undefined {
  const parts: SQL[] = [];
  if (where.id !== undefined) parts.push(eq(inboxItem.id, where.id));
  if (where.userId !== undefined) parts.push(eq(inboxItem.userId, where.userId));
  if (where.status !== undefined) parts.push(enumCond(inboxItem.status, where.status));
  if (where.AND !== undefined) {
    const inner = where.AND.map((w: InboxItemWhereInput) => inboxItemWhereToSql(w)).filter((c: SQL | undefined): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(combine(inner));
  }
  if (where.OR !== undefined) {
    const inner = where.OR.map((w: InboxItemWhereInput) => inboxItemWhereToSql(w)).filter((c: SQL | undefined): c is SQL => c !== undefined);
    if (inner.length > 0) {
      const anyOf = or(...inner);
      if (anyOf) parts.push(anyOf);
    }
  }
  if (where.NOT !== undefined) {
    const members = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    const inner = members.map((w: InboxItemWhereInput) => inboxItemWhereToSql(w)).filter((c: SQL | undefined): c is SQL => c !== undefined);
    if (inner.length > 0) parts.push(not(combine(inner)));
  }
  return parts.length === 0 ? undefined : combine(parts);
}

const INBOX_ITEM_ORDER_COLUMNS: Record<string, Column> = {
  id: inboxItem.id,
  createdAt: inboxItem.createdAt,
  status: inboxItem.status,
};

/** Prune a full InboxItem row to the capture create's select shape. */
function pruneInboxItemCreate(
  row: InboxItem,
  select: { id?: true; text?: true; createdAt?: true },
): InboxItem | { id: string; text: string; createdAt: Date } {
  if (!select) return row;
  const pruned: Record<string, unknown> = {};
  for (const key of Object.keys(select) as (keyof typeof select)[]) {
    if (select[key] === true) pruned[key] = row[key];
  }
  return pruned as { id: string; text: string; createdAt: Date };
}

function createInboxItemDelegate(db: DomainDb): InboxItemDelegate {
  const findUniqueImpl = async (
    args: InboxItemFindUniqueArgs | { where: { id: string } },
  ): Promise<InboxItemWithAttachments | InboxItem | null> => {
    // Include form (triage's main read): attachment METADATA only — the blobs
    // are fetched solely in the branches that move attachments.
    if ("include" in args && args.include) {
      const raw = await db.query.inboxItem.findFirst({
        where: eq(inboxItem.id, args.where.id),
        with: { inboxAttachments: true },
      });
      if (!raw) return null;
      const { inboxAttachments, ...scalars } = raw;
      return {
        ...scalars,
        attachments: (inboxAttachments ?? []).map((a) => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
        })),
      };
    }
    const rows = await db.select().from(inboxItem).where(eq(inboxItem.id, args.where.id)).limit(1);
    return rows[0] ?? null;
  };

  return {
    create: async (args: {
      data: InboxItemCreateInput;
      select?: { id?: true; text?: true; createdAt?: true };
    }): Promise<InboxItem | { id: string; text: string; createdAt: Date }> => {
      const { attachments, ...scalars } = args.data;
      const rows = await db
        .insert(inboxItem)
        .values({
          id: mintId(),
          text: scalars.text,
          content: scalars.content ?? null,
          userId: scalars.userId,
          parsedTags: scalars.parsedTags,
          ...(scalars.title !== undefined ? { title: scalars.title } : {}),
          ...(scalars.sourceUrl !== undefined ? { sourceUrl: scalars.sourceUrl } : {}),
          ...(scalars.status !== undefined ? { status: scalars.status } : {}),
          ...(scalars.archivedAt !== undefined ? { archivedAt: scalars.archivedAt } : {}),
          ...(scalars.parsedScheduledDate !== undefined
            ? { parsedScheduledDate: scalars.parsedScheduledDate }
            : {}),
          ...(scalars.parsedSnoozedUntil !== undefined
            ? { parsedSnoozedUntil: scalars.parsedSnoozedUntil }
            : {}),
          ...(scalars.parsedPriority !== undefined
            ? { parsedPriority: scalars.parsedPriority }
            : {}),
          ...(scalars.parsedSize !== undefined ? { parsedSize: scalars.parsedSize } : {}),
          ...(scalars.parsedProject !== undefined
            ? { parsedProject: scalars.parsedProject }
            : {}),
          ...(scalars.parsedLens !== undefined ? { parsedLens: scalars.parsedLens } : {}),
          ...(scalars.parsedProjectId !== undefined
            ? { parsedProjectId: scalars.parsedProjectId }
            : {}),
          ...(scalars.parsedLensId !== undefined
            ? { parsedLensId: scalars.parsedLensId }
            : {}),
        })
        .returning();
      const row = rows[0];
      assertFound(row, "InboxItem");
      // Nested-create the attachment rows in the same logical write (Prisma's
      // nested create). Bytes stay behind the attachment route (S12).
      if (attachments?.create?.length) {
        await db.insert(inboxAttachment).values(
          attachments.create.map((a) => ({
            id: mintId(),
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            data: a.data,
            inboxItemId: row.id,
          })),
        );
      }
      return pruneInboxItemCreate(row, args.select ?? {});
    },
    findUnique: findUniqueImpl as InboxItemDelegate["findUnique"],
    findMany: async (args: InboxItemFindManyArgs): Promise<InboxItemListRow[]> => {
      const raw = (await db.query.inboxItem.findMany({
        where: inboxItemWhereToSql(args.where),
        orderBy: orderByCond(args.orderBy ?? {}, INBOX_ITEM_ORDER_COLUMNS),
        with: { inboxAttachments: true },
      })) as unknown as (InboxItem & { inboxAttachments?: (InboxItem["parsedTags"] extends never ? never : never) | Array<{ id: string; filename: string; mimeType: string; size: number }> }[]) as unknown as Array<
        InboxItem & { inboxAttachments?: Array<{ id: string; filename: string; mimeType: string; size: number }> | null }
      >;
      return raw.map((row) => {
        const { inboxAttachments, ...scalars } = row;
        return {
          ...scalars,
          attachments: (inboxAttachments ?? []).map((a) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
          })),
        };
      });
    },
    update: async (args: InboxItemUpdateArgs): Promise<InboxItem> => {
      const rows = await db
        .update(inboxItem)
        .set(args.data)
        .where(eq(inboxItem.id, args.where.id))
        .returning();
      const row = rows[0];
      assertFound(row, "InboxItem");
      return row;
    },
    updateMany: async (args: {
      where: InboxItemWhereInput;
      data: InboxItemUpdateArgs["data"];
    }): Promise<BatchPayload> => {
      const rows = await db
        .update(inboxItem)
        .set(args.data)
        .where(inboxItemWhereToSql(args.where))
        .returning({ id: inboxItem.id });
      return { count: rows.length };
    },
    delete: async (args: { where: { id: string } }): Promise<InboxItem> => {
      const rows = await db.delete(inboxItem).where(eq(inboxItem.id, args.where.id)).returning();
      const row = rows[0];
      assertFound(row, "InboxItem");
      return row;
    },
  } as unknown as InboxItemDelegate;
}

function createInboxAttachmentDelegate(db: DomainDb): InboxAttachmentDelegate {
  return {
    findMany: async (args: {
      where: { inboxItemId: string };
      select: { filename: true; mimeType: true; size: true; data: true };
    }): Promise<InboxAttachmentBlobRow[]> => {
      // The lazy blob fetch a moving triage branch performs (metadata-only on
      // the main read keeps every click light; this runs at most once).
      const rows = await db
        .select({
          filename: inboxAttachment.filename,
          mimeType: inboxAttachment.mimeType,
          size: inboxAttachment.size,
          data: inboxAttachment.data,
        })
        .from(inboxAttachment)
        .where(eq(inboxAttachment.inboxItemId, args.where.inboxItemId));
      return rows;
    },
  };
}

function createTagDelegate(db: DomainDb): TagDelegate {
  return {
    upsert: async (args: TagUpsertArgs): Promise<{ id: string }> => {
      const existing = await db
        .select({ id: tag.id })
        .from(tag)
        .where(
          and(eq(tag.userId, args.where.userId_name.userId), eq(tag.name, args.where.userId_name.name)),
        )
        .limit(1);
      if (existing[0]) return { id: existing[0].id };
      // update: {} — Prisma no-op; Tag carries no updatedAt to re-stamp.
      const rows = await db
        .insert(tag)
        .values({
          id: mintId(),
          name: args.create.name,
          color: args.create.color,
          userId: args.create.userId,
        })
        .returning({ id: tag.id });
      return { id: rows[0].id };
    },
  };
}

function createResourceDelegate(db: DomainDb): ResourceDelegate {
  return {
    deleteMany: async (args: {
      where: ResourceWhereInput;
    }): Promise<BatchPayload> => {
      const rows = await db
        .delete(resource)
        .where(
          and(
            eq(resource.projectId, args.where.projectId),
            eq(resource.userId, args.where.userId),
          ),
        )
        .returning({ id: resource.id });
      return { count: rows.length };
    },
    create: async (args: ResourceCreateArgs): Promise<{ id: string }> => {
      const { attachments, ...scalars } = args.data;
      const rows = await db
        .insert(resource)
        .values({
          id: mintId(),
          title: scalars.title,
          url: scalars.url ?? null,
          notes: scalars.notes ?? null,
          userId: scalars.userId,
          projectId: scalars.projectId,
        })
        .returning();
      const row = rows[0];
      assertFound(row, "Resource");
      if (attachments?.create?.length) {
        await db.insert(resourceAttachment).values(
          attachments.create.map((a) => ({
            id: mintId(),
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            data: a.data,
            resourceId: row.id,
          })),
        );
      }
      return { id: row.id };
    },
  };
}

function listItemWhereToSql(where: ListItemFindFirstArgs["where"]): SQL {
  const parts: SQL[] = [];
  if (where.id !== undefined) parts.push(eq(listItem.id, where.id));
  if (where.userId !== undefined) parts.push(eq(listItem.userId, where.userId));
  if (where.projectId !== undefined) parts.push(eq(listItem.projectId, where.projectId));
  if (where.isDone !== undefined) parts.push(boolCond(listItem.isDone, where.isDone));
  return combine(parts);
}

function createListItemDelegate(db: DomainDb): ListItemDelegate {
  return {
    count: async (args: ListItemCountArgs): Promise<number> => {
      const filter =
        args.where.isDone === undefined
          ? eq(listItem.projectId, args.where.projectId)
          : and(
              eq(listItem.projectId, args.where.projectId),
              eq(listItem.isDone, args.where.isDone),
            );
      const rows = await db
        .select({ value: count() })
        .from(listItem)
        .where(filter);
      return rows[0]?.value ?? 0;
    },
    findFirst: async (args: ListItemFindFirstArgs) => {
      // Full row (the select is advisory — createListItemCore reads .order).
      const rows = await db
        .select()
        .from(listItem)
        .where(listItemWhereToSql(args.where))
        .orderBy(...orderByCond(args.orderBy ?? {}, { order: listItem.order }))
        .limit(1);
      return rows[0] ?? null;
    },
    create: async (args: ListItemCreateArgs) => {
      const { attachments, ...scalars } = args.data;
      const rows = await db
        .insert(listItem)
        .values({
          id: mintId(),
          userId: scalars.userId,
          projectId: scalars.projectId,
          text: scalars.text,
          content: scalars.content ?? null,
          sourceUrl: scalars.sourceUrl ?? null,
          order: scalars.order ?? 0,
          // ListItem.updatedAt has no DB default (Prisma client-side default).
          updatedAt: new Date(),
        })
        .returning();
      const row = rows[0];
      assertFound(row, "ListItem");
      if (attachments?.create?.length) {
        await db.insert(listItemAttachment).values(
          attachments.create.map((a) => ({
            id: mintId(),
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            data: a.data,
            listItemId: row.id,
          })),
        );
      }
      return row;
    },
  };
}
