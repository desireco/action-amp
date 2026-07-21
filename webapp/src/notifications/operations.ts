import type {
  GetNotificationPreferences,
  SaveDailyReminder,
  SavePushSubscription,
} from "wasp/server/operations";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function requireUser(user: { id: string } | undefined) {
  if (!user) throw new Error("Not authenticated.");
  return user.id;
}

export const getNotificationPreferences = (async (_args, context) => {
  const userId = requireUser(context.user);
  const user = await context.entities.User.findUniqueOrThrow({
    where: { id: userId },
    select: {
      dailyReminderEnabled: true,
      dailyReminderTime: true,
      dailyReminderTimeZone: true,
    },
  });
  return { ...user, vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null };
}) satisfies GetNotificationPreferences<void, {
  dailyReminderEnabled: boolean;
  dailyReminderTime: string;
  dailyReminderTimeZone: string;
  vapidPublicKey: string | null;
}>;

export const savePushSubscription = (async (args, context) => {
  const userId = requireUser(context.user);
  if (!args?.endpoint || !args.p256dh || !args.auth) throw new Error("Invalid push subscription.");
  await context.entities.PushSubscription.upsert({
    where: { endpoint: args.endpoint },
    create: { userId, endpoint: args.endpoint, p256dh: args.p256dh, auth: args.auth },
    update: { userId, p256dh: args.p256dh, auth: args.auth },
  });
  return { ok: true };
}) satisfies SavePushSubscription<{ endpoint: string; p256dh: string; auth: string }, { ok: true }>;

export const saveDailyReminder = (async (args, context) => {
  const userId = requireUser(context.user);
  if (!TIME_RE.test(args?.time ?? "")) throw new Error("Choose a valid reminder time.");
  const timeZone = args.timeZone?.trim();
  if (!timeZone || timeZone.length > 100) throw new Error("Could not determine device time zone.");
  await context.entities.User.update({
    where: { id: userId },
    data: {
      dailyReminderEnabled: Boolean(args.enabled),
      dailyReminderTime: args.time,
      dailyReminderTimeZone: timeZone,
    },
  });
  return { ok: true };
}) satisfies SaveDailyReminder<{ enabled: boolean; time: string; timeZone: string }, { ok: true }>;
