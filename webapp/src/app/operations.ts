import type {
  GetAppData,
  UpdateProfile,
  SaveTodayCap,
  SaveFocusSessionMinutes,
  SaveReviewPreferences,
} from "wasp/server/operations";
import { isEntitled } from "../billing/entitlements";

/**
 * App-shell bootstrap data — runs on every app load and lens switch.
 *
 * Returns the user's lenses (for the sidebar's Work/Me switch + query scoping)
 * and nav-badge counts. NOT onboarding — onboarding is a one-time signup flow
 * that lives in `src/onboarding/`. This is the per-load data the shell needs to
 * paint, plus the lazy daily Today→Upcoming rollover (which runs first, so the
 * Today count resets with the Today page while Upcoming's own badge gains the
 * rolled tasks).
 *
 * Lived in `onboarding/operations.ts` historically (it shared Lens/User entity
 * needs with `ensureOnboarded`), but it's app-shell data, so it moved here.
 */

/**
 * Everything the app shell needs on first paint: lenses (for the sidebar's
 * Work/Me switch and to scope queries), plus counts for nav badges.
 *
 * Focus-nav counts (Today/projects/goals) are scoped to the active Lens so the
 * badges match what each list page actually shows (TodayPage, ProjectsPage,
 * GoalsPage all query by `lensId`). Inbox is NOT lens-scoped — it's the global
 * pre-triage pool (InboxItem has no lens until triage assigns one).
 *
 * The active lens is client-side localStorage state, so the client passes its
 * name in. We resolve name→id server-side (the authoritative source) and fall
 * back to the first lens if the name is stale (e.g. still "Work" before lenses
 * load) — mirroring AppShell's own activeLens self-heal.
 */
export const getAppData = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const userId = context.user.id;

  // ---- Daily Today → Upcoming rollover (lazy, on app load) ----
  // WORKFLOW.md §2.3: Today is the committed-for-today list. At the start of a
  // new calendar day, incomplete TODAY tasks roll to UPCOMING so Today starts
  // fresh each morning — a deliberate re-commitment, not a backlog. Done tasks
  // are left alone (they keep their status + completedAt for the Logbook).
  // `startedAt` (the "Now" state) is preserved, so an interrupted focus task
  // still resurfaces as #1 on Next even though it's now UPCOMING.
  //
  // Triggered lazily here (not a cron job) so it runs in dev (SQLite-free) and
  // needs no new infra. Idempotent: once lastTodayRolloverAt is "today", the
  // day check short-circuits. Day boundary is the server's local calendar day
  // (same precedent as getDoneToday's midnight logic in tasks/operations.ts).
  // Note: we read lastTodayRolloverAt via an explicit User fetch rather than
  // context.user — Wasp's auth user record isn't guaranteed to carry custom
  // fields, but the User entity delegate always does.
  const userRow = await context.entities.User.findUnique({
    where: { id: userId },
    select: {
      lastTodayRolloverAt: true,
      todayCap: true,
      focusSessionMinutes: true,
      todayReviewEnabled: true,
      weekReviewEnabled: true,
      monthReviewEnabled: true,
      lastActiveAt: true,
    },
  });
  const lastRoll = userRow?.lastTodayRolloverAt ?? null;
  if (!lastRoll || isDifferentDay(lastRoll, new Date())) {
    await context.entities.Task.updateMany({
      where: { userId, status: "TODAY", isDone: false },
      data: { status: "UPCOMING" },
    });
    await context.entities.User.update({
      where: { id: userId },
      data: { lastTodayRolloverAt: new Date() },
    });
  }

  // ---- Activity tracking (admin dashboard "active" counts) ----
  // Throttled: only stamp if null or older than 15 min. Non-awaited + swallow —
  // an activity write must never break an app load. Mirrors the rollover's
  // lazy-write idiom. Powers admin stats' activeToday/7d/30d.
  const lastActive = userRow?.lastActiveAt ?? null;
  const stale = !lastActive || Date.now() - lastActive.getTime() > 15 * 60 * 1000;
  if (stale) {
    context.entities.User.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    }).catch(() => {
      // Swallow — activity tracking is best-effort.
    });
  }

  const lenses = await context.entities.Lens.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true, isIncluded: true, purpose: true },
  });
  // Resolve the requested lens id to a real lens; fall back to the first so
  // counts are never empty just because the stored id was stale/deleted/missing.
  // If the user has no lenses yet, lensWhere stays empty — but every
  // Task/Project/Goal requires a lensId, so the counts are 0 regardless.
  const activeLensId =
    (args?.lensId && lenses.find((l) => l.id === args.lensId)?.id) ||
    lenses[0]?.id;
  const lensWhere = activeLensId ? { lensId: activeLensId } : {};

  // Today is global (WORKFLOW.md §5.11) — its count spans every lens the user
  // can read, so the Today nav badge matches the merged Today page. Upcoming +
  // Someday stay lens-scoped (their pages still are). The two are computed by
  // SEPARATE queries on purpose: today's predicate (accessible lenses, no
  // active-lens filter) can't share the lens-scoped status rollup. Don't try
  // to re-merge them — the scopes disagree by design.
  const accessibleLensIds = lenses
    .filter((l) =>
      isEntitled(
        context.user?.plan ?? null,
        context.user?.planRenewsAt ?? null,
        context.user?.isAdmin,
        context.user?.manualAccessGrant,
      )
        ? true
        : l.isIncluded,
    )
    .map((l) => l.id);

  const [inboxCount, todayCount, planningStatusRows, projectCount, goalCount] =
    await Promise.all([
      context.entities.InboxItem.count({ where: { userId, status: "UNPROCESSED" } }),
      // Global Today count — accessible-lens set, status TODAY, not done.
      // Empty set (no accessible lenses) → 0; the `in: []` guard keeps Prisma
      // from returning everything by accident.
      accessibleLensIds.length === 0
        ? Promise.resolve(0)
        : context.entities.Task.count({
            where: {
              userId,
              lensId: { in: accessibleLensIds },
              status: "TODAY",
              isDone: false,
            },
          }),
      // Lens-scoped Upcoming + Someday rollup. (Today is intentionally absent
      // here — it's the global query above. Do NOT add it back: a sum of
      // global-today + lens-upcoming + lens-someday is a mixed-scope number
      // with no honest meaning.)
      context.entities.Task.groupBy({
        by: ["status"],
        where: { userId, ...lensWhere, isDone: false },
        _count: { _all: true },
      }),
      context.entities.Project.count({
        where: { userId, ...lensWhere, isDone: false },
      }),
      context.entities.Goal.count({
        where: { userId, ...lensWhere, isDone: false },
      }),
    ]);

  const planning = { upcoming: 0, someday: 0 };
  for (const row of planningStatusRows) {
    if (row.status === "UPCOMING") planning.upcoming = row._count._all;
    if (row.status === "SOMEDAY") planning.someday = row._count._all;
  }

  return {
    lenses,
    counts: {
      inbox: inboxCount,
      today: todayCount,
      ...planning,
      projects: projectCount,
      goals: goalCount,
    },
    // Today is global + user-tunable (WORKFLOW.md §5.11). Default 5; range
    // enforced in saveTodayCap. The shell passes it through so TodayPage and
    // PreferencesPage read one shared value.
    todayCap: userRow?.todayCap ?? 5,
    focusSessionMinutes: normalizeFocusSessionMinutes(
      userRow?.focusSessionMinutes,
    ),
    reviewPreferences: {
      today: userRow?.todayReviewEnabled ?? true,
      week: userRow?.weekReviewEnabled ?? true,
      month: userRow?.monthReviewEnabled ?? true,
    },
  };
}) satisfies GetAppData<
  { lensId?: string | null },
  {
    lenses: {
      id: string;
      name: string;
      color: string | null;
      isIncluded: boolean;
      purpose: string | null;
    }[];
    counts: {
      inbox: number;
      today: number;
      upcoming: number;
      someday: number;
      projects: number;
      goals: number;
    };
    todayCap: number;
    focusSessionMinutes: FocusSessionMinutes;
    reviewPreferences: { today: boolean; week: boolean; month: boolean };
  }
>;

/**
 * Calendar-day inequality — drives the lazy Today rollover. True when `a` and
 * `b` fall on different Y/M/D (in their own locale). Returns true when `a` is
 * null is handled by the caller (the `!lastRoll` check), so this assumes two
 * valid dates.
 */
function isDifferentDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() !== b.getFullYear() ||
    a.getMonth() !== b.getMonth() ||
    a.getDate() !== b.getDate()
  );
}

function cleanName(value: string | undefined, fieldName: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  if (trimmed.length > 120) {
    throw new Error(`${fieldName} must be 120 characters or fewer.`);
  }
  return trimmed;
}

/**
 * Account settings profile update. Auth email lives in Wasp AuthIdentity, so
 * this action only edits app-owned User profile fields.
 */
export const updateProfile = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const fullName = cleanName(args.fullName, "Name");
  const preferredName = cleanName(args.preferredName, "Call me");
  const firstName = fullName.split(/\s+/)[0] ?? fullName;

  const user = await context.entities.User.update({
    where: { id: context.user.id },
    data: { fullName, firstName, preferredName },
    select: { fullName: true, firstName: true },
  });

  return { ...user, preferredName };
}) satisfies UpdateProfile<
  { fullName: string; preferredName: string },
  { fullName: string; firstName: string; preferredName: string }
>;

/**
 * Today cap preference — the committed-for-today ceiling, global across lenses
 * (WORKFLOW.md §5.11). Range 3–12, integer; default 5 (set on the column).
 * Mirrors saveDailyReminder's shape (validate → update → { ok }). The cap is
 * enforced client-side in TodayPage against the value getAppData returns; the
 * server only stores the preference.
 */
export const saveTodayCap = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  if (
    !Number.isInteger(args.todayCap) ||
    args.todayCap < TODAY_CAP_MIN ||
    args.todayCap > TODAY_CAP_MAX
  ) {
    throw new Error(`Today cap must be a whole number between ${TODAY_CAP_MIN} and ${TODAY_CAP_MAX}.`);
  }
  await context.entities.User.update({
    where: { id: context.user.id },
    data: { todayCap: args.todayCap },
  });
  return { ok: true as const };
}) satisfies SaveTodayCap<{ todayCap: number }, { ok: true }>;

/** Today-cap bounds — shared with the client via re-export from app/operations. */
export const TODAY_CAP_DEFAULT = 5;
export const TODAY_CAP_MIN = 3;
export const TODAY_CAP_MAX = 12;

export const FOCUS_SESSION_OPTIONS = [25, 45] as const;
export type FocusSessionMinutes = (typeof FOCUS_SESSION_OPTIONS)[number];
export const FOCUS_SESSION_DEFAULT: FocusSessionMinutes = 25;

export function normalizeFocusSessionMinutes(
  value: number | null | undefined,
): FocusSessionMinutes {
  return value === 45 ? 45 : FOCUS_SESSION_DEFAULT;
}

/** Store the closed-set Pomodoro duration used when opening new TaskSessions. */
export const saveFocusSessionMinutes = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  if (!FOCUS_SESSION_OPTIONS.includes(args.minutes as FocusSessionMinutes)) {
    throw new Error("Focus session must be 25 or 45 minutes.");
  }
  await context.entities.User.update({
    where: { id: context.user.id },
    data: { focusSessionMinutes: args.minutes },
  });
  return { ok: true as const };
}) satisfies SaveFocusSessionMinutes<
  { minutes: FocusSessionMinutes },
  { ok: true }
>;

/** Optional cadence visibility. Saving never touches Review or work records. */
export const saveReviewPreferences = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  if (
    typeof args.today !== "boolean" ||
    typeof args.week !== "boolean" ||
    typeof args.month !== "boolean"
  ) {
    throw new Error("Review preferences must be true or false.");
  }
  await context.entities.User.update({
    where: { id: context.user.id },
    data: {
      todayReviewEnabled: args.today,
      weekReviewEnabled: args.week,
      monthReviewEnabled: args.month,
    },
  });
  return { ok: true as const };
}) satisfies SaveReviewPreferences<
  { today: boolean; week: boolean; month: boolean },
  { ok: true }
>;
