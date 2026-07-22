import { HttpError } from "wasp/server";
import type { GetAdminStats, GetRecentFeedback, UpdateFeedbackStatus } from "wasp/server/operations";
import { getAdminStatsCore, getRecentFeedbackCore, type AdminStats, type FeedbackRow } from "./operationsCore";
import { updateFeedbackStatusCore, type FeedbackStatus } from "../feedback/operationsCore";

/**
 * Admin dashboard stats — one round-trip bundle of counts. Gates on
 * context.user.isAdmin; non-admins get a 403 (also enforced by the hidden tab
 * + the page's belt-and-suspenders check, but the server gate is the boundary).
 */
export const getAdminStats = (async (_args, context) => {
  if (!context.user?.isAdmin) {
    throw new HttpError(403, "Admin only.");
  }
  return getAdminStatsCore(context.entities);
}) satisfies GetAdminStats<void, AdminStats>;

export type RecentFeedbackArgs = { afterId?: string | null; limit?: number };
export type RecentFeedbackResult = { items: FeedbackRow[]; hasNext: boolean };

/**
 * Paged recent-feedback feed for the dashboard's "recent" list. `afterId` is
 * the last shown item's id (cursor); `limit` clamped to 1–50, default 10.
 */
export const getRecentFeedback = (async (
  { afterId, limit = 10 }: RecentFeedbackArgs,
  context,
) => {
  if (!context.user?.isAdmin) {
    throw new HttpError(403, "Admin only.");
  }
  return getRecentFeedbackCore(context.entities, {
    afterId: afterId ?? null,
    limit: Math.max(1, Math.min(50, Math.floor(limit))),
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
  if (!context.user?.isAdmin) {
    throw new HttpError(403, "Admin only.");
  }
  return updateFeedbackStatusCore(context.entities, { id, status });
}) satisfies UpdateFeedbackStatus<UpdateFeedbackStatusArgs, UpdateFeedbackStatusResult>;
