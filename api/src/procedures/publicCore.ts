/**
 * The public core (S15) — the pure, testable slice of procedures/public.ts
 * (the reminder.ts precedent: vitest breaks on `@actionamp/contract`'s zod
 * re-exports, so everything a unit test wants to pin lives HERE, imported
 * only by the Hono/oRPC layer).
 *
 * Ported from webapp/src/analytics/operationsCore.ts (the public-path subset:
 * event-name allow-list, visitor-id clean, ONE_TIME_EVENTS dedup, session
 * upsert) + the founding-100 payload (webapp founding100StatusHandler's
 * res.json call — key order IS the wire contract).
 *
 * ANALYTICS FIDELITY (deferred — wiring doc §5): the recorder below is the
 * MINIMAL public path — visitor-id session upsert + event insert + the
 * one-time-event dedup — enough for the funnel events to land. The full
 * analytics port (utm attribution on first-seen, session reuse for `user_*`
 * visitors, admin funnel reads) owns the rest.
 */
import { and, eq } from "drizzle-orm";
import {
  analyticsEvent,
  analyticsEventName,
  analyticsSession,
  mintId,
  type DomainDb,
} from "@actionamp/domain/db";
import {
  FOUNDING_100_CAP,
  FOUNDING_100_LAUNCH_PARTNER_RESERVE,
  FOUNDING_100_PUBLIC_CAP,
} from "@actionamp/domain/billing";

// ----------------------------------------------------------------
// Founding-100 status math (claimed = billed FOUNDER OR manual FOUNDER
// grant, never FRIEND — FOUNDER_MEMBERSHIP_WHERE at the call site)
// ----------------------------------------------------------------

/** The exact wire payload — key order is the contract (webapp res.json). */
export function founding100Payload(claimed: number) {
  return {
    cap: FOUNDING_100_CAP,
    reserved: FOUNDING_100_LAUNCH_PARTNER_RESERVE,
    claimed,
    remaining: Math.max(0, FOUNDING_100_PUBLIC_CAP - claimed),
    isFull: claimed >= FOUNDING_100_PUBLIC_CAP,
  };
}

// ----------------------------------------------------------------
// The minimal public analytics recorder
// ----------------------------------------------------------------

/** The webapp's ANALYTICS_EVENTS (analytics/operationsCore.ts). */
export const ANALYTICS_EVENT_NAMES = new Set([
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
]);

/** Webapp ONE_TIME_EVENTS — recorded once per user account, ever. */
export const ONE_TIME_EVENTS = new Set([
  "SIGNUP_COMPLETED",
  "ONBOARDING_COMPLETED",
  "CAPTURE_CREATED",
  "TRIAGE_COMPLETED",
]);

/** The metadata keys the recorder admits (webapp validateMetadata). */
const METADATA_KEYS = new Set(["plan", "surface", "landing_variant", "variant"]);

export interface PublicAnalyticsInput {
  name: string;
  visitorId: string;
  route?: string | null;
  appVersion?: string | null;
  metadata?: Record<string, string | number | boolean> | null;
}

/** The webapp clean(): trim, require, cap length; else null. */
function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

/**
 * Record one funnel event: session upsert by visitorId (lastSeenAt touch) +
 * event insert. Returns `{recorded: false}` for a one-time event the user
 * already has. Throws on unknown event name / bad visitor id (the REST layer
 * maps any failure to the 400 body).
 */
export async function recordPublicAnalyticsEvent(
  db: DomainDb,
  input: PublicAnalyticsInput,
  userId?: string | null,
): Promise<{ recorded: boolean }> {
  if (typeof input.name !== "string" || !ANALYTICS_EVENT_NAMES.has(input.name)) {
    throw new Error("Unknown analytics event.");
  }
  const eventName = input.name as (typeof analyticsEventName.enumValues)[number];
  const visitorId = clean(input.visitorId, 80);
  if (!visitorId || !/^[a-zA-Z0-9_-]+$/.test(visitorId)) {
    throw new Error("Invalid analytics visitor id.");
  }

  const now = new Date();
  const existing = await db
    .select({ id: analyticsSession.id })
    .from(analyticsSession)
    .where(eq(analyticsSession.visitorId, visitorId))
    .limit(1);
  let sessionId: string;
  if (existing[0]) {
    sessionId = existing[0].id;
    await db
      .update(analyticsSession)
      .set({ lastSeenAt: now })
      .where(eq(analyticsSession.id, sessionId));
  } else {
    sessionId = mintId();
    await db.insert(analyticsSession).values({
      id: sessionId,
      visitorId,
      userId: userId ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }

  if (userId && ONE_TIME_EVENTS.has(eventName)) {
    const dup = await db
      .select({ id: analyticsEvent.id })
      .from(analyticsEvent)
      .where(
        and(eq(analyticsEvent.userId, userId), eq(analyticsEvent.name, eventName)),
      )
      .limit(1);
    if (dup[0]) return { recorded: false };
  }

  // Metadata: only the allow-listed keys, primitive values only.
  let metadata: Record<string, string | number | boolean> | null = null;
  const raw = input.metadata;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (!METADATA_KEYS.has(key)) continue;
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        metadata ??= {};
        metadata[key] = typeof value === "string" ? value.slice(0, 120) : value;
      }
    }
  }

  await db.insert(analyticsEvent).values({
    id: mintId(),
    name: eventName,
    route: clean(input.route, 300),
    appVersion: clean(input.appVersion, 80),
    metadata,
    sessionId,
    userId: userId ?? null,
    occurredAt: now,
  });
  return { recorded: true };
}
