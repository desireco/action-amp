/**
 * Pure logbook-operation core — ported verbatim from
 * `webapp/src/logbook/operationsCore.ts` (S8; body unchanged, types re-expressed
 * against the seam). Pattern (mirrors `tasks/operationsCore.ts`): the core
 * takes `entities` as its first arg (the Prisma-client-shaped seam object —
 * `createEntities(createDb(url))` at the API layer, or a Vitest mock in tests)
 * plus plain args, does the DB work, and returns data. **No server framework
 * import lives here.**
 *
 * The API layer's procedures are thin wrappers: auth check + entitlement guard
 * (assertLensAllowed) + delegate here. Note: the webapp's Wasp op lacked the
 * lens guard (a known gap); the port's oRPC endpoint ADDS it — parity with the
 * CLI route, which gates via `gateLens` (the CLI route itself is S18's).
 * The core itself takes the args and does the queries; the caller decides
 * entitlement.
 */

import type {
  GoalDelegate,
  GoalLogbookRow,
  InboxItemDelegate,
  InboxItemLogbookRow,
  ProjectDelegate,
  ProjectLogbookRow,
  Size,
  TaskDelegate,
  TaskLogbookRow,
  TaskWontDoRow,
} from "../db/index.js";

// ----------------------------------------------------------------
// Entities slices — the delegates this core calls. The seam `Entities`
// (`../db`) satisfies this; see src/db/seam.checks.ts.
// ----------------------------------------------------------------

export interface LogbookEntities {
  Task: Pick<TaskDelegate, "findMany">;
  Project: Pick<ProjectDelegate, "findMany">;
  Goal: Pick<GoalDelegate, "findMany">;
  InboxItem: Pick<InboxItemDelegate, "findMany">;
}

/** The mapped log rows the core returns (one interface per kind). */
export interface TaskLogEntry {
  id: string;
  title: string;
  completedAt: Date;
  size: Size;
  outcome: string | null;
  project: { id: string; name: string } | null;
  kind: "task";
}

export interface WontDoLogEntry {
  id: string;
  title: string;
  /** The decline timestamp — mapped from the row's `updatedAt`. */
  completedAt: Date;
  size: Size;
  project: { id: string; name: string } | null;
  kind: "wont-do";
}

export interface ProjectLogEntry {
  id: string;
  title: string;
  completedAt: Date;
  goal: { id: string; name: string } | null;
  kind: "project";
}

export interface GoalLogEntry {
  id: string;
  title: string;
  completedAt: Date;
  /** A goal has no parent goal — always null (goal-planning spec §D). */
  goal: null;
  kind: "goal";
}

export interface ArchivedLogEntry {
  id: string;
  title: string;
  archivedAt: Date;
  kind: "archived";
}

export interface LogbookData {
  tasks: TaskLogEntry[];
  wontDo: WontDoLogEntry[];
  projects: ProjectLogEntry[];
  goals: GoalLogEntry[];
  archived: ArchivedLogEntry[];
}

// ----------------------------------------------------------------
// Read: the Logbook — things no longer active, scoped to a Lens
// ----------------------------------------------------------------
// Five categories, all read-only except the wont-do restore (which lives in
// the write ops — `updateTaskStatus` to UPCOMING):
//  - completed Tasks  (isDone, completedAt)
//  - wont-do Tasks    (status=WONT_DO — "I considered this and chose not to")
//  - completed Projects
//  - completed Goals  (goal-planning spec §D — same shape as projects, with
//                      goal: null since a goal has no parent goal)
//  - archived InboxItems ("I will not do now") — status ARCHIVED, archivedAt.
//
// Scoping note: Tasks, Projects, and Goals carry a lensId; archived InboxItems
// do NOT (the inbox is universal). Archived notes are returned regardless of
// the active lens — they belong to the user, not a context.
export async function getLogbookData(
  entities: LogbookEntities,
  { userId, lensId }: { userId: string; lensId: string },
): Promise<LogbookData> {
  const [tasks, wontDo, projects, goals, archived] = await Promise.all([
    entities.Task.findMany({
      where: {
        userId,
        lensId,
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        description: true,
        completedAt: true,
        size: true,
        outcome: true,
        project: { select: { id: true, name: true } },
      },
    }),
    // Won't-do tasks — status=WONT_DO. The "I considered and chose not to do
    // this" bucket. Restorable to a horizon via updateTaskStatus (the Logbook
    // UI is the only place reactivation lives; the task detail view is one-way).
    // Ordered by updatedAt (NOT completedAt — there was a historical 500 here
    // when the query read a non-existent archivedAt column; the e2e guards it).
    entities.Task.findMany({
      where: {
        userId,
        lensId,
        status: "WONT_DO",
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        description: true,
        updatedAt: true,
        size: true,
        project: { select: { id: true, name: true } },
      },
    }),
    entities.Project.findMany({
      where: {
        userId,
        lensId,
        isDone: true,
        completedAt: { not: null },
        // Simple-list projects are never completable — keep them out.
        type: "STANDARD",
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        name: true,
        completedAt: true,
        goal: { select: { id: true, name: true } },
      },
    }),
    // Completed Goals — lens-scoped like tasks/projects (goal-planning spec §D).
    entities.Goal.findMany({
      where: {
        userId,
        lensId,
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        name: true,
        completedAt: true,
      },
    }),
    // Archived notes — universal (no lens filter).
    entities.InboxItem.findMany({
      where: {
        userId,
        status: "ARCHIVED",
      },
      orderBy: { archivedAt: "desc" },
      select: {
        id: true,
        text: true,
        archivedAt: true,
      },
    }),
  ]);

  return {
    tasks: tasks.map(
      (t: TaskLogbookRow): TaskLogEntry => ({
        id: t.id,
        title: t.description,
        completedAt: t.completedAt!,
        size: t.size,
        outcome: t.outcome,
        project: t.project,
        kind: "task",
      }),
    ),
    wontDo: wontDo.map(
      (t: TaskWontDoRow): WontDoLogEntry => ({
        id: t.id,
        title: t.description,
        completedAt: t.updatedAt!,
        size: t.size,
        project: t.project,
        kind: "wont-do",
      }),
    ),
    projects: projects.map(
      (p: ProjectLogbookRow): ProjectLogEntry => ({
        id: p.id,
        title: p.name,
        completedAt: p.completedAt!,
        goal: p.goal,
        kind: "project",
      }),
    ),
    goals: goals.map(
      (g: GoalLogbookRow): GoalLogEntry => ({
        id: g.id,
        title: g.name,
        completedAt: g.completedAt!,
        goal: null,
        kind: "goal",
      }),
    ),
    archived: archived.map(
      (a: InboxItemLogbookRow): ArchivedLogEntry => ({
        id: a.id,
        title: a.text,
        archivedAt: a.archivedAt!,
        kind: "archived",
      }),
    ),
  };
}
