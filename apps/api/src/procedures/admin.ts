/**
 * The admin procedures (S17) — the dashboard's eleven ops, thin wrappers over
 * the domain cores (packages/domain/src/admin + feedback), ported from
 * webapp/src/admin/operations.ts + webapp/src/analytics/operations.ts's
 * getAdminFunnel.
 *
 * Gate placement (webapp parity, s17-admin/README.md §3): EVERY op checks
 * identity → admin BEFORE any DB read. Non-admins get oRPC FORBIDDEN (403)
 * "Admin only." — the same string the PAT routes answer with, so no surface
 * leaks which ids exist.
 *
 * Error mapping: the userManagement cores' validation/mutation/blocked errors
 * carry the webapp messages verbatim; they map to BAD_REQUEST (400) so the
 * Users page's `error.message` rendering shows the real reason (the webapp's
 * Wasp ops surfaced the same strings through its op error channel).
 *
 * NOTE — fragment implements FRAGMENT: the composition line for
 * apps/api/src/router.ts (`admin: adminProcedures`) lives in
 * docs/plans/slices/s17-wiring.md §1.
 */
import { implement, ORPCError } from "@orpc/server";
import { adminContract } from "@actionamp/contract";
import type {
  AdminUserRow,
  FeedbackRow as FeedbackRowDto,
  FunnelRange,
} from "@actionamp/contract";
import {
  getActivityStatsCore,
  getAdminStatsCore,
  getAdminUsersCore,
  getRecentFeedbackCore,
  getFunnelStatsCore,
  grantAdminUserAccessCore,
  removeAdminUserAccessCore,
  deleteAdminUserCore,
  deleteAdminUsersCore,
  AdminUserInputError,
  AdminUserMutationError,
  AdminUserDeletionBlockedError,
  type AdminStats,
  type ActivityStats,
  type FunnelStats,
} from "@actionamp/domain/admin";
import {
  deleteFeedbackCore,
  updateFeedbackStatusCore,
  type FeedbackRow,
  type FeedbackStatus,
} from "@actionamp/domain/feedback";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(adminContract).$context<ApiContext>();

/**
 * The admin boundary — identity FIRST, then the flag, before any DB read.
 * "Admin only." is the exact webapp string (ops + PAT routes share it).
 */
function requireAdmin(context: ApiContext) {
  const user = requireUser(context);
  if (!user.isAdmin) {
    throw new ORPCError("FORBIDDEN", { message: "Admin only." });
  }
  return user;
}

/** The userManagement cores' error vocabulary → 400 with the message verbatim. */
function toBadRequest(err: unknown): never {
  if (
    err instanceof AdminUserInputError ||
    err instanceof AdminUserMutationError ||
    err instanceof AdminUserDeletionBlockedError
  ) {
    throw new ORPCError("BAD_REQUEST", { message: err.message });
  }
  throw err as Error;
}

/** Date-bearing core rows → the contract's ISO-string wire shapes. */
function toFeedbackDto(row: FeedbackRow): FeedbackRowDto {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

function toAdminUserDto(
  row: Awaited<ReturnType<typeof getAdminUsersCore>>["items"][number],
): AdminUserRow {
  return {
    ...row,
    signedUpAt: row.signedUpAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    lastActiveAt: row.lastActiveAt ? row.lastActiveAt.toISOString() : null,
    manualGrantAt: row.manualGrantAt ? row.manualGrantAt.toISOString() : null,
  };
}

// ----------------------------------------------------------------
// Queries
// ----------------------------------------------------------------

const stats = ORPC.stats.handler(async ({ context, input }) => {
  requireAdmin(context);
  // Invalid range coerces to "30d" (webapp parity — the op never validated).
  const validRange: FunnelRange =
    input?.range === "7d" || input?.range === "all"
      ? (input.range as FunnelRange)
      : "30d";
  return (await getAdminStatsCore(context.entities, validRange)) as AdminStats;
});

const activityStats = ORPC.activityStats.handler(async ({ context }) => {
  requireAdmin(context);
  return (await getActivityStatsCore(context.entities)) as ActivityStats;
});

const users = ORPC.users.handler(async ({ context, input }) => {
  requireAdmin(context);
  try {
    const page = await getAdminUsersCore(context.entities, input ?? {});
    return {
      total: page.total,
      nextCursor: page.nextCursor,
      items: page.items.map(toAdminUserDto),
    };
  } catch (err) {
    toBadRequest(err);
  }
});

const funnel = ORPC.funnel.handler(async ({ context, input }) => {
  requireAdmin(context);
  const validRange: FunnelRange =
    input?.range === "7d" || input?.range === "all"
      ? (input.range as FunnelRange)
      : "30d";
  return (await getFunnelStatsCore(context.entities, validRange)) as FunnelStats;
});

const recentFeedback = ORPC.recentFeedback.handler(
  async ({ context, input }) => {
    requireAdmin(context);
    const limit = input?.limit ?? 10;
    const page = await getRecentFeedbackCore(context.entities, {
      afterId: input?.afterId ?? null,
      // Clamp 1–50, default 10 (webapp op parity).
      limit: Math.max(1, Math.min(50, Math.floor(limit))),
      statuses: input?.statuses as FeedbackStatus[] | undefined,
    });
    return {
      items: page.items.map(toFeedbackDto),
      hasNext: page.hasNext,
    };
  },
);

// ----------------------------------------------------------------
// Actions
// ----------------------------------------------------------------

const grantAccess = ORPC.grantAccess.handler(async ({ context, input }) => {
  const user = requireAdmin(context);
  if (!input?.targetUserId || !input.grant) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Target user and grant are required.",
    });
  }
  try {
    await grantAdminUserAccessCore(context.entities, {
      actorUserId: user.id,
      targetUserId: input.targetUserId,
      grant: input.grant,
    });
  } catch (err) {
    toBadRequest(err);
  }
});

const removeAccess = ORPC.removeAccess.handler(async ({ context, input }) => {
  const user = requireAdmin(context);
  if (!input?.targetUserId) {
    throw new ORPCError("BAD_REQUEST", { message: "Target user is required." });
  }
  try {
    await removeAdminUserAccessCore(context.entities, {
      actorUserId: user.id,
      targetUserId: input.targetUserId,
    });
  } catch (err) {
    toBadRequest(err);
  }
});

const deleteUser = ORPC.deleteUser.handler(async ({ context, input }) => {
  const user = requireAdmin(context);
  if (!input?.targetUserId) {
    throw new ORPCError("BAD_REQUEST", { message: "Target user is required." });
  }
  try {
    // STRIPE_SECRET_KEY-unset deployments behave exactly like the webapp's
    // unset Stripe singleton: Stripe customers block with "Could not verify
    // recurring billing." (see s17-wiring.md §5).
    await deleteAdminUserCore(context.entities, {
      actorUserId: user.id,
      targetUserId: input.targetUserId,
    });
  } catch (err) {
    toBadRequest(err);
  }
});

const deleteUsers = ORPC.deleteUsers.handler(async ({ context, input }) => {
  const user = requireAdmin(context);
  if (!Array.isArray(input?.targetUserIds)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Users to delete are required.",
    });
  }
  try {
    return await deleteAdminUsersCore(context.entities, {
      actorUserId: user.id,
      targetUserIds: input.targetUserIds,
    });
  } catch (err) {
    toBadRequest(err);
  }
});

const updateFeedbackStatus = ORPC.updateFeedbackStatus.handler(
  async ({ context, input }) => {
    requireAdmin(context);
    try {
      const row = await updateFeedbackStatusCore(context.entities, {
        id: input.id,
        status: input.status as FeedbackStatus,
      });
      return toFeedbackDto(row);
    } catch (err) {
      toBadRequest(err);
    }
  },
);

const deleteFeedback = ORPC.deleteFeedback.handler(
  async ({ context, input }) => {
    requireAdmin(context);
    try {
      const row = await deleteFeedbackCore(context.entities, { id: input.id });
      return toFeedbackDto(row);
    } catch (err) {
      toBadRequest(err);
    }
  },
);

/** The implemented admin fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s17-wiring.md §1). */
export const adminProcedures = {
  stats,
  activityStats,
  users,
  grantAccess,
  removeAccess,
  deleteUser,
  deleteUsers,
  funnel,
  recentFeedback,
  updateFeedbackStatus,
  deleteFeedback,
};
