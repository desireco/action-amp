/**
 * S4 app-shell bootstrap core — ported from webapp/src/app/operations.ts
 * `getAppData` (the lazy daily rollover + counts + prefs), as a pure
 * `(entities, args)` function.
 *
 * Deviations from the webapp wrapper, both surface-driven:
 * - counts carry `today` (global, accessible lenses) + `upcoming`/`someday`
 *   (active lens) via `Task.count`, plus the Planning-structure trio the
 *   sidebar badges read: `projects`/`goals`/`rituals`, each scoped to the
 *   active lens and matching the page's primary list (active projects =
 *   not done + not archived; active goals; unarchived rituals incl. paused).
 * - the upcoming/someday rollup uses two counts instead of `groupBy` (no
 *   groupBy on the seam's Task delegate; same numbers, same scope rule).
 */

import { instantFrom, instantToDate, instantToPlainDate, Temporal } from "../shared/time/temporal.js";
import { resolveAccessibleLenses, type EntitlementUser } from "../billing/entitlements.js";
import type { LensFindManyArgs } from "../db/index.js";
import type { TaskExtrasEntities } from "./extrasEntities.js";

/** The 15-min activity-stamp throttle window (admin stats feed). */
const LAST_ACTIVE_THROTTLE_MS = 15 * 60 * 1000;

/** `User.focusSessionMinutes` is a closed set: 25 (default) or 45. */
export function normalizeFocusSessionMinutes(value: number | null | undefined): 25 | 45 {
  return value === 45 ? 45 : 25;
}

export interface AppDataEntities {
  Task: {
    count(args: { where: {
      userId: string;
      lensId?: { in: string[] } | string;
      status?: "TODAY" | "UPCOMING" | "SOMEDAY";
      isDone?: boolean;
    } }): Promise<number>;
    updateMany(args: {
      where: { userId: string; status: "TODAY"; isDone: false };
      data: { status: "UPCOMING" };
    }): Promise<{ count: number }>;
  };
  Lens: {
    findMany(args: LensFindManyArgs): Promise<
      Array<{ id: string; name: string; color: string | null; isIncluded: boolean; purpose: string | null }>
    >;
  };
  Project: {
    count(args: {
      where: { userId: string; lensId: string; isDone: boolean; archivedAt: null };
    }): Promise<number>;
  };
  Goal: {
    count(args: { where: { userId: string; lensId: string; isDone: boolean } }): Promise<number>;
  };
  Ritual: {
    count(args: {
      where: { userId: string; lensId: string; includePaused: boolean };
    }): Promise<number>;
  };
  User: TaskExtrasEntities["User"];
}

export interface AppDataResult {
  lenses: Array<{
    id: string;
    name: string;
    color: string | null;
    isIncluded: boolean;
    purpose: string | null;
  }>;
  counts: {
    today: number;
    upcoming: number;
    someday: number;
    projects: number;
    goals: number;
    rituals: number;
  };
  todayCap: number;
  focusSessionMinutes: 25 | 45;
  timeZone: string;
}

export async function getAppDataCore(
  entities: AppDataEntities,
  {
    user,
    userId,
    lensId,
  }: { user: EntitlementUser | null; userId: string; lensId?: string | null },
): Promise<AppDataResult> {
  // ---- Daily Today → Upcoming rollover (lazy, on app load) ----
  // WORKFLOW.md §2.3: incomplete TODAY tasks roll to UPCOMING at the start of
  // a new calendar day so Today starts fresh — a deliberate re-commitment.
  // Done tasks are left alone (status + completedAt feed the Logbook);
  // `startedAt` is preserved so an interrupted Now task resurfaces #1.
  const userRow = await entities.User.findUnique({ where: { id: userId } });
  const now = Temporal.Now.instant();
  const timeZone = userRow?.timeZone ?? "UTC";
  const lastRoll = userRow?.lastTodayRolloverAt ?? null;
  const today = instantToPlainDate(now, timeZone);
  const lastRollDate = lastRoll
    ? instantToPlainDate(instantFrom(lastRoll), timeZone)
    : null;
  // Same calendar day ⇔ a zero-day gap between the last roll and today
  // (the seam's minimal Temporal surface has no `equals`; `until` is exact).
  const sameDay =
    lastRollDate !== null && lastRollDate.until(today, { largestUnit: "days" }).days === 0;
  if (!sameDay) {
    await entities.Task.updateMany({
      where: { userId, status: "TODAY", isDone: false },
      data: { status: "UPCOMING" },
    });
    await entities.User.updateMany({
      where: { id: userId },
      data: { lastTodayRolloverAt: instantToDate(now) },
    });
  }

  // ---- Activity tracking (throttled, best-effort in the wrapper) ----
  const lastActive = userRow?.lastActiveAt ?? null;
  const stale =
    !lastActive ||
    now.epochMilliseconds - instantFrom(lastActive).epochMilliseconds >
      LAST_ACTIVE_THROTTLE_MS;

  const lenses = await entities.Lens.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  // Resolve the requested lens id to a real lens; fall back to the first so
  // counts are never empty just because the stored id was stale/deleted.
  const activeLensId =
    (lensId && lenses.find((l) => l.id === lensId)?.id) || lenses[0]?.id;

  // Today is global (WORKFLOW.md §5.11) — accessible-lens set; Upcoming +
  // Someday stay lens-scoped (their pages still are).
  const accessible = await resolveAccessibleLenses(
    { Lens: entities.Lens },
    user,
    userId,
  );
  const accessibleLensIds = accessible.map((l) => l.id);

  const todayCount =
    accessibleLensIds.length === 0
      ? 0
      : await entities.Task.count({
          where: {
            userId,
            lensId: { in: accessibleLensIds },
            status: "TODAY",
            isDone: false,
          },
        });
  const upcomingCount = activeLensId
    ? await entities.Task.count({
        where: { userId, lensId: activeLensId, status: "UPCOMING", isDone: false },
      })
    : 0;
  const somedayCount = activeLensId
    ? await entities.Task.count({
        where: { userId, lensId: activeLensId, status: "SOMEDAY", isDone: false },
      })
    : 0;

  // The Planning-structure badges follow the active lens, each matching the
  // page's primary list: Projects counts its active cards (not done, not
  // archived — completed/archived are the page's collapsed sections), Goals
  // its active list, Rituals its unarchived Planning list (paused included).
  const [projectsCount, goalsCount, ritualsCount] = activeLensId
    ? await Promise.all([
        entities.Project.count({
          where: { userId, lensId: activeLensId, isDone: false, archivedAt: null },
        }),
        entities.Goal.count({ where: { userId, lensId: activeLensId, isDone: false } }),
        entities.Ritual.count({
          where: { userId, lensId: activeLensId, includePaused: true },
        }),
      ])
    : [0, 0, 0];

  if (stale) {
    // Best-effort by contract; a failure must not break an app load.
    try {
      await entities.User.updateMany({
        where: { id: userId },
        data: { lastActiveAt: instantToDate(now) },
      });
    } catch {
      // Swallow — activity tracking is best-effort.
    }
  }

  return {
    lenses,
    counts: {
      today: todayCount,
      upcoming: upcomingCount,
      someday: somedayCount,
      projects: projectsCount,
      goals: goalsCount,
      rituals: ritualsCount,
    },
    todayCap: userRow?.todayCap ?? 5,
    focusSessionMinutes: normalizeFocusSessionMinutes(userRow?.focusSessionMinutes),
    timeZone,
  };
}
