import type { GetAppData } from "wasp/server/operations";

/**
 * App-shell bootstrap data — runs on every app load and lens switch.
 *
 * Returns the user's lenses (for the sidebar's Work/Me switch + query scoping)
 * and nav-badge counts. NOT onboarding — onboarding is a one-time signup flow
 * that lives in `src/onboarding/`. This is the per-load data the shell needs to
 * paint, plus the lazy daily Today→Upcoming rollover (which must run before the
 * count fetches so `todayCount` reflects the roll).
 *
 * Lived in `onboarding/operations.ts` historically (it shared Lens/User entity
 * needs with `ensureOnboarded`), but it's app-shell data, so it moved here.
 */

/**
 * Everything the app shell needs on first paint: lenses (for the sidebar's
 * Work/Me switch and to scope queries), plus counts for nav badges.
 *
 * Focus-nav counts (today/projects/goals) are scoped to the active Lens so the
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
    select: { lastTodayRolloverAt: true },
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

  const lenses = await context.entities.Lens.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true },
  });
  // Resolve the requested lens name to an id; fall back to the first lens so
  // counts are never empty just because the stored name was stale/missing.
  // If the user somehow has no lenses yet, lensWhere stays empty — but every
  // Task/Project/Goal requires a lensId, so the counts are 0 regardless.
  const activeLensId =
    (args?.lensName && lenses.find((l) => l.name === args.lensName)?.id) ||
    lenses[0]?.id;
  const lensWhere = activeLensId ? { lensId: activeLensId } : {};

  const [inboxCount, todayCount, projectCount, goalCount, todayByLensRows] =
    await Promise.all([
      context.entities.InboxItem.count({ where: { userId } }),
      // Focus-nav counts: lens-scoped to match the list pages.
      context.entities.Task.count({
        where: { userId, ...lensWhere, status: "TODAY", isDone: false },
      }),
      context.entities.Project.count({
        where: { userId, ...lensWhere, isDone: false },
      }),
      context.entities.Goal.count({
        where: { userId, ...lensWhere, isDone: false },
      }),
      // Per-lens Today counts for the lens switch's badges. This intentionally
      // matches the Today nav count semantics, not the broader Next candidate
      // pool, so the Lens badge answers "how many are committed today here?"
      context.entities.Task.groupBy({
        by: ["lensId"],
        where: { userId, status: "TODAY", isDone: false },
        _count: { _all: true },
      }),
    ]);

  const todayByLens: Record<string, number> = {};
  for (const row of todayByLensRows) {
    todayByLens[row.lensId] = row._count._all;
  }

  return {
    lenses,
    counts: {
      inbox: inboxCount,
      today: todayCount,
      projects: projectCount,
      goals: goalCount,
    },
    todayByLens,
  };
}) satisfies GetAppData<
  { lensName?: string | null },
  {
    lenses: { id: string; name: string; color: string | null }[];
    counts: { inbox: number; today: number; projects: number; goals: number };
    todayByLens: Record<string, number>;
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
