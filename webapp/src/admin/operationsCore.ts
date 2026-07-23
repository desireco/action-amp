/**
 * Pure admin-stats cores — shared DB layer for the browser Wasp query
 * (`./operations.ts`) and the admin-cli `/api/cli/admin/*` PAT routes.
 *
 * Pattern (mirrors `feedback/operationsCore.ts`): every core takes `entities`
 * as its first arg (any Prisma-client-shaped object) and plain args, does the
 * DB work, returns plain serializable data. **No `wasp/server` import lives
 * here** (Wasp's detectServerImports plugin blocks it under `src/`).
 *
 * All counts are global (across all users) — the admin boundary is enforced by
 * the callers (Wasp op gates on `context.user.isAdmin`; PAT route gates on
 * `requireAdmin`). No row-level user data beyond feedback submitter is surfaced.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export type FeedbackStatusCounts = Record<FeedbackStatus, number>;

export type AdminStats = {
  users: {
    total: number;
    signedUpToday: number;
    signedUp7d: number;
    signedUp30d: number;
    activeToday: number;
    active7d: number;
    active30d: number;
  };
  tasks: {
    created7d: number;
    completed7d: number;
    total: number;
  };
  feedback: {
    byStatus: FeedbackStatusCounts;
    total: number;
  };
};

/** Fields mirrored from feedback/operationsCore.ts FEEDBACK_SELECT. */
export type FeedbackRow = {
  id: string;
  shortId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  message: string;
  status: FeedbackStatus;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  route: string | null;
  section: string | null;
  lensId: string | null;
  lensName: string | null;
  lensColor: string | null;
  userAgent: string | null;
  viewport: string | null;
  timezone: string | null;
};

const FEEDBACK_SELECT = {
  id: true,
  shortId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  message: true,
  status: true,
  userId: true,
  userName: true,
  userEmail: true,
  route: true,
  section: true,
  lensId: true,
  lensName: true,
  lensColor: true,
  userAgent: true,
  viewport: true,
  timezone: true,
};

/** Compute the 3 time windows once per call (UTC, consistent within a call). */
function windows() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // Start of "today" = midnight UTC of the current day.
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return {
    today,
    d7: new Date(now - 7 * dayMs),
    d30: new Date(now - 30 * dayMs),
  };
}

export async function getAdminStatsCore(
  entities: Entities,
): Promise<AdminStats> {
  const { today, d7, d30 } = windows();

  const [
    total,
    signedUpToday,
    signedUp7d,
    signedUp30d,
    activeToday,
    active7d,
    active30d,
    tasksCreated7d,
    tasksCompleted7d,
    tasksTotal,
    feedbackTotal,
    feedbackByStatusRaw,
  ] = await Promise.all([
    entities.User.count(),
    entities.User.count({ where: { createdAt: { gte: today } } }),
    entities.User.count({ where: { createdAt: { gte: d7 } } }),
    entities.User.count({ where: { createdAt: { gte: d30 } } }),
    entities.User.count({ where: { lastActiveAt: { gte: today } } }),
    entities.User.count({ where: { lastActiveAt: { gte: d7 } } }),
    entities.User.count({ where: { lastActiveAt: { gte: d30 } } }),
    entities.Task.count({ where: { createdAt: { gte: d7 } } }),
    entities.Task.count({ where: { isDone: true, completedAt: { gte: d7 } } }),
    entities.Task.count(),
    // Soft-deleted feedback is excluded from both the total + the byStatus
    // breakdown — those are triage signals, and a deleted row isn't being
    // triaged anymore.
    entities.Feedback.count({ where: { deletedAt: null } }),
    entities.Feedback.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const byStatus: FeedbackStatusCounts = {
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    CLOSED: 0,
  };
  for (const row of feedbackByStatusRaw as { status: FeedbackStatus; _count: { _all: number } }[]) {
    if (row.status in byStatus) {
      byStatus[row.status] = row._count._all;
    }
  }

  return {
    users: {
      total,
      signedUpToday,
      signedUp7d,
      signedUp30d,
      activeToday,
      active7d,
      active30d,
    },
    tasks: { created7d: tasksCreated7d, completed7d: tasksCompleted7d, total: tasksTotal },
    feedback: { byStatus, total: feedbackTotal },
  };
}

// ----------------------------------------------------------------
// Recent feedback (cursor paged) — admin dashboard "recent" list
// ----------------------------------------------------------------
// Newest first (createdAt desc, id desc). afterId = last item's id on the
// current page. The core fetches limit+1 to detect hasNext, then trims.
// limit is bounded (1–50) by the caller. Mirrors the FEEDBACK_SELECT shape.
export async function getRecentFeedbackCore(
  entities: Entities,
  { afterId, limit }: { afterId?: string | null; limit: number },
): Promise<{ items: FeedbackRow[]; hasNext: boolean }> {
  const fetchLimit = limit + 1;
  const rows = (await entities.Feedback.findMany({
    where: { deletedAt: null },
    ...(afterId
      ? {
          skip: 1,
          cursor: { id: afterId },
        }
      : {}),
    take: fetchLimit,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: FEEDBACK_SELECT,
  })) as FeedbackRow[];

  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  return { items, hasNext };
}
