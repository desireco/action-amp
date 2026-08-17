/**
 * Pure task-operation cores — the shared DB layer for both Wasp server ops
 * (`./operations.ts`) and future `/api/cli/*` PAT routes.
 *
 * Pattern (mirrors `billing/entitlements.ts`): every core takes `entities` as
 * its first arg (typed loosely — any Prisma-client-shaped object works, whether
 * that's Wasp's per-op `context.entities` or a PAT route's shared Prisma
 * singleton) plus plain args, does the DB work, and returns data. **No
 * `wasp/server` import lives here.** Wasp's `detectServerImports` plugin blocks
 * `wasp/server` under `src/` in the client build Vitest uses, so keeping this
 * module pure keeps it unit-testable and importable from both worlds.
 *
 * The Wasp ops in `operations.ts` become thin wrappers: auth check
 * (`if (!context.user) throw`) + entitlement guards (`assertLensAllowed`) +
 * delegate here. Tenancy + the entitlement decision stay in the wrapper; the
 * pure DB shape stays here.
 *
 * Exported ranks (`PRIORITY_RANK`, `SIZE_RANK`) are re-exported from
 * `operations.ts` for back-compat — the CLI's `auth/patRoutes.ts` already
 * imports them from there.
 */

import type {
  Prisma,
  Priority,
  Size,
  Tag,
  Task,
  TaskSession,
} from "@prisma/client";
import {
  resolveAccessibleLenses,
  type LensListLookup,
} from "../billing/entitlements";
import { activePoolWhere } from "./activePool";

/**
 * The entities slice these cores touch, typed with Prisma-generated arg types
 * (named, not a loose map). Generic-arg methods return FULL rows; callers
 * that pass a `select` may only read the fields their select carried.
 * Callers pass Wasp's per-op delegates, the PAT route's shared client, or a
 * Vitest mock — all satisfy this slice structurally.
 */
/** A list row: base task + tags + the light project/goal refs list pages render. */
export interface TaskListRow extends Task {
  tags: Tag[];
  project: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
}

/** Payload-friendly mapped forms of the row types (Wasp op outputs must be
 *  index-signature-assignable; Prisma-extending interfaces are not, mapped
 *  types are). */
export type TaskDetailResult =
  | {
      [
        K in keyof (TaskDetailRow & {
          tags: Tag[];
          updates: Array<{
            id: string;
            body: string;
            kind: string;
            createdAt: Date;
          }>;
        })
      ]: (TaskDetailRow & {
        tags: Tag[];
        updates: Array<{
          id: string;
          body: string;
          kind: string;
          createdAt: Date;
        }>;
      })[K];
    }
  | null;
export type TaskListResult = { [K in keyof TaskListRow]: TaskListRow[K] }[];
export type TaskLensListResult = {
  [K in keyof TaskLensListRow]: TaskLensListRow[K];
}[];
export type DoneTodayResult = { [K in keyof DoneTodayRow]: DoneTodayRow[K] }[];
export type HydratedTaskResult =
  { [K in keyof HydratedTask]: HydratedTask[K] } | null;
export type RankedPoolResult =
  { [K in keyof RankedPoolRow]: RankedPoolRow[K] } | null;

/** A ranked-pool candidate: base task + the project/goal refs rankTopTask ties
 *  break on and the Next/Focus surfaces display. */
export interface RankedPoolRow extends Task {
  project: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
}

/** A list row that also carries its lens (grouped/global views). */
export interface TaskLensListRow extends TaskListRow {
  lens: { id: string; name: string; color: string | null } | null;
}

/** A detail row: base task + permalink-carrying project/goal refs. */
export interface TaskDetailRow extends Task {
  project: { id: string; permalink: string; name: string } | null;
  goal: { id: string; permalink: string; name: string } | null;
  attachments: Array<{ id: string; filename: string; mimeType: string }>;
}

/** The delegate slices for include-carrying reads — literal-arg methods so
 *  the typed rows match exactly what each include selects (per-function slices
 *  rather than overloads, which Prisma's branded arg types reject). */
interface TaskListEntities {
  Task: {
    findMany(args: {
      where: Prisma.TaskWhereInput;
      orderBy?: Prisma.TaskOrderByWithRelationInput[];
      include: {
        tags: true;
        project: { select: { id: true; name: true } };
        goal: { select: { id: true; name: true } };
      };
    }): Promise<TaskListRow[]>;
  };
}

interface TaskLensListEntities {
  Task: {
    findMany(args: {
      where: Prisma.TaskWhereInput;
      orderBy?: Prisma.TaskOrderByWithRelationInput[];
      include: {
        tags: true;
        project: { select: { id: true; name: true } };
        goal: { select: { id: true; name: true } };
        lens: { select: { id: true; name: true; color: true } };
      };
    }): Promise<TaskLensListRow[]>;
  };
}

interface TaskDetailEntities {
  Task: {
    findFirst(args: {
      where: Prisma.TaskWhereInput;
      include: {
        tags: true;
        updates: { orderBy: { createdAt: "asc" } };
        project: { select: { id: true; permalink: true; name: true } };
        goal: { select: { id: true; permalink: true; name: true } };
        attachments: { select: { id: true; filename: true; mimeType: true } };
      };
    }): Promise<
      | (TaskDetailRow & {
          tags: Tag[];
          updates: Array<{
            id: string;
            body: string;
            kind: string;
            createdAt: Date;
          }>;
        })
      | null
    >;
  };
}

/** Done-today rows: list row + lens + tags. */
export interface DoneTodayRow extends TaskLensListRow {
  tags: Tag[];
}

interface DoneTodayEntities {
  Task: {
    findMany(args: {
      where: Prisma.TaskWhereInput;
      orderBy: { completedAt: "desc" };
      include: {
        tags: true;
        project: { select: { id: true; name: true } };
        goal: { select: { id: true; name: true } };
        lens: { select: { id: true; name: true; color: true } };
      };
    }): Promise<DoneTodayRow[]>;
  };
}

interface TaskEntities {
  Task: {
    findUnique(args: Prisma.TaskFindUniqueArgs): Promise<Task | null>;
    findFirst(args: Prisma.TaskFindFirstArgs): Promise<Task | null>;
    findMany(args: Prisma.TaskFindManyArgs): Promise<Task[]>;
    update(args: Prisma.TaskUpdateArgs): Promise<Task>;
    updateMany(args: Prisma.TaskUpdateManyArgs): Promise<Prisma.BatchPayload>;
  };
  TaskSession: {
    findFirst(
      args: Prisma.TaskSessionFindFirstArgs,
    ): Promise<TaskSession | null>;
    create(args: Prisma.TaskSessionCreateArgs): Promise<TaskSession>;
    update(args: Prisma.TaskSessionUpdateArgs): Promise<TaskSession>;
    updateMany(
      args: Prisma.TaskSessionUpdateManyArgs,
    ): Promise<Prisma.BatchPayload>;
  };
}

// ----------------------------------------------------------------
// Rank maps (re-exported from operations.ts for back-compat)
// ----------------------------------------------------------------
// Exported so the CLI `/api/cli/now` stub (auth/patRoutes.ts) ranks candidates
// identically without re-implementing the maps — drift here would mean the
// CLI surfaces a different "top" than the home screen.
export const PRIORITY_RANK = {
  IMPORTANT: 0,
  NORMAL: 1,
  LOW: 2,
} as const satisfies Record<Priority, number>;
export const SIZE_RANK = { S: 0, M: 1, L: 2, XL: 3 } as const satisfies Record<
  Size,
  number
>;

// ----------------------------------------------------------------
// Read: single task (the detail page lookup)
// ----------------------------------------------------------------
// `updates` ordered oldest → newest so every consumer gets a chronological
// activity thread by default (focus mode, task detail). task-notes-
// completion-log spec.
export async function getTaskData(
  entities: TaskDetailEntities,
  { userId, id }: { userId: string; id: string },
): Promise<TaskDetailResult> {
  return await entities.Task.findFirst({
    where: {
      userId,
      OR: [{ id }, { permalink: id }],
    },
    include: {
      tags: true,
      updates: { orderBy: { createdAt: "asc" } },
      project: { select: { id: true, permalink: true, name: true } },
      goal: { select: { id: true, permalink: true, name: true } },
      attachments: { select: { id: true, filename: true, mimeType: true } },
    },
  });
}

// ----------------------------------------------------------------
// Read: list tasks in a lens, optionally filtered by status
// ----------------------------------------------------------------
// Used by Today (status=TODAY, not done), Upcoming (status=UPCOMING or dueDate
// in the future), Someday (status=SOMEDAY), Logbook (isDone=true).
export async function getTasksData(
  entities: TaskListEntities & LensListLookup,
  {
    userId,
    lensId,
    status,
    isDone,
  }: {
    userId: string;
    lensId: string;
    status?: "TODAY" | "UPCOMING" | "SOMEDAY";
    isDone?: boolean;
  },
): Promise<TaskListResult> {
  const where: Prisma.TaskWhereInput = {
    userId,
    lensId,
  };
  if (status) where.status = status;
  if (isDone !== undefined) where.isDone = isDone;

  return await entities.Task.findMany({
    where,
    orderBy: [{ order: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    include: {
      tags: true,
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
    },
  });
}

// ----------------------------------------------------------------
// Read: global Today list (across all accessible lenses)
// ----------------------------------------------------------------
// Today is universal (WORKFLOW.md §5.11) — the committed-for-today list spans
// every lens the user can read, not just the active one. The entitlement gate
// is the accessible-lens SET (resolveAccessibleLenses), not a per-task
// assertLensAllowed. `lens` is included per row so the page can render a
// provenance pill.
export async function getTodayTasksData(
  entities: TaskLensListEntities & LensListLookup,
  {
    user,
    userId,
  }: { user: Parameters<typeof resolveAccessibleLenses>[1]; userId: string },
): Promise<TaskLensListResult> {
  const accessible = await resolveAccessibleLenses(
    { Lens: entities.Lens },
    user,
    userId,
  );
  const lensIds = accessible.map((l) => l.id);
  // No accessible lenses (a brand-new account mid-onboarding) → empty list
  // rather than relying on Prisma's `in: []` semantics.
  if (lensIds.length === 0) return [];

  return await entities.Task.findMany({
    where: {
      userId,
      lensId: { in: lensIds },
      status: "TODAY",
      isDone: false,
    },
    orderBy: [{ order: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    include: {
      tags: true,
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
      lens: { select: { id: true, name: true, color: true } },
    },
  });
}

// ----------------------------------------------------------------
// Read: global Week schedule (Monday–Sunday, across accessible lenses)
// ----------------------------------------------------------------
// Week is a scheduling horizon, not another status. It intentionally includes
// both bench tasks and tasks already committed to Today so promoting a
// scheduled task does not make it disappear from its weekday.
export async function getWeekTasksData(
  entities: TaskLensListEntities & LensListLookup,
  {
    user,
    userId,
    now = new Date(),
  }: {
    user: Parameters<typeof resolveAccessibleLenses>[1];
    userId: string;
    now?: Date;
  },
): Promise<TaskLensListResult> {
  const accessible = await resolveAccessibleLenses(
    { Lens: entities.Lens },
    user,
    userId,
  );
  const lensIds = accessible.map((lens) => lens.id);
  if (lensIds.length === 0) return [];

  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  // JavaScript Sunday=0; ActionAmp weeks are Monday–Sunday.
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  return await entities.Task.findMany({
    where: {
      userId,
      lensId: { in: lensIds },
      status: { in: ["TODAY", "UPCOMING"] },
      isDone: false,
      // In the pool: committed-now tasks OR anything dated before the week
      // ends. A Today commit is due TODAY — today is inside this week — even
      // when it carries no dueDate (the triage/move paths null it), so it must
      // count and render in the Today bucket; without the status arm, the
      // Today badge could read 1 while This week read 0 for the same task.
      // The bare `lt nextWeekStart` (not gte weekStart) also admits overdue
      // rows — an open task that slipped past its date is still due, and the
      // page buckets it under Today rather than hiding it.
      OR: [{ status: "TODAY" }, { dueDate: { lt: nextWeekStart } }],
    },
    orderBy: [
      { dueDate: "asc" },
      { order: "asc" },
      { priority: "desc" },
      { createdAt: "asc" },
    ],
    include: {
      tags: true,
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
      lens: { select: { id: true, name: true, color: true } },
    },
  });
}

// ----------------------------------------------------------------
// Read: tasks completed today (for the Today "Done today" section)
// ----------------------------------------------------------------
// Separate from getTasksData (which has no date filter and returns full
// history). Completed since local-midnight, newest first. Includes project/goal
// + lens so the section can group the same way open tasks do.
//
// `lensIds` is pre-resolved by the caller: either the single lensId (lens-
// scoped path) OR the accessible set (global path). The local-midnight boundary
// (startOfToday) computation stays in this core so both paths share it.
export async function getDoneTodayData(
  entities: DoneTodayEntities,
  { userId, lensIds }: { userId: string; lensIds: string[] },
): Promise<DoneTodayResult> {
  // Local-midnight boundary: completedAt is stamped server-side on toggle; we
  // compare against the start of "today" in the server's locale. Day-granular
  // is the right resolution for a "done today" section.
  // Status scoping: only tasks committed to Today (status=TODAY) belong here.
  // Completion (completeTaskFromFocus) sets isDone + completedAt but leaves
  // status untouched, so an Upcoming task finished via focus stays
  // status=UPCOMING and is correctly excluded.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Empty accessible set → empty result (no Prisma `in: []` surprise).
  if (lensIds.length === 0) return [];

  return await entities.Task.findMany({
    where: {
      userId,
      lensId: { in: lensIds },
      status: "TODAY",
      isDone: true,
      completedAt: { gte: startOfToday },
    },
    orderBy: { completedAt: "desc" },
    include: {
      tags: true,
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
      lens: { select: { id: true, name: true, color: true } },
    },
  });
}

// ----------------------------------------------------------------
// Read: the focus engine's top task (FEATURES.md F10 — MVP priority-first)
// ----------------------------------------------------------------
// Candidates = the shared actionable pool (tasks/activePool.ts): status TODAY
// or UPCOMING in the active Lens, not done, due null or ≤ now. The due-guard
// keeps snooze working: a snoozed task carries a future dueDate, so it stays
// off Next until its time arrives (then auto-resurfaces). Rank by priority
// (IMPORTANT > NORMAL > LOW), then size (smaller = quick win), then oldest.
// Returns the top 1, or null when nothing's on the table.
export async function getTopTaskData(
  entities: RankedPoolEntities,
  { userId, lensId }: { userId: string; lensId: string },
): Promise<RankedPoolResult> {
  const ranked = await fetchRankedActiveTasks(entities, { userId, lensId });
  return ranked[0] ?? null;
}

/** How many alternative tasks the Next chooser offers below the top task. */
export const TASK_ALTERNATIVES_LIMIT = 2;

// The Next screen's "Or choose another task" rail (next-alternatives): the
// same ranked pool as the top task, minus whatever is already on stage — the
// ranked #1 while browsing the recommendation, or the picked task while
// inspecting one (so the recommendation itself re-enters the list and stays
// available). Rows stay light: project/goal names only, no history hydration.
export async function getTaskAlternativesData(
  entities: RankedPoolEntities,
  {
    userId,
    lensId,
    excludeIds,
    limit = TASK_ALTERNATIVES_LIMIT,
  }: {
    userId: string;
    lensId: string;
    excludeIds?: string[];
    limit?: number;
  },
): Promise<{ [K in keyof RankedPoolRow]: RankedPoolRow[K] }[]> {
  const ranked = await fetchRankedActiveTasks(entities, { userId, lensId });
  const skip = new Set(excludeIds ?? []);
  return ranked
    .filter((task: { id: string }) => !skip.has(task.id))
    .slice(0, limit);
}

// Shared candidate fetch + sort behind getTopTaskData and
// getTaskAlternativesData — both surfaces must rank identically or the
// "alternative" order would contradict the recommendation above it.
interface RankedPoolEntities {
  Task: {
    findMany(args: {
      where: Prisma.TaskWhereInput;
      include: {
        project: { select: { id: true; name: true } };
        goal: { select: { id: true; name: true } };
      };
    }): Promise<RankedPoolRow[]>;
  };
}

async function fetchRankedActiveTasks(
  entities: RankedPoolEntities,
  { userId, lensId }: { userId: string; lensId: string },
) {
  const candidates = await entities.Task.findMany({
    where: activePoolWhere({ userId, lensId }),
    include: {
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
    },
  });
  rankTopTask(candidates);
  return candidates;
}

// ----------------------------------------------------------------
// Read: owned winner hydration (focus-goal-context spec)
// ----------------------------------------------------------------
// After `getTopTaskData` ranks candidates and returns the winner's id, both
// the Wasp `getTopTask` op and the CLI `/api/cli/now` route hydrate THAT ONE
// row with the Project→Goal + session + NOTE history context the Next/Focus
// surfaces and the CLI context need. The history relations are intentionally
// NOT attached to every candidate in `getTopTaskData` — only the owned winner
// pays for them.
//
// Scoped by both `userId` and `id`: no caller can hydrate another user's Task.
// If the ranked row vanishes between ranking and hydration (deleted, triaged
// away, done), return `null` — never stale data.
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

export async function hydrateTopTaskData(
  entities: Pick<TaskEntities, "Task">,
  { userId, id }: { userId: string; id: string },
): Promise<HydratedTaskResult> {
  // SAFETY: the include below attaches project/goal/sessions/updates, which
  // the delegate's un-narrowed Task return cannot express.
  return (await entities.Task.findFirst({
    where: { id, userId },
    include: {
      project: {
        select: {
          id: true,
          permalink: true,
          name: true,
          goal: { select: { id: true, name: true, description: true } },
        },
      },
      goal: {
        select: { id: true, permalink: true, name: true, description: true },
      },
      // Sessions ordered by start; select only the duration fields continuity
      // math needs (startedAt/endedAt). See app/taskContext.ts (FG03).
      sessions: {
        orderBy: { startedAt: "asc" },
        select: { startedAt: true, endedAt: true },
      },
      // NOTE updates newest-first; select the fields count + latest-note
      // display need. COMPLETED rows are filtered out here so the continuity
      // math never has to sort them. FG03 builds the presentation values.
      updates: {
        where: { kind: "NOTE" },
        orderBy: { createdAt: "desc" },
        select: { body: true, createdAt: true },
      },
      // Captured images (What Now renders a calm count chip in the meta row).
      attachments: { select: { id: true, filename: true, mimeType: true } },
    },
  })) as HydratedTask | null;
}

/**
 * The shared top-task comparator: an in-progress task (startedAt != null) is
 * ALWAYS #1 — "Now" survives navigation. Among the rest, rank by priority >
 * size > oldest. A committed-Today task outranks a bench (Upcoming) task at
 * equal priority/size. Exported so patRoutes / tests can rank the same pool
 * without duplicating the comparator.
 */
function rankTopTask<
  T extends {
    startedAt: Date | null;
    status: string;
    priority: Priority;
    size: Size;
    createdAt: Date;
  },
>(candidates: T[]): void {
  candidates.sort((a, b) => {
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
}

// ----------------------------------------------------------------
// Write: toggle a task's done state
// ----------------------------------------------------------------
// Sets completedAt when marking done, clears it when un-done.
//
// Outcome (task-fields spec §C): an optional `outcome?` may be written *only
// when marking done* (next === true). Un-completing never clears an existing
// outcome (toggling open shouldn't blow away a captured note). Empty/whitespace
// is normalised to null so "cleared" reads as absent downstream.
export async function toggleTaskDoneCore(
  entities: Pick<TaskEntities, "Task">,
  { userId, id, outcome }: { userId: string; id: string; outcome?: string },
) {
  const task = await entities.Task.findUnique({
    where: { id },
    select: { isDone: true, userId: true, isOnboardingSample: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }
  const next = !task.isDone;
  const data: Prisma.TaskUpdateInput = {
    isDone: next,
    completedAt: next ? new Date() : null,
    startedAt: null,
  };
  // Outcome is part of the completion act, not the un-completion act. A future
  // toggle-open preserves any captured note; re-completing with a new note is
  // last-write-wins.
  if (next && outcome !== undefined) {
    data.outcome = outcome.trim() || null;
  }
  return await entities.Task.update({
    where: { id },
    data,
  });
}

// ----------------------------------------------------------------
// Snooze — "Not now" flow (FEATURES.md F11)
// ----------------------------------------------------------------
// Presets: 1h / 3h / tomorrow / weekend → Task(status=UPCOMING, dueDate=then)
//          someday                                   → Task(status=SOMEDAY, dueDate=null)
// The task leaves the focus queue until the snooze expires (then it's a
// candidate again via Upcoming/Today rollover).
const SNOOZE_OFFSETS = {
  "1h": 3600_000,
  "3h": 3 * 3600_000,
} as const satisfies Record<"1h" | "3h", number>;

/**
 * Pure snooze math — given a preset and a `now`, return the resulting
 * `{ status, dueDate }`. No DB, no `Date.now()` — `now` is a parameter so this
 * is unit-testable and deterministic. Extracted from `snoozeTaskCore` so the
 * pure decision can be pinned without a mock.
 */
/** The Task patch a snooze preset resolves to. */
export interface SnoozeTarget {
  status: "UPCOMING" | "SOMEDAY";
  dueDate: Date | null;
}

export function snoozeTarget(
  preset: "1h" | "3h" | "tomorrow" | "weekend" | "someday",
  now: Date,
): SnoozeTarget {
  let status: "UPCOMING" | "SOMEDAY" = "UPCOMING";
  let dueDate: Date | null = new Date(now.getTime());
  switch (preset) {
    case "1h":
    case "3h":
      dueDate = new Date(now.getTime() + SNOOZE_OFFSETS[preset]);
      break;
    case "tomorrow": {
      const d = new Date(now.getTime());
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      dueDate = d;
      break;
    }
    case "weekend": {
      const d = new Date(now.getTime());
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
  return { status, dueDate };
}

export async function snoozeTaskCore(
  entities: Pick<TaskEntities, "Task">,
  {
    userId,
    id,
    preset,
  }: {
    userId: string;
    id: string;
    preset: "1h" | "3h" | "tomorrow" | "weekend" | "someday";
  },
) {
  const task = await entities.Task.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }

  const { status, dueDate } = snoozeTarget(preset, new Date());

  return await entities.Task.update({
    where: { id },
    data: { status, dueDate, startedAt: null },
    select: { id: true, status: true, dueDate: true },
  });
}

// ----------------------------------------------------------------
// Write: move a task between Today / Upcoming / Someday
// ----------------------------------------------------------------
// The "Not now" flow and promote/demote actions call this. (Today-cap
// enforcement happens client-side — see TodayPage.)
export async function updateTaskStatusCore(
  entities: Pick<TaskEntities, "Task">,
  {
    userId,
    id,
    status,
    dueDate,
  }: {
    userId: string;
    id: string;
    status: "TODAY" | "UPCOMING" | "SOMEDAY" | "WONT_DO";
    dueDate?: Date | null;
  },
) {
  const task = await entities.Task.findUnique({
    where: { id },
    select: { userId: true, dueDate: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }
  // Moving INTO Today must never leave a future dueDate behind: the Next
  // pool's due-guard treats any future date as "snoozed until its time", so a
  // snoozed/upcoming task moved to Today would sit in Today but stay
  // invisible on What Now until the stale date arrives. The move is the
  // user saying "now" — a future date contradicts it. Past dates stay
  // (overdue is truthful); other horizons pass dueDate through untouched.
  const effectiveDue =
    status === "TODAY" && !dueDate && task.dueDate && task.dueDate.getTime() > Date.now()
      ? null
      : (dueDate ?? undefined);
  return await entities.Task.update({
    where: { id },
    data: { status, dueDate: effectiveDue },
  });
}

// ----------------------------------------------------------------
// Start / Pause — the "Now" state (FEATURES.md F14: in-progress persists)
// ----------------------------------------------------------------
// Start → Now (startedAt = now). Only one task can be Now/Focus at a time, so
// starting one clears every other started task for the same user. Pause → back
// to Next (startedAt = null); the task remains a candidate but no longer holds
// the focus slot.
export async function startTaskCore(
  entities: Pick<TaskEntities, "Task" | "TaskSession">,
  {
    userId,
    id,
    focusSessionMinutes,
  }: { userId: string; id: string; focusSessionMinutes: 25 | 45 },
) {
  const task = await entities.Task.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }
  await entities.Task.updateMany({
    where: { userId, startedAt: { not: null } },
    data: { startedAt: null },
  });
  // Defensive close on any prior task's open session — the updateMany above
  // cleared the startedAt pointer on whatever was running, but its session row
  // is still open. Close it so the totals stay honest across task switches.
  await entities.TaskSession.updateMany({
    where: { userId, endedAt: null },
    data: { endedAt: new Date() },
  });
  const now = new Date();
  await entities.TaskSession.create({
    data: {
      taskId: id,
      userId,
      startedAt: now,
      plannedMinutes: focusSessionMinutes,
      completed: false,
    },
  });
  return await entities.Task.update({
    where: { id },
    data: { startedAt: now },
    select: { id: true, startedAt: true },
  });
}

/**
 * Close a countdown that reached zero without completing or defocusing its
 * Task. This is the key domain boundary: focus-session completion records a
 * successful Pomodoro; Task completion remains explicit and separate.
 */
export async function completeFocusSessionCore(
  entities: Pick<TaskEntities, "Task" | "TaskSession">,
  { userId, id }: { userId: string; id: string },
) {
  const task = await entities.Task.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }

  const session = await entities.TaskSession.findFirst({
    where: { taskId: id, userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, plannedMinutes: true },
  });
  if (!session) return { completed: false as const };

  const plannedMinutes = session.plannedMinutes === 45 ? 45 : 25;
  const now = new Date();
  const targetEnd = new Date(
    session.startedAt.getTime() + plannedMinutes * 60_000,
  );
  if (now.getTime() < targetEnd.getTime()) {
    throw new Error("Focus session is still running.");
  }

  await entities.TaskSession.update({
    where: { id: session.id },
    data: { endedAt: targetEnd, completed: true },
  });
  return { completed: true as const, endedAt: targetEnd };
}

export async function pauseTaskCore(
  entities: Pick<TaskEntities, "Task" | "TaskSession">,
  { userId, id }: { userId: string; id: string },
) {
  const task = await entities.Task.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }
  // Close this task's open session (if any) before clearing the pointer.
  // updateMany is idempotent — pausing an already-paused task is a no-op here.
  await entities.TaskSession.updateMany({
    where: { taskId: id, endedAt: null },
    data: { endedAt: new Date() },
  });
  return await entities.Task.update({
    where: { id },
    data: { startedAt: null },
    select: { id: true, startedAt: true },
  });
}
