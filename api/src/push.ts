/**
 * S12/S14 — the push surface + the daily-reminder scheduler (the app's only cron).
 *
 * Two concerns live here:
 *
 * 1. `notificationsProcedures` — the oRPC fragment implementing
 *    `notificationsContract.savePushSubscription` over the domain core (the
 *    endpoint-keyed upsert). Composed by src/router.ts (one line; see
 *    docs/plans/slices/s12-s14-wiring.md).
 *
 * 2. `startDailyReminderScheduler` — the bun-native replacement for the
 *    webapp's PgBoss `* * * * *` schedule: a 60s interval with an overlap
 *    guard, any user-chosen local HH:mm fires within a minute. Runs in every
 *    environment (skipped under NODE_ENV=test) — without VAPID env configured
 *    the pass no-ops at the gate, so dev stays quiet unless keys are set.
 *
 * The pass body itself (`runDailyReminderPass`, the ported
 * `sendDailyTodayReminder` job) lives in src/reminder.ts — pure, injected
 * effects, no contract imports, so vitest can unit-test the loop's invariants
 * without dragging the contract chain in.
 */
import { implement, ORPCError } from "@orpc/server";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import webpush from "web-push";
import { nowDate, savePushSubscriptionCore } from "@actionamp/domain/notifications";
import { notificationsContract } from "@actionamp/contract";
import type { DomainDb } from "@actionamp/domain/db";
import { pushSubscription, task, user } from "@actionamp/domain/db";
import { requireUser, type ApiContext } from "./context.js";
import { logEvent } from "./logger.js";
import { runDailyReminderPass, type ReminderDeps } from "./reminder.js";

const ORPC = implement(notificationsContract).$context<ApiContext>();

// ----------------------------------------------------------------
// 1. The push-subscription op
// ----------------------------------------------------------------

const savePushSubscription = ORPC.savePushSubscription.handler(
  async ({ context, input }) => {
    const acting = requireUser(context);
    try {
      await savePushSubscriptionCore(context.entities, {
        userId: acting.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      });
    } catch (err) {
      // The core's Error is the webapp's exact "Invalid push subscription."
      if (err instanceof Error && !(err instanceof ORPCError)) {
        throw new ORPCError("BAD_REQUEST", { message: err.message });
      }
      throw err;
    }
    return { ok: true as const };
  },
);

/** The implemented notifications fragment — composed by src/router.ts. */
export const notificationsProcedures = {
  savePushSubscription,
};

// ----------------------------------------------------------------
// 2. The real deps (Drizzle + web-push) + the scheduler
// ----------------------------------------------------------------

/** Build the production ReminderDeps over the domain's Drizzle handle. */
export function createReminderDeps(db: DomainDb): ReminderDeps {
  return {
    vapid() {
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      const privateKey = process.env.VAPID_PRIVATE_KEY;
      const subject = process.env.VAPID_SUBJECT;
      if (!publicKey || !privateKey || !subject) return null;
      return { subject, publicKey, privateKey };
    },
    configureVapid(vapid) {
      webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    },
    now: () => nowDate(),
    async listReminderUsers() {
      const rows = await db
        .select({
          id: user.id,
          dailyReminderTime: user.dailyReminderTime,
          dailyReminderTimeZone: user.dailyReminderTimeZone,
          lastDailyReminderAt: user.lastDailyReminderAt,
        })
        .from(user)
        .where(eq(user.dailyReminderEnabled, true));
      if (rows.length === 0) return [];
      const subs = await db
        .select({
          id: pushSubscription.id,
          userId: pushSubscription.userId,
          endpoint: pushSubscription.endpoint,
          p256dh: pushSubscription.p256Dh,
          auth: pushSubscription.auth,
        })
        .from(pushSubscription)
        .where(
          inArray(
            pushSubscription.userId,
            rows.map((r) => r.id),
          ),
        );
      return rows.map((r) => ({
        ...r,
        pushSubscriptions: subs
          .filter((s) => s.userId === r.id)
          .map(({ id, endpoint, p256dh, auth }) => ({ id, endpoint, p256dh, auth })),
      }));
    },
    async todayTasks(userId) {
      // Top-3 open TODAY tasks (priority desc, order asc) + the total count —
      // the webapp job's findMany + count pair. Postgres enums sort by
      // declaration order (LOW < NORMAL < IMPORTANT), so `priority DESC`
      // surfaces IMPORTANT first, exactly as Prisma's orderBy did.
      const openToday = and(
        eq(task.userId, userId),
        eq(task.status, "TODAY"),
        eq(task.isDone, false),
      );
      const [top, totals] = await Promise.all([
        db
          .select({ description: task.description })
          .from(task)
          .where(openToday)
          .orderBy(desc(task.priority), asc(task.order))
          .limit(3),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(task)
          .where(openToday),
      ]);
      return {
        names: top.map((t) => t.description),
        total: totals[0]?.total ?? 0,
      };
    },
    async send(subscription, payload) {
      // Rejections carry web-push's `statusCode` — the prune reads it.
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
    },
    async deleteSubscription(id) {
      await db.delete(pushSubscription).where(eq(pushSubscription.id, id));
    },
    async claimDailyReminder(userId, localMidnight, stamp) {
      // The webapp's post-attempt stamp made atomic (S14 port note: the
      // check-then-stamp was not multi-worker-safe). `updatedAt` has no
      // bearing here — only lastDailyReminderAt is written.
      const claimed = await db
        .update(user)
        .set({ lastDailyReminderAt: stamp })
        .where(
          and(
            eq(user.id, userId),
            or(
              isNull(user.lastDailyReminderAt),
              lt(user.lastDailyReminderAt, localMidnight),
            ),
          ),
        )
        .returning({ id: user.id });
      return claimed.length > 0;
    },
  };
}

/** The scheduler handle — `stop()` clears the interval (shutdown wiring). */
export interface ReminderScheduler {
  stop(): void;
}

/** Default cadence — the webapp PgBoss cron `* * * * *`, as milliseconds. */
const REMINDER_INTERVAL_MS = 60_000;
/** First tick shortly after boot (the per-minute loop then takes over). */
const REMINDER_FIRST_TICK_MS = 10_000;

/**
 * Start the per-minute reminder loop (the PgBoss replacement). Overlap guard:
 * a pass slower than 60s never stacks a second. Skipped under NODE_ENV=test;
 * in dev the pass runs but no-ops without VAPID env (the designed gate).
 */
export function startDailyReminderScheduler(db: DomainDb): ReminderScheduler {
  if (process.env.NODE_ENV === "test") {
    return { stop: () => {} };
  }
  const deps = createReminderDeps(db);
  let running = false;
  let stopped = false;

  async function tick(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      const { sent } = await runDailyReminderPass(deps);
      if (sent > 0) {
        logEvent("info", `daily reminder sent to ${sent} user${sent === 1 ? "" : "s"}`, {
          event: "dailyReminder",
          sent,
        });
      }
    } catch (err) {
      // The pass itself never throws by design; this is a belt-and-braces log.
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        event: "dailyReminder",
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }));
    } finally {
      running = false;
    }
  }

  const first = setTimeout(() => void tick(), REMINDER_FIRST_TICK_MS);
  const interval = setInterval(() => void tick(), REMINDER_INTERVAL_MS);
  return {
    stop() {
      stopped = true;
      clearTimeout(first);
      clearInterval(interval);
    },
  };
}
