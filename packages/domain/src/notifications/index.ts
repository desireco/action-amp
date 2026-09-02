/**
 * @actionamp/domain/notifications — S12/S14 push-notification cores.
 * Pure (no web-push, no server framework): the subscription upsert, the
 * dead-endpoint prune, and the daily-reminder body/clock contract. The send
 * loop + scheduler live in apps/api/src/push.ts.
 */
export {
  buildReminderBody,
  buildReminderPayload,
  deletePushSubscriptionCore,
  localClock,
  localDayStart,
  nowDate,
  savePushSubscriptionCore,
  sentThisLocalDate,
  truncate,
  type PushSubscriptionDeleteArgs,
  type PushSubscriptionDeleteEntities,
  type PushSubscriptionUpsertArgs,
  type PushSubscriptionUpsertEntities,
  type ReminderPayload,
} from "./operationsCore.js";
