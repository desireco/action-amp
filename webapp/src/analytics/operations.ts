import { HttpError } from "wasp/server";
import type { GetAdminFunnel, RecordAnalyticsEvent } from "wasp/server/operations";
import {
  getFunnelStatsCore,
  recordAnalyticsEventCore,
  type AnalyticsEventInput,
  type FunnelRange,
  type FunnelStats,
} from "./operationsCore";

export const recordAnalyticsEvent = (async (args: AnalyticsEventInput, context) => {
  return recordAnalyticsEventCore(context.entities, args, context.user?.id ?? null);
}) satisfies RecordAnalyticsEvent<AnalyticsEventInput, { recorded: boolean; id: string }>;

export const getAdminFunnel = (async ({ range = "30d" }: { range?: FunnelRange }, context) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only.");
  const validRange: FunnelRange = range === "7d" || range === "all" ? range : "30d";
  return getFunnelStatsCore(context.entities, validRange);
}) satisfies GetAdminFunnel<{ range?: FunnelRange }, FunnelStats>;
