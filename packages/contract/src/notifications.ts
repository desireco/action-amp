/**
 * The notifications contract — S12 (push + PWA/share, the push-op parts).
 *
 * Ported from webapp/src/notifications/operations.ts (the parity checklist
 * lives in s12-push-pwa/README.md §2). S11 already landed the reminder-preference
 * half of that op file — `prefs.saveDailyReminder` + `prefs.getNotificationPreferences`
 * (packages/contract/src/prefs.ts) — so this fragment carries only the op S11
 * deferred: `savePushSubscription`.
 *
 * Wire path: POST /rpc/notifications/savePushSubscription. Composed into the
 * tree by src/router.ts (the one composition point — the line lives in
 * docs/plans/slices/s12-s14-wiring.md).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

/**
 * Store (or re-target) the browser's Web-Push subscription. **Upsert keyed by
 * the unique `endpoint`**: a create carries `{userId, endpoint, p256dh, auth}`,
 * an update rewrites `userId` + both keys (a subscription can survive a sign-out
 * → sign-in as a different account on the same device). Emptiness is the core's
 * business rule, not a shape rule — the API throws the webapp's exact
 * "Invalid push subscription." so the client surfaces it verbatim.
 */
export const savePushSubscription = oc
  .input(z.object({ endpoint: z.string(), p256dh: z.string(), auth: z.string() }))
  .output(z.object({ ok: z.literal(true) }));

/**
 * The notifications namespace — paths: POST /rpc/notifications/savePushSubscription.
 * Composed into the tree by src/router.ts (the one composition point).
 */
export const notificationsContract = {
  savePushSubscription,
};
