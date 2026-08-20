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

/**
 * The read-only Prisma-delegate slice these stats cores call (named, not a
 * loose map). Payment/AnalyticsEvent/AnalyticsSession are optional because
 * some Wasp op entity lists omit them — the stat degrades to 0 when absent.
 */
interface AdminStatsEntities {
  User: { count(args?: { where?: Prisma.UserWhereInput }): Promise<number> };
  Task: { count(args?: { where?: Prisma.TaskWhereInput }): Promise<number> };
  Payment?: {
    count(args?: { where?: Prisma.PaymentWhereInput }): Promise<number>;
  };
  AnalyticsEvent?: {
    count(args?: { where?: Prisma.AnalyticsEventWhereInput }): Promise<number>;
  };
  AnalyticsSession?: FunnelEntities["AnalyticsSession"];
  Feedback: {
    count(args?: { where?: Prisma.FeedbackWhereInput }): Promise<number>;
    groupBy(args: {
      by: ["status"];
      where?: { deletedAt?: null };
      _count: { _all: true };
    }): Promise<Array<{ status: string; _count: { _all: number } }>>;
    findMany(args: Prisma.FeedbackFindManyArgs): Promise<FeedbackRow[]>;
  };
}

/** The slice getRecentFeedbackCore uses (its Wasp op injects Feedback only). */
type FeedbackLookupEntities = {
  Feedback: {
    findMany(args: Prisma.FeedbackFindManyArgs): Promise<FeedbackRow[]>;
  };
};
import {
  getFunnelStatsCore,
  type FunnelRange,
  type FunnelStats,
  type AnalyticsSessionWithEvents,
  type FunnelEntities,
} from "../analytics/operationsCore";
import type {
  Prisma,
} from "@prisma/client";

export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export type FeedbackStatusCounts = Record<FeedbackStatus, number>;

export type AdminStats = {
  range: FunnelRange;
  since: string | null;
  users: {
    total: number;
    signedUpToday: number;
    signedUp7d: number;
    signedUp30d: number;
    activeToday: number;
    active7d: number;
    active30d: number;
    selectedSignups: number;
    selectedActive: number;
    deviceActivity: {
      sevenDays: DeviceUserCounts;
      thirtyDays: DeviceUserCounts;
    };
  };
  tasks: {
    created7d: number;
    completed7d: number;
    total: number;
  };
  payments: {
    confirmed: number;
    total: number;
    checkoutToPaidPct: number | null;
  };
  activity: {
    captures: number;
    triageCompleted: number;
    tasksCreated: number;
    tasksCompleted: number;
    taskCompletionPct: number | null;
  };
  funnel: FunnelStats["funnel"];
  feedback: {
    byStatus: FeedbackStatusCounts;
    total: number;
  };
};

export type DeviceUserCounts = {
  mobile: number;
  tablet: number;
  desktop: number;
  unknown: number;
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

/** AnalyticsSession rows the device-count select returns (nested APP_OPENED events). */
/** Active-user device counts per window (7d / 30d). */
export interface DeviceUserCountsByWindow {
  sevenDays: DeviceUserCounts;
  thirtyDays: DeviceUserCounts;
}

function deviceUserCounts(
  sessions: AnalyticsSessionWithEvents[],
  d7: Date,
  d30: Date,
): DeviceUserCountsByWindow {
  const blank = (): DeviceUserCounts => ({
    mobile: 0,
    tablet: 0,
    desktop: 0,
    unknown: 0,
  });
  const seven = new Map<keyof DeviceUserCounts, Set<string>>();
  const thirty = new Map<keyof DeviceUserCounts, Set<string>>();
  for (const kind of ["mobile", "tablet", "desktop", "unknown"] as const) {
    seven.set(kind, new Set());
    thirty.set(kind, new Set());
  }
  for (const session of sessions) {
    const kind: keyof DeviceUserCounts =
      session.deviceClass === "mobile" ||
      session.deviceClass === "tablet" ||
      session.deviceClass === "desktop"
        ? session.deviceClass
        : "unknown";
    for (const event of session.events ?? []) {
      if (!event.userId) continue;
      const occurredAt = new Date(event.occurredAt);
      if (occurredAt >= d30) thirty.get(kind)!.add(event.userId);
      if (occurredAt >= d7) seven.get(kind)!.add(event.userId);
    }
  }
  const count = (sets: Map<keyof DeviceUserCounts, Set<string>>) => {
    const result = blank();
    for (const [kind, users] of sets) result[kind] = users.size;
    return result;
  };
  return { sevenDays: count(seven), thirtyDays: count(thirty) };
}

export async function getAdminStatsCore(
  entities: AdminStatsEntities,
  range: FunnelRange = "30d",
): Promise<AdminStats> {
  const { today, d7, d30 } = windows();
  const now = Date.now();
  const sinceDate =
    range === "all"
      ? null
      : new Date(now - (range === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000);
  const selectedSince = sinceDate ? { gte: sinceDate } : undefined;

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
    selectedSignups,
    selectedActive,
    paymentsConfirmed,
    paymentsTotal,
    captures,
    triageCompleted,
    tasksCreatedSelected,
    tasksCompletedSelected,
    feedbackTotal,
    feedbackByStatusRaw,
    deviceSessions,
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
    entities.User.count({ where: { createdAt: selectedSince ?? undefined } }),
    entities.User.count({
      where: { lastActiveAt: selectedSince ?? undefined },
    }),
    entities.Payment?.count
      ? entities.Payment.count({
          where: { status: "SUCCEEDED", paidAt: selectedSince },
        })
      : Promise.resolve(0),
    entities.Payment?.count
      ? entities.Payment.count({ where: { status: "SUCCEEDED" } })
      : Promise.resolve(0),
    entities.AnalyticsEvent?.count
      ? entities.AnalyticsEvent.count({
          where: { name: "CAPTURE_CREATED", occurredAt: selectedSince },
        })
      : Promise.resolve(0),
    entities.AnalyticsEvent?.count
      ? entities.AnalyticsEvent.count({
          where: { name: "TRIAGE_COMPLETED", occurredAt: selectedSince },
        })
      : Promise.resolve(0),
    entities.Task.count({ where: { createdAt: selectedSince } }),
    entities.Task.count({
      where: { isDone: true, completedAt: selectedSince },
    }),
    // Soft-deleted feedback is excluded from both the total + the byStatus
    // breakdown — those are triage signals, and a deleted row isn't being
    // triaged anymore.
    entities.Feedback.count({ where: { deletedAt: null } }),
    entities.Feedback.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    (async () => {
      if (!entities.AnalyticsSession?.findMany) return [];
      const rows = await entities.AnalyticsSession.findMany({
        where: {
          events: {
            some: {
              name: "APP_OPENED",
              occurredAt: { gte: d30 },
              userId: { not: null },
            },
          },
        },
        select: {
          deviceClass: true,
          events: {
            where: {
              name: "APP_OPENED",
              occurredAt: { gte: d30 },
              userId: { not: null },
            },
            select: { userId: true, occurredAt: true },
          },
        },
      });
      // SAFETY: the select above includes the events relation; the delegate's
      // un-narrowed DefaultSelection return cannot express it.
      return rows as AnalyticsSessionWithEvents[];
    })(),
  ]);

  const byStatus = {
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    CLOSED: 0,
  } satisfies FeedbackStatusCounts;
  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  for (const row of feedbackByStatusRaw as {
    status: FeedbackStatus;
    _count: { _all: number };
  }[]) {
    if (row.status in byStatus) {
      byStatus[row.status] = row._count._all;
    }
  }

  const funnel = entities.AnalyticsSession?.findMany
    ? (await getFunnelStatsCore(entities, range)).funnel
    : [];
  const taskCompletionPct =
    tasksCreatedSelected > 0
      ? Math.round((tasksCompletedSelected / tasksCreatedSelected) * 1000) / 10
      : null;
  const checkoutCount =
    funnel.find((step) => step.name === "CHECKOUT_STARTED")?.count ?? 0;
  const paymentCount =
    funnel.find((step) => step.name === "PAYMENT_CONFIRMED")?.count ??
    paymentsConfirmed;

  return {
    range,
    since: sinceDate?.toISOString() ?? null,
    users: {
      total,
      signedUpToday,
      signedUp7d,
      signedUp30d,
      activeToday,
      active7d,
      active30d,
      selectedSignups,
      selectedActive,
      deviceActivity: deviceUserCounts(deviceSessions ?? [], d7, d30),
    },
    tasks: {
      created7d: tasksCreated7d,
      completed7d: tasksCompleted7d,
      total: tasksTotal,
    },
    payments: {
      confirmed: paymentsConfirmed,
      total: paymentsTotal,
      checkoutToPaidPct: checkoutCount
        ? Math.round((paymentCount / checkoutCount) * 1000) / 10
        : null,
    },
    activity: {
      captures,
      triageCompleted,
      tasksCreated: tasksCreatedSelected,
      tasksCompleted: tasksCompletedSelected,
      taskCompletionPct,
    },
    funnel,
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
  entities: FeedbackLookupEntities,
  {
    afterId,
    limit,
    statuses,
  }: { afterId?: string | null; limit: number; statuses?: FeedbackStatus[] },
): Promise<{ items: FeedbackRow[]; hasNext: boolean }> {
  const fetchLimit = limit + 1;
  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  const where: Prisma.FeedbackWhereInput = { deletedAt: null };
  if (statuses?.length) where.status = { in: statuses };
  const queryOpts: Prisma.FeedbackFindManyArgs = {
    where,
    take: fetchLimit,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: FEEDBACK_SELECT,
  };
  if (afterId) {
    queryOpts.skip = 1;
    queryOpts.cursor = { id: afterId };
  }
  // SAFETY: FEEDBACK_SELECT is checked into this module; the delegate's
  // loose return type is narrowed to the matching row shape.
  const rows = (await entities.Feedback.findMany(queryOpts)) as FeedbackRow[];

  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  return { items, hasNext };
}
