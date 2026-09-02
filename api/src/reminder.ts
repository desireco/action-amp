/**
 * The daily-reminder pass — the PURE, injected-effects seam (no contract /
 * oRPC / zod imports: unit tests import this module directly, and dragging
 * the contract chain into vitest breaks resolution under the isolated
 * linker). The real deps + scheduler live in push.ts; the pure helpers
 * (local clock, body/payload builders) live in @actionamp/domain/notifications.
 */
import {
  buildReminderBody,
  buildReminderPayload,
  localClock,
  localDayStart,
  sentThisLocalDate,
} from "@actionamp/domain/notifications";

/** The subscription fields the send loop reads. */
export interface ReminderSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The user fields the send loop reads (webapp findMany select parity). */
export interface ReminderUserRow {
  id: string;
  dailyReminderTime: string;
  dailyReminderTimeZone: string;
  lastDailyReminderAt: Date | null;
  pushSubscriptions: ReminderSubscriptionRow[];
}

/** The web-push send seam — rejects with `{statusCode}` on provider errors. */
export type PushSendFn = (
  subscription: ReminderSubscriptionRow,
  payload: string,
) => Promise<void>;

/** Injected effects of the job — the unit-test seam (no web-push/DB in tests). */
export interface ReminderDeps {
  /** VAPID credentials; null (any key missing) makes the whole pass a no-op. */
  vapid(): { subject: string; publicKey: string; privateKey: string } | null;
  /** Bind the credentials for this pass (web-push's setVapidDetails). */
  configureVapid(vapid: { subject: string; publicKey: string; privateKey: string }): void;
  /** The run's "now" (the stamp value + the clock all users are matched on). */
  now(): Date;
  listReminderUsers(): Promise<ReminderUserRow[]>;
  /** Top-3 open TODAY task names + the total open-TODAY count. */
  todayTasks(userId: string): Promise<{ names: string[]; total: number }>;
  send: PushSendFn;
  /** Dead-endpoint prune (404/410 rejections only). */
  deleteSubscription(id: string): Promise<void>;
  /**
   * The atomic once-per-local-day claim — `lastDailyReminderAt = now` only
   * when no stamp exists at/after `localMidnight` (the user's local day
   * start, as a UTC instant). False → someone else claimed this user's day;
   * skip (never double-send).
   */
  claimDailyReminder(userId: string, localMidnight: Date, now: Date): Promise<boolean>;
}

/** The job's only observable output (webapp parity). */
export interface ReminderRunResult {
  sent: number;
}

export async function runDailyReminderPass(deps: ReminderDeps): Promise<ReminderRunResult> {
  // 1. VAPID gate — missing keys no-op silently (S12 §5).
  const vapid = deps.vapid();
  if (!vapid) return { sent: 0 };

  deps.configureVapid(vapid);
  const now = deps.now();
  const users = await deps.listReminderUsers();
  let sent = 0;

  for (const u of users) {
    let clock: { date: string; time: string };
    try {
      clock = localClock(now, u.dailyReminderTimeZone);
    } catch {
      continue; // Invalid IANA zone — skip the user, never crash the run.
    }
    if (clock.time !== u.dailyReminderTime) continue;
    if (sentThisLocalDate(u.lastDailyReminderAt, clock, u.dailyReminderTimeZone)) continue;
    // Zero subscriptions → nothing to send and NEVER a stamp (a later
    // subscribe must still fire that day — webapp parity).
    if (u.pushSubscriptions.length === 0) continue;

    // Atomic claim before sending: the multi-worker-safe replacement for the
    // webapp's post-attempt stamp. Failures below still consume the day.
    const claimed = await deps.claimDailyReminder(
      u.id,
      localDayStart(clock.date, u.dailyReminderTimeZone),
      now,
    );
    if (!claimed) continue;

    const { names, total } = await deps.todayTasks(u.id);
    const body = buildReminderBody(names, total);
    const payload = buildReminderPayload(body);

    const results = await Promise.allSettled(
      u.pushSubscriptions.map((subscription) => deps.send(subscription, payload)),
    );
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result?.status === "fulfilled") sent += 1;
      const statusCode =
        result?.status === "rejected"
          ? (result.reason as { statusCode?: number })?.statusCode
          : undefined;
      // 404/410 → the subscription is gone; prune it (webapp parity).
      if (result?.status === "rejected" && (statusCode === 404 || statusCode === 410)) {
        const dead = u.pushSubscriptions[index];
        if (dead) await deps.deleteSubscription(dead.id);
      }
    }
  }
  return { sent };
}
