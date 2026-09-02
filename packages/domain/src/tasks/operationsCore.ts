/**
 * Pure task-operation cores — the shared DB layer for the API layer's ops and
 * future `/api/cli/*` PAT routes.
 *
 * Ported from webapp/src/tasks/operationsCore.ts (F4b — the platform-switch
 * pattern-setter). Pattern (mirrors `billing/entitlements.ts`): every core
 * takes `entities` as its first arg (the Prisma-client-shaped seam object —
 * `createEntities(createDb(url))` at the API layer, or a Vitest mock in
 * tests) plus plain args, does the DB work, and returns data. **No server
 * framework import lives here.**
 *
 * The API ops (F8b) become thin wrappers: auth check (`if (!user) throw`) +
 * entitlement guards (`assertLensAllowed`) + delegate here. Tenancy + the
 * entitlement decision stay in the wrapper; the pure DB shape stays here.
 *
 * Exported ranks (`PRIORITY_RANK`, `SIZE_RANK`) are re-exported by the ops
 * layer for back-compat — the CLI's `auth/patRoutes.ts` already imports them
 * from there.
 *
 * Differences from the webapp original are type-level only: the Prisma
 * client's model/arg types became the seam's (`../db`), and the row
 * interfaces the seam's delegate overloads also reference (TaskListRow,
 * TaskLensListRow, TaskDetailRow, RankedPoolRow, HydratedTask) are defined
 * there and re-exported here — one definition, unchanged shapes.
 */

import type {
  BatchPayload,
  Priority,
  RankedPoolInclude,
  RankedPoolRow,
  Size,
  Tag,
  Task,
  TaskCountArgs,
  TaskDetailInclude,
  TaskFindFirstArgs,
  TaskFindManyArgs,
  TaskFindUniqueArgs,
  TaskLensListInclude,
  TaskLensListRow,
  TaskListInclude,
  TaskListRow,
  TaskOrderByInput,
  TaskSessionCreateArgs,
  TaskSessionFindFirstArgs,
  TaskSessionUpdateArgs,
  TaskSessionUpdateManyArgs,
  TaskSession,
  TaskUpdateArgs,
  TaskUpdateInput,
  TaskUpdateManyArgs,
  TaskWhereInput,
  TaskDetailRow,
  HydratedTask,
} from "../db/index.js";
import {
  resolveAccessibleLenses,
  type EntitlementUser,
  type LensListLookup,
} from "../billing/entitlements.js";
import { activePoolWhere } from "./activePool.js";
import {
  Temporal,
  instantFrom,
  instantToDate,
  instantToPlainDate,
  plainDateToDb,
  systemClock,
} from "../shared/time/temporal.js";

// The row interfaces the seam's delegate overloads reference — same shapes
// the original declared here. (TaskDetailRow/HydratedTask/RankedPoolRow/
// TaskListRow/TaskLensListRow live in the seam module.)
export type {
  TaskListRow,
  TaskLensListRow,
  TaskDetailRow,
  RankedPoolRow,
  HydratedTask,
};

/**
 * The entities slice these cores touch, typed with the seam's arg types
 * (named, not a loose map). Generic-arg methods return FULL rows; callers
 * that pass a `select` may only read the fields their select carried.
 * Callers pass the API layer's seam entities or a Vitest mock — all satisfy
 * this slice structurally.
 */

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

/** Done-today rows: list row + lens + tags. */
export interface DoneTodayRow extends TaskLensListRow {
  tags: Tag[];
}

/** The delegate slices for include-carrying reads — literal-arg methods so
 *  the typed rows match exactly what each include selects (per-function slices
 *  rather than overloads, which Prisma's branded arg types reject). The seam's
 *  `Entities` (`../db`) satisfies every one of these; see
 *  src/db/seam.checks.ts for the compile-time lock. */
interface TaskListEntities {
  Task: {
    findMany(args: {
      where: TaskWhereInput;
      orderBy?: TaskOrderByInput;
      include: TaskListInclude;
    }): Promise<TaskListRow[]>;
  };
}

interface TaskLensListEntities {
  Task: {
    findMany(args: {
      where: TaskWhereInput;
      orderBy?: TaskOrderByInput;
      include: TaskLensListInclude;
    }): Promise<TaskLensListRow[]>;
  };
}

interface TaskDetailEntities {
  Task: {
    findFirst(args: {
      where: TaskWhereInput;
      include: TaskDetailInclude;
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
interface DoneTodayEntities {
  Task: {
    findMany(args: {
      where: TaskWhereInput;
      orderBy: { completedAt: "desc" };
      include: TaskLensListInclude;
    }): Promise<DoneTodayRow[]>;
  };
}

interface TaskEntities {
  Task: {
    findUnique(args: TaskFindUniqueArgs): Promise<Task | null>;
    findFirst(args: TaskFindFirstArgs): Promise<Task | null>;
    findMany(args: TaskFindManyArgs): Promise<Task[]>;
    update(args: TaskUpdateArgs): Promise<Task>;
    updateMany(args: TaskUpdateManyArgs): Promise<BatchPayload>;
    count(args: TaskCountArgs): Promise<number>;
  };
  TaskSession: {
    findFirst(
      args: TaskSessionFindFirstArgs,
    ): Promise<TaskSession | null>;
    create(args: TaskSessionCreateArgs): Promise<TaskSession>;
    update(args: TaskSessionUpdateArgs): Promise<TaskSession>;
    updateMany(
      args: TaskSessionUpdateManyArgs,
    ): Promise<BatchPayload>;
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
// Used by Today (status=TODAY, not done), Upcoming (status=UPCOMING or scheduledDate
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
  const where: TaskWhereInput = {
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
    now = instantToDate(Temporal.Now.instant()),
    timeZone = "UTC",
  }: {
    user: Parameters<typeof resolveAccessibleLenses>[1];
    userId: string;
    now?: Date;
    timeZone?: string;
  },
): Promise<TaskLensListResult> {
  const accessible = await resolveAccessibleLenses(
    { Lens: entities.Lens },
    user,
    userId,
  );
  const lensIds = accessible.map((lens) => lens.id);
  if (lensIds.length === 0) return [];

  const today = instantToPlainDate(instantFrom(now), timeZone);
  const weekStart = today.subtract({ days: today.dayOfWeek - 1 });
  const nextWeekStart = weekStart.add({ days: 7 });

  return await entities.Task.findMany({
    where: {
      userId,
      lensId: { in: lensIds },
      status: { in: ["TODAY", "UPCOMING"] },
      isDone: false,
      // In the pool: committed-now tasks OR anything dated before the week
      // ends. A Today commit is due TODAY — today is inside this week — even
      // when it carries no scheduledDate (the triage/move paths null it), so it must
      // count and render in the Today bucket; without the status arm, the
      // Today badge could read 1 while This week read 0 for the same task.
      // The bare `lt nextWeekStart` (not gte weekStart) also admits overdue
      // rows — an open task that slipped past its date is still due, and the
      // page buckets it under Today rather than hiding it.
      OR: [
        { status: "TODAY" },
        { scheduledDate: { lt: plainDateToDb(nextWeekStart) } },
      ],
    },
    orderBy: [
      { scheduledDate: "asc" },
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
  {
    userId,
    lensIds,
    timeZone = "UTC",
  }: { userId: string; lensIds: string[]; timeZone?: string },
): Promise<DoneTodayResult> {
  // Local-midnight boundary: completedAt is stamped server-side on toggle; we
  // compare against the start of "today" in the server's locale. Day-granular
  // is the right resolution for a "done today" section.
  // Status scoping: only tasks committed to Today (status=TODAY) belong here.
  // Completion (completeTaskFromFocus) sets isDone + completedAt but leaves
  // status untouched, so an Upcoming task finished via focus stays
  // status=UPCOMING and is correctly excluded.
  const startOfToday = instantToDate(
    Temporal.Now.plainDateISO(timeZone).toZonedDateTime(timeZone).toInstant(),
  );

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
// keeps snooze working: a snoozed task carries a future snoozedUntil, so it stays
// off Next until its time arrives (then auto-resurfaces). Rank by priority
// (IMPORTANT > NORMAL > LOW), then size (smaller = quick win), then oldest.
// Returns the top 1, or null when nothing's on the table.
export async function getTopTaskData(
  entities: RankedPoolEntities,
  {
    userId,
    lensId,
    timeZone = "UTC",
  }: { userId: string; lensId: string; timeZone?: string },
): Promise<RankedPoolResult> {
  const ranked = await fetchRankedActiveTasks(entities, {
    userId,
    lensId,
    timeZone,
  });
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
    timeZone = "UTC",
  }: {
    userId: string;
    lensId: string;
    excludeIds?: string[];
    limit?: number;
    timeZone?: string;
  },
): Promise<{ [K in keyof RankedPoolRow]: RankedPoolRow[K] }[]> {
  const ranked = await fetchRankedActiveTasks(entities, {
    userId,
    lensId,
    timeZone,
  });
  const skip = new Set(excludeIds ?? []);
  return ranked
    .filter((task: { id: string }) => !skip.has(task.id))
    .slice(0, limit);
}

// ----------------------------------------------------------------
// Read: per-lens actionable counts for the Next empty state (do-empty-lens-hints)
// ----------------------------------------------------------------
// "Nothing on the table" is only true for THIS lens. One count per OTHER
// accessible lens, using the same activePoolWhere the Next card ranks from —
// the hint numbers can never disagree with what the chooser would show after
// the switch. Lenses with nothing actionable are omitted (whitespace, not
// zeroes); locked (FREE-plan) lenses never appear because accessibility is
// resolved first.
// Mapped type (not an interface): Wasp op outputs must be index-signature-
// assignable for SuperJSON serialization — see TaskDetailResult's note.
export type OtherLensCount = {
  [K in "lensId" | "lensName" | "count"]: K extends "count"
    ? number
    : string;
};

export async function getOtherLensCountsData(
  entities: Pick<TaskEntities, "Task"> & LensListLookup,
  {
    user,
    userId,
    excludeLensId,
    timeZone,
  }: {
    user: EntitlementUser | null;
    userId: string;
    excludeLensId: string;
    timeZone: string;
  },
): Promise<OtherLensCount[]> {
  const lenses = (await resolveAccessibleLenses(entities, user, userId)).filter(
    (lens) => lens.id !== excludeLensId,
  );
  const counts = await Promise.all(
    lenses.map((lens) =>
      entities.Task.count({
        where: activePoolWhere({ userId, lensId: lens.id, timeZone }),
      }),
    ),
  );
  return lenses
    .map((lens, i) => ({ lensId: lens.id, lensName: lens.name, count: counts[i] }))
    .filter((row) => row.count > 0);
}

// Shared candidate fetch + sort behind getTopTaskData and
// getTaskAlternativesData — both surfaces must rank identically or the
// "alternative" order would contradict the recommendation above it.
interface RankedPoolEntities {
  Task: {
    findMany(args: {
      where: TaskWhereInput;
      include: RankedPoolInclude;
    }): Promise<RankedPoolRow[]>;
  };
}

async function fetchRankedActiveTasks(
  entities: RankedPoolEntities,
  {
    userId,
    lensId,
    timeZone,
  }: { userId: string; lensId: string; timeZone: string },
) {
  const candidates = await entities.Task.findMany({
    where: activePoolWhere({ userId, lensId, timeZone }),
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
// (`HydratedTask`, the include payload's row type, lives in the seam module
// and is re-exported from this file's type exports above.)

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
  const data: TaskUpdateInput = {
    isDone: next,
    completedAt: next ? instantToDate(systemClock.instant()) : null,
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
// Presets resolve to an exact availability instant in the user's time zone.
// The task leaves the focus queue until the snooze expires (then it's a
// candidate again via Upcoming/Today rollover).
/**
 * Pure snooze math — given a preset and a `now`, return the resulting
 * `{ status, snoozedUntil }`. `now` is a parameter so this
 * is unit-testable and deterministic. Extracted from `snoozeTaskCore` so the
 * pure decision can be pinned without a mock.
 */
/** The Task patch a snooze preset resolves to. */
export interface SnoozeTarget {
  status: "UPCOMING" | "SOMEDAY";
  snoozedUntil: Date | null;
}

export function snoozeTarget(
  preset: "1h" | "3h" | "tomorrow" | "weekend" | "someday",
  now: Date,
  timeZone = "UTC",
): SnoozeTarget {
  let status: "UPCOMING" | "SOMEDAY" = "UPCOMING";
  const nowInstant = instantFrom(now);
  let snoozedUntil: Date | null;
  switch (preset) {
    case "1h":
      snoozedUntil = instantToDate(nowInstant.add({ hours: 1 }));
      break;
    case "3h":
      snoozedUntil = instantToDate(nowInstant.add({ hours: 3 }));
      break;
    case "tomorrow": {
      const date = instantToPlainDate(nowInstant, timeZone).add({ days: 1 });
      snoozedUntil = instantToDate(
        date
          .toZonedDateTime({
            timeZone,
            plainTime: Temporal.PlainTime.from("09:00"),
          })
          .toInstant(),
      );
      break;
    }
    case "weekend": {
      const today = instantToPlainDate(nowInstant, timeZone);
      const days = (6 - today.dayOfWeek + 7) % 7 || 7;
      snoozedUntil = instantToDate(
        today
          .add({ days })
          .toZonedDateTime({
            timeZone,
            plainTime: Temporal.PlainTime.from("09:00"),
          })
          .toInstant(),
      );
      break;
    }
    case "someday":
      status = "SOMEDAY";
      snoozedUntil = null;
      break;
  }
  return { status, snoozedUntil };
}

export async function snoozeTaskCore(
  entities: Pick<TaskEntities, "Task">,
  {
    userId,
    id,
    preset,
    timeZone = "UTC",
  }: {
    userId: string;
    id: string;
    preset: "1h" | "3h" | "tomorrow" | "weekend" | "someday";
    timeZone?: string;
  },
) {
  const task = await entities.Task.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }

  const { status, snoozedUntil } = snoozeTarget(
    preset,
    instantToDate(Temporal.Now.instant()),
    timeZone,
  );

  const data: TaskUpdateInput = {
    status,
    snoozedUntil,
    startedAt: null,
  };
  if (status === "SOMEDAY") data.scheduledDate = null;

  return await entities.Task.update({
    where: { id },
    data,
    select: { id: true, status: true, scheduledDate: true, snoozedUntil: true },
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
    scheduledDate,
    snoozedUntil,
  }: {
    userId: string;
    id: string;
    status: "TODAY" | "UPCOMING" | "SOMEDAY" | "WONT_DO";
    scheduledDate?: Date | null;
    snoozedUntil?: Date | null;
    // Kept for signature stability — the CLI passes it; the date-drop rule
    // below is calendar-day independent, so it is not read (nor destructured).
    timeZone?: string;
  },
) {
  const task = await entities.Task.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!task || task.userId !== userId) {
    throw new Error("Task not found.");
  }
  // One field may say "today": status is the commitment, scheduledDate is
  // bench scheduling. Committing (TODAY) or parking (SOMEDAY) always drops
  // the date — a TODAY row carrying scheduledDate=today rendered "today"
  // twice in the UI, and a SOMEDAY row must never keep a stale deadline.
  const effectiveSchedule =
    status === "TODAY" || status === "SOMEDAY"
      ? null
      : scheduledDate;
  const effectiveSnooze =
    status === "TODAY" || status === "SOMEDAY" ? null : snoozedUntil;
  return await entities.Task.update({
    where: { id },
    data: {
      status,
      scheduledDate: effectiveSchedule,
      snoozedUntil: effectiveSnooze,
    },
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
    data: { endedAt: instantToDate(systemClock.instant()) },
  });
  const now = instantToDate(systemClock.instant());
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
  const now = systemClock.instant();
  const targetEnd = instantFrom(session.startedAt).add(
    Temporal.Duration.from({ minutes: plannedMinutes }),
  );
  if (Temporal.Instant.compare(now, targetEnd) < 0) {
    throw new Error("Focus session is still running.");
  }

  await entities.TaskSession.update({
    where: { id: session.id },
    data: { endedAt: instantToDate(targetEnd), completed: true },
  });
  return { completed: true as const, endedAt: instantToDate(targetEnd) };
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
    data: { endedAt: instantToDate(systemClock.instant()) },
  });
  return await entities.Task.update({
    where: { id },
    data: { startedAt: null },
    select: { id: true, startedAt: true },
  });
}
