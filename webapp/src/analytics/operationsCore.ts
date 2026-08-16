/**
 * First-party analytics cores. No Wasp imports: browser operations, the public
 * API handler, and admin reporting all share these validation rules.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { Prisma } from "@prisma/client";
type Entities = Record<string, any>;

export const ANALYTICS_EVENTS = [
  "LANDING_VIEW",
  "PRICING_VIEW",
  "FOUNDING_VIEW",
  "SIGNUP_STARTED",
  "SIGNUP_COMPLETED",
  "APP_OPENED",
  "ONBOARDING_COMPLETED",
  "CAPTURE_CREATED",
  "TRIAGE_COMPLETED",
  "FOCUS_STARTED",
  "TASK_COMPLETED",
  "CHECKOUT_STARTED",
  "PAYMENT_CONFIRMED",
  "LANDING_VARIANT_VIEWED",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const ONE_TIME_EVENTS = new Set<AnalyticsEventName>([
  "SIGNUP_COMPLETED",
  "ONBOARDING_COMPLETED",
  "CAPTURE_CREATED",
  "TRIAGE_COMPLETED",
]);

export type AnalyticsEventInput = {
  name: AnalyticsEventName;
  visitorId: string;
  route?: string | null;
  appVersion?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  referrerHost?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  initialPath?: string | null;
  deviceClass?: string | null;
};

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

function validateMetadata(
  metadata: AnalyticsEventInput["metadata"],
): Record<string, string | number | boolean | null> | null {
  if (!metadata) return null;
  const allowed = new Set(["plan", "surface", "landing_variant", "variant"]);
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowed.has(key)) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = typeof value === "string" ? value.slice(0, 120) : value;
    }
  }
  return Object.keys(out).length ? out : null;
}

export async function recordAnalyticsEventCore(
  entities: Entities,
  input: AnalyticsEventInput,
  userId?: string | null,
) {
  if (!ANALYTICS_EVENTS.includes(input.name))
    throw new Error("Unknown analytics event.");
  const visitorId = clean(input.visitorId, 80);
  if (!visitorId || !/^[a-zA-Z0-9_-]+$/.test(visitorId))
    throw new Error("Invalid analytics visitor id.");

  // Server-side product boundaries do not carry the browser visitor token.
  // Reuse the most recently linked browser session instead of creating a
  // second `user_*` session, preserving one visitor → activation path.
  let session =
    userId && visitorId.startsWith("user_")
      ? await entities.AnalyticsSession.findFirst({
          where: { userId },
          orderBy: { lastSeenAt: "desc" },
          select: { id: true, userId: true },
        })
      : null;
  if (session) {
    await entities.AnalyticsSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  } else {
    session = await entities.AnalyticsSession.upsert({
      where: { visitorId },
      create: {
        visitorId,
        userId: userId ?? null,
        referrerHost: clean(input.referrerHost, 180),
        utmSource: clean(input.utmSource, 120),
        utmMedium: clean(input.utmMedium, 120),
        utmCampaign: clean(input.utmCampaign, 160),
        utmContent: clean(input.utmContent, 160),
        utmTerm: clean(input.utmTerm, 160),
        initialPath: clean(input.initialPath, 300),
        deviceClass: clean(input.deviceClass, 40),
      },
      // SAFETY: Prisma upsert update shape matches AppSessionUpdateInput.
      update: {
        lastSeenAt: new Date(),
      } as Prisma.AnalyticsSessionUpdateInput,
      select: { id: true, userId: true },
    });
  }

  if (userId && ONE_TIME_EVENTS.has(input.name)) {
    const existing = await entities.AnalyticsEvent.findFirst({
      where: { userId, name: input.name },
      select: { id: true },
    });
    if (existing) return { recorded: false, id: existing.id };
  }

  const event = await entities.AnalyticsEvent.create({
    data: {
      name: input.name,
      route: clean(input.route, 300),
      appVersion: clean(input.appVersion, 80),
      metadata: validateMetadata(input.metadata),
      sessionId: session.id,
      userId: userId ?? session.userId ?? null,
    },
    select: { id: true },
  });
  return { recorded: true, id: event.id };
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
  entities: Entities,
  range: FunnelRange,
): Promise<FunnelStats> {
  const now = Date.now();
  const sinceDate =
    range === "all"
      ? null
      : new Date(now - (range === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000);
  const sessions =
    (await entities.AnalyticsSession.findMany({
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

  const names: AnalyticsEventName[] = [
    "LANDING_VIEW",
    "SIGNUP_COMPLETED",
    "APP_OPENED",
    "CAPTURE_CREATED",
    "TRIAGE_COMPLETED",
    "CHECKOUT_STARTED",
    "PAYMENT_CONFIRMED",
  ];
  const counts = names.map(
    (name) =>
      sessions.filter((s: any) => s.events.some((e: any) => e.name === name))
        .length,
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
  // SAFETY: double/wide assertion needed — runtime shape is verified.
  for (const session of sessions as any[]) {
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
    if (session.events.some((e: any) => e.name === "SIGNUP_COMPLETED"))
      row.signups += 1;
    if (session.events.some((e: any) => e.name === "CHECKOUT_STARTED"))
      row.checkouts += 1;
    if (session.events.some((e: any) => e.name === "PAYMENT_CONFIRMED"))
      row.payments += 1;
    sourceMap.set(source, row);
  }

  const appOpensByUser = new Map<string, Date[]>();
  // SAFETY: double/wide assertion needed — runtime shape is verified.
  for (const session of sessions as any[]) {
    // SAFETY: double/wide assertion needed — runtime shape is verified.
    for (const event of session.events as any[]) {
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
