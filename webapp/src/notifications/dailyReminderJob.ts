import webpush from "web-push";
import type { SendDailyTodayReminder } from "wasp/server/jobs";

type DailyReminderArgs = Record<string, never>;

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

function localClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

export const sendDailyTodayReminder: SendDailyTodayReminder<DailyReminderArgs, { sent: number }> = async (_args, context) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return { sent: 0 };

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const now = new Date();
  const users = await context.entities.User.findMany({
    where: { dailyReminderEnabled: true },
    select: { id: true, dailyReminderTime: true, dailyReminderTimeZone: true, lastDailyReminderAt: true, pushSubscriptions: true },
  });
  let sent = 0;

  for (const user of users) {
    let clock: { date: string; time: string };
    try { clock = localClock(now, user.dailyReminderTimeZone); } catch { continue; }
    if (clock.time !== user.dailyReminderTime) continue;
    if (user.lastDailyReminderAt && localClock(user.lastDailyReminderAt, user.dailyReminderTimeZone).date === clock.date) continue;

    const [todayTasks, todayCount] = await Promise.all([
      context.entities.Task.findMany({
        where: { userId: user.id, status: "TODAY", isDone: false },
        select: { description: true },
        orderBy: [{ priority: "desc" }, { order: "asc" }],
        take: 3,
      }),
      context.entities.Task.count({ where: { userId: user.id, status: "TODAY", isDone: false } }),
    ]);
    const body = buildReminderBody(
      todayTasks.map((t) => t.description),
      todayCount,
    );
    const payload = JSON.stringify({ title: "ActionAmp", body, url: "/app/today" });
    const results = await Promise.allSettled(user.pushSubscriptions.map((subscription) =>
      webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload),
    ));
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result.status === "fulfilled") sent += 1;
      if (result.status === "rejected" && "statusCode" in result.reason && [404, 410].includes(result.reason.statusCode)) {
        await context.entities.PushSubscription.delete({ where: { id: user.pushSubscriptions[index].id } });
      }
    }
    // Stamp after an attempted delivery. Retrying a failed provider response
    // every five minutes is more disruptive than a missed calm daily nudge.
    if (user.pushSubscriptions.length > 0) {
      await context.entities.User.update({ where: { id: user.id }, data: { lastDailyReminderAt: now } });
    }
  }
  return { sent };
};
