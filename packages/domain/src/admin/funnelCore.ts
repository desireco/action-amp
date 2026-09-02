/**
 * The growth-funnel core (S17) — ported from webapp/src/analytics/
 * operationsCore.ts's funnel half (`getFunnelStatsCore` + its types), which
 * the admin Funnel page op and the `/api/cli/admin/growth` route both serve.
 * The event-ingest half of that file belongs to the analytics surface and is
 * not ported here (S15's public recorder covers ingest minimally — see
 * docs/plans/slices/s17-wiring.md §5).
 *
 * NOTE: when a full analytics slice lands, this module should move to
 * `src/analytics/operationsCore.ts` verbatim (the webapp path); the admin
 * stats core imports it from here in the meantime.
 */

import type {
  AnalyticsEventName,
  AnalyticsSessionStatsArgs,
  AnalyticsSessionWithEvents,
} from "../db/index.js";

/** The funnel slice: AnalyticsSession may be absent when a caller's entity
 *  slice doesn't inject it — the core degrades to an empty session list. */
export interface FunnelEntities {
  AnalyticsSession?: {
    findMany(
      args: AnalyticsSessionStatsArgs,
    ): Promise<AnalyticsSessionWithEvents[]>;
  };
}

export type FunnelRange = "7d" | "30d" | "all";

export type FunnelStats = {
  range: FunnelRange;
  since: string | null;
  funnel: Array<{
    name: string;
    count: number;
    fromPreviousPct: number | null;
    fromLandingPct: number | null;
  }>;
  sources: Array<{
    source: string;
    sessions: number;
    signups: number;
    checkouts: number;
    payments: number;
    conversionPct: number | null;
  }>;
  retention: { d1Pct: number | null; d7Pct: number | null; note?: string };
};

export async function getFunnelStatsCore(
  entities: FunnelEntities,
  range: FunnelRange,
): Promise<FunnelStats> {
  const now = Date.now();
  const sinceDate =
    range === "all"
      ? null
      : new Date(now - (range === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000);
  const sessionsRaw =
    (await entities.AnalyticsSession?.findMany({
      where: sinceDate ? { firstSeenAt: { gte: sinceDate } } : undefined,
      select: {
        id: true,
        referrerHost: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        events: {
          where: sinceDate ? { occurredAt: { gte: sinceDate } } : undefined,
          select: { name: true, userId: true, occurredAt: true },
        },
      },
    })) ?? [];

  const sessions = sessionsRaw;

  const names: AnalyticsEventName[] = [
    "LANDING_VIEW",
    "SIGNUP_COMPLETED",
    "APP_OPENED",
    "CAPTURE_CREATED",
    "TRIAGE_COMPLETED",
    "CHECKOUT_STARTED",
    "PAYMENT_CONFIRMED",
  ];
  const counts = names.map((name) =>
    sessions.filter((s) => s.events.some((e) => e.name === name)).length,
  );
  const landingCount = counts[0] ?? 0;
  const funnel = names.map((name, i) => ({
    name,
    count: counts[i] ?? 0,
    fromPreviousPct:
      i === 0
        ? null
        : counts[i - 1]
          ? Math.round(((counts[i] ?? 0) / counts[i - 1]) * 1000) / 10
          : null,
    fromLandingPct:
      i === 0
        ? 100
        : landingCount
          ? Math.round(((counts[i] ?? 0) / landingCount) * 1000) / 10
          : null,
  }));

  const sourceMap = new Map<
    string,
    { sessions: number; signups: number; checkouts: number; payments: number }
  >();
  for (const session of sessions) {
    const source =
      [session.utmSource, session.utmCampaign, session.referrerHost]
        .filter(Boolean)
        .join(" / ") || "Unknown source";
    const row = sourceMap.get(source) ?? {
      sessions: 0,
      signups: 0,
      checkouts: 0,
      payments: 0,
    };
    row.sessions += 1;
    if (session.events.some((e) => e.name === "SIGNUP_COMPLETED"))
      row.signups += 1;
    if (session.events.some((e) => e.name === "CHECKOUT_STARTED"))
      row.checkouts += 1;
    if (session.events.some((e) => e.name === "PAYMENT_CONFIRMED"))
      row.payments += 1;
    sourceMap.set(source, row);
  }

  const appOpensByUser = new Map<string, Date[]>();
  for (const session of sessions) {
    for (const event of session.events) {
      if (event.name !== "APP_OPENED" || !event.userId) continue;
      const list = appOpensByUser.get(event.userId) ?? [];
      list.push(new Date(event.occurredAt));
      appOpensByUser.set(event.userId, list);
    }
  }
  const cohortUsers = Array.from(appOpensByUser.values()).map((dates) =>
    dates.sort((a, b) => a.getTime() - b.getTime()),
  );
  const d1Eligible = cohortUsers.filter(
    ([first]) => first && first.getTime() + 24 * 60 * 60 * 1000 <= now,
  );
  const d7Eligible = cohortUsers.filter(
    ([first]) => first && first.getTime() + 7 * 24 * 60 * 60 * 1000 <= now,
  );
  const returnedAt = (dates: Date[], days: number) => {
    const first = dates[0];
    return (
      !!first &&
      dates.some(
        (date) =>
          date.getTime() >= first.getTime() + days * 24 * 60 * 60 * 1000,
      )
    );
  };
  const retention = {
    d1Pct: d1Eligible.length
      ? Math.round(
          (d1Eligible.filter((dates) => returnedAt(dates, 1)).length /
            d1Eligible.length) *
            1000,
        ) / 10
      : null,
    d7Pct: d7Eligible.length
      ? Math.round(
          (d7Eligible.filter((dates) => returnedAt(dates, 7)).length /
            d7Eligible.length) *
            1000,
        ) / 10
      : null,
    note:
      d1Eligible.length || d7Eligible.length
        ? undefined
        : "Not enough elapsed time for a return cohort in this range.",
  };

  return {
    range,
    since: sinceDate?.toISOString() ?? null,
    funnel,
    sources: Array.from(sourceMap, ([source, row]) => ({
      source,
      ...row,
      conversionPct: row.sessions
        ? Math.round((row.payments / row.sessions) * 1000) / 10
        : null,
    })).sort((a, b) => b.sessions - a.sessions),
    retention,
  };
}
