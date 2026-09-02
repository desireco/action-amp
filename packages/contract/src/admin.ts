/**
 * The admin contract — S17 (admin dashboard + the admin feedback ops).
 *
 * Shapes mirror webapp/src/admin/operationsCore.ts, userManagementCore.ts,
 * feedback/operationsCore.ts + analytics/operationsCore.ts (`FunnelStats`) —
 * the parity checklist lives in s17-admin/README.md. Eleven ops, every one
 * server-gated on the acting user's `isAdmin` (403 FORBIDDEN, "Admin only."
 * verbatim — the check runs BEFORE any DB read, no existence oracle).
 *
 * Wire conventions match goals.ts: ISO strings for temporals, declared errors
 * undeclared (the webapp ops don't declare error shapes; the 403 body is the
 * oRPC FORBIDDEN message). The admin-cli's `/api/cli/admin|feedback/*` routes
 * are a REST surface, NOT part of this contract — see
 * docs/plans/slices/s17-wiring.md §3 for their placement.
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

const datetime = () => z.string();

/** `7d` | `30d` | `all` — anything else coerces to `30d` server-side (parity:
 *  the webapp ops never validated the funnel range, they coerced). */
export const FunnelRangeSchema = z.enum(["7d", "30d", "all"]);
export type FunnelRange = z.infer<typeof FunnelRangeSchema>;

/** OPEN → IN_PROGRESS → RESOLVED → CLOSED (order is load-bearing: it is
 *  interpolated into the validation error strings the CLI routes surface). */
export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export const FeedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

/** The 19-field feedback row (webapp FEEDBACK_SELECT) — every field the
 *  admin-cli prints verbatim in `--json` mode. */
export const FeedbackRowSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  createdAt: datetime(),
  updatedAt: datetime(),
  deletedAt: datetime().nullable(),
  message: z.string(),
  status: FeedbackStatusSchema,
  userId: z.string(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
  route: z.string().nullable(),
  section: z.string().nullable(),
  lensId: z.string().nullable(),
  lensName: z.string().nullable(),
  lensColor: z.string().nullable(),
  userAgent: z.string().nullable(),
  viewport: z.string().nullable(),
  timezone: z.string().nullable(),
});
export type FeedbackRow = z.infer<typeof FeedbackRowSchema>;

// ----------------------------------------------------------------
// §2.1 AdminStats (overview tiles + recent-feedback table)
// ----------------------------------------------------------------

export const AdminFunnelStepSchema = z.object({
  name: z.string(),
  count: z.number().int(),
  fromPreviousPct: z.number().nullable(),
  fromLandingPct: z.number().nullable(),
});

export const AdminStatsSchema = z.object({
  range: FunnelRangeSchema,
  since: datetime().nullable(),
  users: z.object({
    total: z.number().int(),
    signedUpToday: z.number().int(),
    signedUp7d: z.number().int(),
    signedUp30d: z.number().int(),
    activeToday: z.number().int(),
    active7d: z.number().int(),
    active30d: z.number().int(),
    selectedSignups: z.number().int(),
    selectedActive: z.number().int(),
    deviceActivity: z.object({
      sevenDays: z.object({
        mobile: z.number().int(),
        tablet: z.number().int(),
        desktop: z.number().int(),
        unknown: z.number().int(),
      }),
      thirtyDays: z.object({
        mobile: z.number().int(),
        tablet: z.number().int(),
        desktop: z.number().int(),
        unknown: z.number().int(),
      }),
    }),
  }),
  tasks: z.object({
    created7d: z.number().int(),
    completed7d: z.number().int(),
    total: z.number().int(),
  }),
  payments: z.object({
    confirmed: z.number().int(),
    total: z.number().int(),
    checkoutToPaidPct: z.number().nullable(),
  }),
  activity: z.object({
    captures: z.number().int(),
    triageCompleted: z.number().int(),
    tasksCreated: z.number().int(),
    tasksCompleted: z.number().int(),
    taskCompletionPct: z.number().nullable(),
  }),
  funnel: z.array(AdminFunnelStepSchema),
  feedback: z.object({
    byStatus: z.object({
      OPEN: z.number().int(),
      IN_PROGRESS: z.number().int(),
      RESOLVED: z.number().int(),
      CLOSED: z.number().int(),
    }),
    total: z.number().int(),
  }),
});
export type AdminStats = z.infer<typeof AdminStatsSchema>;

// ----------------------------------------------------------------
// §2.2 ActivityStats (activity page — Mon–Sun UTC week buckets)
// ----------------------------------------------------------------

export const ActivityWeekSchema = z.object({
  weekStart: datetime(),
  weekEnd: datetime(),
  isCurrent: z.boolean(),
  signups: z.number().int(),
  activeUsers: z.number().int(),
  captures: z.number().int(),
  triageCompleted: z.number().int(),
  tasksCreated: z.number().int(),
  tasksCompleted: z.number().int(),
});
export type ActivityWeek = z.infer<typeof ActivityWeekSchema>;

export const ActivityStatsSchema = z.object({
  weeks: z.array(ActivityWeekSchema),
  month: z.object({ label: z.string(), weeks: z.array(ActivityWeekSchema) }),
});
export type ActivityStats = z.infer<typeof ActivityStatsSchema>;

// ----------------------------------------------------------------
// §2.3 AdminUserRow (users directory)
// ----------------------------------------------------------------

export const AdminUserRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  signedUpAt: datetime(),
  lastLoginAt: datetime().nullable(),
  lastActiveAt: datetime().nullable(),
  billedPlan: z.string(),
  manualAccessGrant: z.string().nullable(),
  manualGrantAt: datetime().nullable(),
  isAdmin: z.boolean(),
  logins7d: z.number().int(),
  appOpens7d: z.number().int(),
  tasksCreated7d: z.number().int(),
  projectsCreated7d: z.number().int(),
  goalsCreated7d: z.number().int(),
  tasksFinished7d: z.number().int(),
  tasksFinished30d: z.number().int(),
});
export type AdminUserRow = z.infer<typeof AdminUserRowSchema>;

// ----------------------------------------------------------------
// §2.4 FunnelStats (funnel page + the /api/cli/admin/growth REST route)
// ----------------------------------------------------------------

export const FunnelStatsSchema = z.object({
  range: FunnelRangeSchema,
  since: datetime().nullable(),
  funnel: z.array(AdminFunnelStepSchema),
  sources: z.array(
    z.object({
      source: z.string(),
      sessions: z.number().int(),
      signups: z.number().int(),
      checkouts: z.number().int(),
      payments: z.number().int(),
      conversionPct: z.number().nullable(),
    }),
  ),
  retention: z.object({
    d1Pct: z.number().nullable(),
    d7Pct: z.number().nullable(),
    note: z.string().optional(),
  }),
});
export type FunnelStats = z.infer<typeof FunnelStatsSchema>;

// ----------------------------------------------------------------
// Ops — paths: POST /rpc/admin/<key>
// ----------------------------------------------------------------

/** Overview stats bundle. Invalid `range` coerces to "30d" (webapp parity). */
export const getAdminStats = oc
  .input(z.object({ range: z.string().optional() }).optional())
  .output(AdminStatsSchema);

/** Week-bucketed activity metrics. No input. */
export const getAdminActivityStats = oc.output(ActivityStatsSchema);

/** User directory page. Filter values are validated server-side (invalid →
 *  400 BAD_REQUEST with the webapp `AdminUserInputError` message). */
export const getAdminUsers = oc
  .input(
    z
      .object({
        search: z.string().optional(),
        joined: z.string().optional(),
        active: z.string().optional(),
        access: z.string().optional(),
        sort: z.string().optional(),
        cursor: z.string().nullish(),
        limit: z.number().int().optional(),
      })
      .optional(),
  )
  .output(
    z.object({
      total: z.number().int(),
      nextCursor: z.string().nullable(),
      items: z.array(AdminUserRowSchema),
    }),
  );

/** Manual access grant (PRO | FOUNDER | FRIEND) + its AdminUserAction audit
 *  row, atomically. Self/admin targets → 400 with the webapp message. */
export const grantAdminUserAccess = oc
  .input(
    z.object({
      targetUserId: z.string(),
      grant: z.enum(["PRO", "FOUNDER", "FRIEND"]),
    }),
  )
  .output(z.void());

/** Nulls the manual grant + writes the REMOVE_MANUAL_GRANT audit row. */
export const removeAdminUserAccess = oc
  .input(z.object({ targetUserId: z.string() }))
  .output(z.void());

/** Delete one user (blocks on active Stripe subscriptions; deletes magic-login
 *  challenges + writes the DELETE_USER audit row; Payments survive SetNull). */
export const deleteAdminUser = oc
  .input(z.object({ targetUserId: z.string() }))
  .output(z.void());

/** Bulk delete, 1–25 distinct ids. Per-id try/catch: deletions never stop on
 *  a protected account — the skipped entries carry the exact reason. */
export const deleteAdminUsers = oc
  .input(z.object({ targetUserIds: z.array(z.string()) }))
  .output(
    z.object({
      deletedIds: z.array(z.string()),
      skipped: z.array(
        z.object({ targetUserId: z.string(), reason: z.string() }),
      ),
    }),
  );

/** Growth funnel + acquisition sources + retention. */
export const getAdminFunnel = oc
  .input(z.object({ range: z.string().optional() }).optional())
  .output(FunnelStatsSchema);

/** Cursor-paged recent feedback (admin dashboard + Feedback page). `afterId`
 *  is the last shown row's id; limit clamped 1–50 (default 10). */
export const getRecentFeedback = oc
  .input(
    z.object({
      afterId: z.string().nullish(),
      limit: z.number().int().optional(),
      statuses: z.array(FeedbackStatusSchema).optional(),
    }),
  )
  .output(
    z.object({
      items: z.array(FeedbackRowSchema),
      hasNext: z.boolean(),
    }),
  );

/** Triage status change. Resolves the row by id prefix (shortId or UUID,
 *  newest match wins) and updates by the resolved PK. Unknown row → 400
 *  BAD_REQUEST "Feedback not found." (the webapp op surfaced the core throw). */
export const updateFeedbackStatus = oc
  .input(z.object({ id: z.string(), status: FeedbackStatusSchema }))
  .output(FeedbackRowSchema);

/** Soft delete — stamps `deletedAt`; every read filters it out. */
export const deleteFeedback = oc
  .input(z.object({ id: z.string() }))
  .output(FeedbackRowSchema);

/** The admin namespace — paths: POST /rpc/admin/{stats,activityStats,…}.
 *  Composed into the tree by src/router.ts (the composition line lives in
 *  docs/plans/slices/s17-wiring.md §1). */
export const adminContract = {
  stats: getAdminStats,
  activityStats: getAdminActivityStats,
  users: getAdminUsers,
  grantAccess: grantAdminUserAccess,
  removeAccess: removeAdminUserAccess,
  deleteUser: deleteAdminUser,
  deleteUsers: deleteAdminUsers,
  funnel: getAdminFunnel,
  recentFeedback: getRecentFeedback,
  updateFeedbackStatus,
  deleteFeedback,
};
