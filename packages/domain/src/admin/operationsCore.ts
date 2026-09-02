/**
 * Pure admin-stats cores (S17) — ported from webapp/src/admin/
 * operationsCore.ts. Shared DB layer for the browser oRPC queries
 * (`api/src/procedures/admin.ts`) and the admin-cli `/api/cli/admin/*`
 * PAT routes.
 *
 * Pattern: every core takes `entities` as its first arg and plain args, does
 * the DB work, returns plain serializable data. No framework imports.
 *
 * All counts are global (across all users) — the admin boundary is enforced by
 * the callers (the oRPC op gates on `user.isAdmin`; PAT routes gate on
 * `requireAdmin`). No row-level user data beyond feedback submitter is
 * surfaced.
 */

/**
 * The read-only delegate slices these stats cores call (named, not a loose
 * map). Payment/AnalyticsEvent/AnalyticsSession are optional because the
 * webapp's Wasp op entity lists could omit them — the stat degrades to 0
 * when absent. The port's API layer always populates them.
 */
import type {
  AnalyticsEventWhereInput,
  FeedbackFindManyArgs,
  FeedbackRow,
  FeedbackSelect,
  FeedbackWhereInput,
  PaymentWhereInput,
  TaskWhereInput,
  UserWhereInput,
} from "../db/index.js";
import type { FeedbackStatus } from "../feedback/operationsCore.js";
import {
  getFunnelStatsCore,
  type FunnelEntities,
  type FunnelRange,
  type FunnelStats,
} from "./funnelCore.js";

// The shared feedback vocabulary re-exported for the op + route layers (one
// definition — the feedback core owns the constant).
export {
  FEEDBACK_STATUSES,
  isFeedbackStatus,
  type FeedbackRow,
  type FeedbackSelect,
  type FeedbackStatus,
} from "../feedback/operationsCore.js";

interface AdminStatsEntities {
  User: { count(args?: { where?: UserWhereInput }): Promise<number> };
  Task: { count(args?: { where?: TaskWhereInput }): Promise<number> };
  Payment?: {
    count(args?: { where?: PaymentWhereInput }): Promise<number>;
  };
  AnalyticsEvent?: {
    count(args?: { where?: AnalyticsEventWhereInput }): Promise<number>;
  };
  AnalyticsSession?: FunnelEntities["AnalyticsSession"];
  Feedback: {
    count(args?: { where?: FeedbackWhereInput }): Promise<number>;
    groupBy(args: {
      by: ["status"];
      where?: { deletedAt?: null };
      _count: { _all: true };
    }): Promise<Array<{ status: string; _count: { _all: number } }>>;
    findMany(args: FeedbackFindManyArgs): Promise<FeedbackRow[]>;
  };
}

/** The slice getRecentFeedbackCore uses (its op injects Feedback only). */
type FeedbackLookupEntities = {
  Feedback: {
    findMany(args: FeedbackFindManyArgs): Promise<FeedbackRow[]>;
  };
};

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

/** Active-user device counts per window (7d / 30d). */
export interface DeviceUserCountsByWindow {
  sevenDays: DeviceUserCounts;
  thirtyDays: DeviceUserCounts;
}

/** A session row with its projected APP_OPENED events (device-count select). */
type DeviceSessionRow = {
  deviceClass: string | null;
  events: Array<{ userId: string | null; occurredAt: Date }>;
};

function deviceUserCounts(
  sessions: DeviceSessionRow[],
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
      return await entities.AnalyticsSession.findMany({
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
    })(),
  ]);

  const byStatus = {
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    CLOSED: 0,
  } satisfies FeedbackStatusCounts;
  for (const row of feedbackByStatusRaw) {
    if (row.status in byStatus) {
      byStatus[row.status as FeedbackStatus] = row._count._all;
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
// Activity dashboard — calendar-week (Mon–Sun UTC) activity metrics
// ----------------------------------------------------------------

/** The delegate slice the activity core calls (all counts, no row data). */
interface ActivityStatsEntities {
  User: { count(args?: { where?: UserWhereInput }): Promise<number> };
  Task: { count(args?: { where?: TaskWhereInput }): Promise<number> };
  AnalyticsEvent?: {
    count(args?: { where?: AnalyticsEventWhereInput }): Promise<number>;
  };
}

export type ActivityWeek = {
  /** ISO — bucket start (Monday 00:00 UTC for trend weeks; month-clipped for month rows). */
  weekStart: string;
  /** ISO — bucket end, exclusive. */
  weekEnd: string;
  isCurrent: boolean;
  signups: number;
  activeUsers: number;
  captures: number;
  triageCompleted: number;
  tasksCreated: number;
  tasksCompleted: number;
};

export type ActivityStats = {
  /** Last 8 full ISO weeks, oldest → newest. The final entry is the current week. */
  weeks: ActivityWeek[];
  /** Current calendar month, split into buckets clipped to the month's edges (so the rows sum to the month's totals). */
  month: { label: string; weeks: ActivityWeek[] };
};

/** Monday 00:00:00.000 UTC of the ISO week containing `date` (Sunday is the week's last day). */
export function startOfISOWeek(date: Date): Date {
  const d = new Date(date.getTime());
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfUTCMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const ACTIVITY_TREND_WEEKS = 8;

/**
 * Week-bucketed activity counts for the admin Activity page. Every bucket is
 * counted with exclusive-end ranges (`gte` start, `lt` end): a row exactly at
 * the boundary lands in the next bucket. Trend weeks are full ISO weeks
 * (Monday → Sunday UTC); month rows are clipped to the calendar month so the
 * month table sums to the month's own totals.
 */
export async function getActivityStatsCore(
  entities: ActivityStatsEntities,
  { now = new Date() }: { now?: Date } = {},
): Promise<ActivityStats> {
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  const currentWeekStart = startOfISOWeek(now);
  const trendBounds: Array<[Date, Date]> = [];
  for (let i = ACTIVITY_TREND_WEEKS - 1; i >= 0; i--) {
    const start = new Date(currentWeekStart.getTime() - i * weekMs);
    trendBounds.push([start, new Date(start.getTime() + weekMs)]);
  }

  const monthStart = startOfUTCMonth(now);
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
  const monthBounds: Array<[Date, Date]> = [];
  for (let t = monthStart.getTime(); t < monthEnd.getTime(); t += weekMs) {
    monthBounds.push([new Date(t), new Date(Math.min(t + weekMs, monthEnd.getTime()))]);
  }

  const bucket = async ([gte, lt]: [Date, Date]): Promise<Omit<ActivityWeek, "weekStart" | "weekEnd" | "isCurrent">> => {
    const eventCount = (name: "CAPTURE_CREATED" | "TRIAGE_COMPLETED") =>
      entities.AnalyticsEvent?.count
        ? entities.AnalyticsEvent.count({
            where: { name, occurredAt: { gte, lt } },
          })
        : Promise.resolve(0);
    const [signups, activeUsers, captures, triageCompleted, tasksCreated, tasksCompleted] =
      await Promise.all([
        entities.User.count({ where: { createdAt: { gte, lt } } }),
        entities.User.count({ where: { lastActiveAt: { gte, lt } } }),
        eventCount("CAPTURE_CREATED"),
        eventCount("TRIAGE_COMPLETED"),
        entities.Task.count({ where: { createdAt: { gte, lt } } }),
        entities.Task.count({ where: { isDone: true, completedAt: { gte, lt } } }),
      ]);
    return {
      signups: signups ?? 0,
      activeUsers: activeUsers ?? 0,
      captures: captures ?? 0,
      triageCompleted: triageCompleted ?? 0,
      tasksCreated: tasksCreated ?? 0,
      tasksCompleted: tasksCompleted ?? 0,
    };
  };

  const toWeek = async (bounds: [Date, Date], isCurrent: boolean): Promise<ActivityWeek> => ({
    weekStart: bounds[0].toISOString(),
    weekEnd: bounds[1].toISOString(),
    isCurrent,
    ...(await bucket(bounds)),
  });

  const weeks = await Promise.all(
    trendBounds.map((bounds, i) => toWeek(bounds, i === trendBounds.length - 1)),
  );
  const monthWeeks = await Promise.all(
    monthBounds.map(([start, end]) => toWeek([start, end], now >= start && now < end)),
  );

  return {
    weeks,
    month: { label: MONTH_LABEL.format(now), weeks: monthWeeks },
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
  const where: FeedbackWhereInput = { deletedAt: null };
  if (statuses?.length) where.status = { in: statuses };
  const queryOpts: FeedbackFindManyArgs = {
    where,
    take: fetchLimit,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: FEEDBACK_SELECT,
  };
  if (afterId) {
    queryOpts.skip = 1;
    queryOpts.cursor = { id: afterId };
  }
  const rows = await entities.Feedback.findMany(queryOpts);

  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  return { items, hasNext };
}

// FEEDBACK_SELECT lives in the seam (one definition) — local alias for the
// selects above.
const FEEDBACK_SELECT: FeedbackSelect = {
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
