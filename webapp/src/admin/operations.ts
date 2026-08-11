import { HttpError, prisma } from "wasp/server";
import type { GetAdminStats, GetRecentFeedback, UpdateFeedbackStatus, DeleteFeedback, GetAdminUsers, GrantAdminUserAccess, RemoveAdminUserAccess, DeleteAdminUser, DeleteAdminUsers } from "wasp/server/operations";
import { getAdminStatsCore, getRecentFeedbackCore, type AdminStats, type FeedbackRow } from "./operationsCore";
import { updateFeedbackStatusCore, deleteFeedbackCore, type FeedbackStatus } from "../feedback/operationsCore";
import type { FunnelRange } from "../analytics/operationsCore";
import {
  getAdminUsersCore,
  grantAdminUserAccessCore,
  removeAdminUserAccessCore,
  deleteAdminUserCore,
  deleteAdminUsersCore,
  type ManualGrant,
  type UserAccessFilter,
  type UserSort,
} from "./userManagementCore";

function requireAdmin(context: { user?: { isAdmin?: boolean } | null }): asserts context is { user: { id: string; isAdmin: true } } {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only.");
}

function adminMutationEntities(entities: Record<string, unknown>) {
  return { ...entities, $transaction: prisma.$transaction.bind(prisma) };
}

/**
 * Admin dashboard stats — one round-trip bundle of counts. Gates on
 * context.user.isAdmin; non-admins get a 403 (also enforced by the hidden tab
 * + the page's belt-and-suspenders check, but the server gate is the boundary).
 */
export const getAdminStats = (async ({ range = "30d" }: { range?: FunnelRange } = {}, context) => {
  requireAdmin(context);
  const validRange: FunnelRange = range === "7d" || range === "all" ? range : "30d";
  return getAdminStatsCore(context.entities, validRange);
}) satisfies GetAdminStats<{ range?: FunnelRange }, AdminStats>;

export type RecentFeedbackArgs = { afterId?: string | null; limit?: number; statuses?: FeedbackStatus[] };
export type RecentFeedbackResult = { items: FeedbackRow[]; hasNext: boolean };

/**
 * Paged recent-feedback feed for the dashboard's "recent" list. `afterId` is
 * the last shown item's id (cursor); `limit` clamped to 1–50, default 10.
 */
export const getRecentFeedback = (async (
  { afterId, limit = 10, statuses }: RecentFeedbackArgs,
  context,
) => {
  requireAdmin(context);
  return getRecentFeedbackCore(context.entities, {
    afterId: afterId ?? null,
    limit: Math.max(1, Math.min(50, Math.floor(limit))),
    statuses,
  });
}) satisfies GetRecentFeedback<RecentFeedbackArgs, RecentFeedbackResult>;

export type UpdateFeedbackStatusArgs = { id: string; status: FeedbackStatus };
export type UpdateFeedbackStatusResult = FeedbackRow;

/**
 * Inline status update from the admin dashboard's recent-feedback table.
 * Admin-gated (same boundary as the queries); delegates to the shared
 * `updateFeedbackStatusCore`, which validates the status, resolves the row by
 * id prefix (full UUID works — it's a prefix of itself), and updates by PK.
 */
export const updateFeedbackStatus = (async (
  { id, status }: UpdateFeedbackStatusArgs,
  context,
) => {
  requireAdmin(context);
  return updateFeedbackStatusCore(context.entities, { id, status });
}) satisfies UpdateFeedbackStatus<UpdateFeedbackStatusArgs, UpdateFeedbackStatusResult>;

export type DeleteFeedbackArgs = { id: string };
export type DeleteFeedbackResult = FeedbackRow;

/**
 * Soft-delete from the admin dashboard's status dropdown. Sets `deletedAt`
 * (every read core filters `deletedAt: null`); the row is not destroyed.
 * Admin-gated like the other triage actions. Throws "Feedback not found." if
 * no live row matches the id prefix, which the client surfaces as an error.
 */
export const deleteFeedback = (async (
  { id }: DeleteFeedbackArgs,
  context,
) => {
  requireAdmin(context);
  return deleteFeedbackCore(context.entities, { id });
}) satisfies DeleteFeedback<DeleteFeedbackArgs, DeleteFeedbackResult>;

export type AdminUsersArgs = {
  search?: string;
  joined?: "7d" | "30d";
  active?: "7d" | "30d" | "inactive_30d" | "never";
  access?: UserAccessFilter;
  sort?: UserSort;
  cursor?: string | null;
  limit?: number;
};

export const getAdminUsers = (async (args: AdminUsersArgs = {}, context) => {
  requireAdmin(context);
  return getAdminUsersCore(context.entities, args);
}) satisfies GetAdminUsers<AdminUsersArgs, Awaited<ReturnType<typeof getAdminUsersCore>>>;

export type GrantAdminUserAccessArgs = { targetUserId: string; grant: ManualGrant };
export const grantAdminUserAccess = (async (args: GrantAdminUserAccessArgs, context) => {
  requireAdmin(context);
  if (!args?.targetUserId || !args.grant) throw new HttpError(400, "Target user and grant are required.");
  return grantAdminUserAccessCore(adminMutationEntities(context.entities), { actorUserId: context.user.id, ...args });
}) satisfies GrantAdminUserAccess<GrantAdminUserAccessArgs, void>;

export type RemoveAdminUserAccessArgs = { targetUserId: string };
export const removeAdminUserAccess = (async (args: RemoveAdminUserAccessArgs, context) => {
  requireAdmin(context);
  if (!args?.targetUserId) throw new HttpError(400, "Target user is required.");
  return removeAdminUserAccessCore(adminMutationEntities(context.entities), { actorUserId: context.user.id, ...args });
}) satisfies RemoveAdminUserAccess<RemoveAdminUserAccessArgs, void>;

export type DeleteAdminUserArgs = { targetUserId: string };
export const deleteAdminUser = (async (args: DeleteAdminUserArgs, context) => {
  requireAdmin(context);
  if (!args?.targetUserId) throw new HttpError(400, "Target user is required.");
  return deleteAdminUserCore(adminMutationEntities(context.entities), { actorUserId: context.user.id, ...args });
}) satisfies DeleteAdminUser<DeleteAdminUserArgs, void>;

export type DeleteAdminUsersArgs = { targetUserIds: string[] };
export const deleteAdminUsers = (async (args: DeleteAdminUsersArgs, context) => {
  requireAdmin(context);
  if (!Array.isArray(args?.targetUserIds)) throw new HttpError(400, "Users to delete are required.");
  return deleteAdminUsersCore(adminMutationEntities(context.entities), { actorUserId: context.user.id, ...args });
}) satisfies DeleteAdminUsers<DeleteAdminUsersArgs, Awaited<ReturnType<typeof deleteAdminUsersCore>>>;
