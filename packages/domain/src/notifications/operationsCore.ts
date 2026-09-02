/**
 * Pure notification-operation cores — ported from
 * webapp/src/notifications/{operations.ts,dailyReminderJob.ts} (S12/S14; the
 * parity checklist lives in packages/contract/src/s12-push-pwa/README.md +
 * s14-emails-cron/README.md).
 *
 * Pattern (mirrors `inbox/operationsCore.ts`): every core takes an entities
 * slice as its first arg (structural — the seam `Entities` satisfies these by
 * construction once a PushSubscription delegate exists; Vitest mocks fake them
 * directly, the `mockContext` EntitySpy shape has `upsert`). **No server
 * framework or web-push import lives here.**
 *
 * The send loop itself (VAPID gate, per-user clock matching, 404/410 prune,
 * the once-per-local-day stamp) is apps/api's job seam — `apps/api/src/push.ts`
 * — because it binds web-push + Drizzle directly (there are no User /
 * PushSubscription delegates on the F4b seam). The pieces worth unit-pinning —
 * the subscription upsert semantics and the body-string contract — live here.
 */

import { instantFrom, instantToDate, systemClock, Temporal } from "../shared/time/temporal.js";

// ----------------------------------------------------------------
// Entities slices — the delegates each core calls (structural)
// ----------------------------------------------------------------

/** The delegates savePushSubscriptionCore calls (Prisma upsert dialect). */
export interface PushSubscriptionUpsertArgs {
  where: { endpoint: string };
  create: { userId: string; endpoint: string; p256dh: string; auth: string };
  update: { userId: string; p256dh: string; auth: string };
}

export interface PushSubscriptionUpsertEntities {
  PushSubscription: {
    upsert(args: PushSubscriptionUpsertArgs): Promise<unknown>;
  };
}

/** The delegate deletePushSubscriptionCore calls (the dead-endpoint prune). */
export interface PushSubscriptionDeleteArgs {
  where: { id: string };
}

export interface PushSubscriptionDeleteEntities {
  PushSubscription: {
    delete(args: PushSubscriptionDeleteArgs): Promise<unknown>;
  };
}

// ----------------------------------------------------------------
// Cores
// ----------------------------------------------------------------

/**
 * savePushSubscription — the browser's Web-Push subscription store (webapp
 * notifications/operations.ts :: savePushSubscription). **Upsert keyed by the
 * unique `endpoint`**: create carries `{userId, endpoint, p256dh, auth}`, an
 * update rewrites `userId` + both keys (the row follows the account now
 * signed in on the device). Missing/empty args throw the webapp's exact
 * "Invalid push subscription." — the API maps it onto BAD_REQUEST verbatim.
 */
export async function savePushSubscriptionCore(
  entities: PushSubscriptionUpsertEntities,
  args: { userId: string; endpoint?: string; p256dh?: string; auth?: string },
): Promise<{ ok: true }> {
  if (!args.endpoint || !args.p256dh || !args.auth) {
    throw new Error("Invalid push subscription.");
  }
  await entities.PushSubscription.upsert({
    where: { endpoint: args.endpoint },
    create: {
      userId: args.userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
    },
    update: { userId: args.userId, p256dh: args.p256dh, auth: args.auth },
  });
  return { ok: true };
}

/**
 * Dead-endpoint prune — a `sendNotification` rejected with 404/410 means the
 * subscription is gone (browser unregistered / expired); delete the row.
 * Every other rejection is NOT a prune (transient provider trouble).
 */
export async function deletePushSubscriptionCore(
  entities: PushSubscriptionDeleteEntities,
  args: PushSubscriptionDeleteArgs,
): Promise<void> {
  await entities.PushSubscription.delete(args);
}

// ----------------------------------------------------------------
// The daily-reminder body contract (webapp dailyReminderJob.ts, verbatim)
// ----------------------------------------------------------------

/** Truncate a task name for push body copy at the visible-limit threshold. */
export function truncate(name: string, max = 48): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/**
 * Build the daily-reminder body string from the top Today tasks + the total
 * open-Today count. Three shapes: tasks present (named, top 3, +N more when
 * the count exceeds the named sample), or a calm "nothing planned" nudge.
 * Pure + exported so the contract is unit-testable without web-push.
 */
export function buildReminderBody(names: string[], totalCount: number): string {
  const trimmed = names.map((n) => truncate(n));
  const extra = totalCount - trimmed.length;
  return trimmed.length > 0
    ? `Today: ${trimmed.join(", ")}${extra > 0 ? ` (+${extra} more)` : ""}`
    : "Nothing planned yet. Choose what matters.";
}

/** The push payload the service worker's `push` handler decodes. */
export interface ReminderPayload {
  title: string;
  body: string;
  url: string;
}

/** The payload JSON the job sends — SW renders `title`, routes `url`. */
export function buildReminderPayload(body: string): string {
  const payload: ReminderPayload = { title: "ActionAmp", body, url: "/do/today" };
  return JSON.stringify(payload);
}

/**
 * The user's local wall clock — the webapp dailyReminderJob's `localClock`:
 * the local calendar date ("YYYY-MM-DD") + the HH:mm time at minutes
 * precision. Throws on an invalid IANA zone (the job skips that user).
 */
export function localClock(now: Date, timeZone: string): { date: string; time: string } {
  const local = instantFrom(now).toZonedDateTimeISO(timeZone);
  return {
    date: local.toPlainDate().toString(),
    time: local.toPlainTime().toString({ smallestUnit: "minute" }),
  };
}

/**
 * The "already sent today" guard read (webapp parity): the last stamp
 * resolved in the SAME user zone falls on the same local date.
 */
export function sentThisLocalDate(
  lastDailyReminderAt: Date | null,
  clock: { date: string },
  timeZone: string,
): boolean {
  if (!lastDailyReminderAt) return false;
  return localClock(lastDailyReminderAt, timeZone).date === clock.date;
}

/**
 * Midnight of the given local calendar date, as a UTC instant — the boundary
 * the scheduler's atomic claim compares `lastDailyReminderAt` against (a stamp
 * at or after the user's local midnight means "already claimed today").
 */
export function localDayStart(date: string, timeZone: string): Date {
  // String plainTime — Bun's Temporal rejects an all-zero object form.
  const day = Temporal.PlainDate.from(date).toZonedDateTime({
    timeZone,
    plainTime: "00:00",
  });
  return instantToDate(day.toInstant());
}

/** The current instant — injectable in tests via the deps clock, system elsewhere. */
export function nowDate(clock: { instant(): { epochMilliseconds: number } } = systemClock): Date {
  return new Date(clock.instant().epochMilliseconds);
}
