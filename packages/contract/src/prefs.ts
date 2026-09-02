/**
 * The prefs contract — S11 (Settings/account, the preference parts).
 *
 * Shapes mirror the webapp ops (s11-settings/README.md §2 is the parity
 * checklist): `app/operations.ts`'s updateProfile + the Today-cap /
 * focus-session / review-preference saves, and `notifications/operations.ts`'s
 * getNotificationPreferences + saveDailyReminder.
 *
 * Deviations (both surface-driven, see docs/plans/slices/s7-s11-wiring.md):
 * - `getPreferences` is NEW: the webapp read todayCap / focusSessionMinutes /
 *   reviewPreferences off getAppData, but the S4 AppData contract sliced
 *   those out of its output (only the What Now + list fields ride along), so
 *   the preferences screen reads its own values here.
 * - `getNotificationPreferences.vapidPublicKey` stays in the shape (parity)
 *   but the API returns null until S12 owns the VAPID keys; the client's
 *   enable flow surfaces the webapp's exact "not configured" error string,
 *   which is also today's behavior without VAPID env configured.
 * - `savePushSubscription` is S12 (deferred — wiring note). The webapp's
 *   enable flow calls it between the push subscribe and saveDailyReminder;
 *   without VAPID the flow errors before that step, so S11 parity holds.
 *
 * Validation errors are the webapp strings verbatim ("Today cap must be a
 * whole number between 3 and 12.", "Focus session must be 25 or 45 minutes.",
 * "Review preferences must be true or false.", "Choose a valid reminder
 * time.", "Could not determine device time zone.", the cleanName set).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

/** Today-cap bounds — the webapp app/operations.ts shared constants. */
export const TODAY_CAP_DEFAULT = 5;
export const TODAY_CAP_MIN = 3;
export const TODAY_CAP_MAX = 12;

/** The closed Pomodoro set. */
export const FOCUS_SESSION_OPTIONS = [25, 45] as const;
export type FocusSessionMinutes = (typeof FOCUS_SESSION_OPTIONS)[number];
export const FOCUS_SESSION_DEFAULT: FocusSessionMinutes = 25;

/** `24h HH:mm` — the daily-reminder time format (`^([01]\d|2[0-3]):[0-5]\d$`). */
const ReminderTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Account → Profile save (app-owned User fields; email is immutable). */
export const updateProfile = oc
  .input(z.object({ fullName: z.string(), preferredName: z.string() }))
  .output(
    z.object({ fullName: z.string(), firstName: z.string(), preferredName: z.string() }),
  );

/**
 * The Account tab's read (the webapp used Wasp's useAuth + the session
 * user): profile fields, the sign-in email, and the entitlement flag the
 * Pro-gated tabs (Lenses) + the lens switcher gate client-side. S10's future
 * `me` query supersedes the account fields (wiring note).
 */
export const getAccount = oc.output(
  z.object({
    email: z.string().nullable(),
    fullName: z.string(),
    firstName: z.string(),
    preferredName: z.string().nullable(),
    plan: z.string(),
    entitled: z.boolean(),
  }),
);

/** The preferences screen's own read (todayCap / focus / reviews / zone). */
export const getPreferences = oc.output(
  z.object({
    todayCap: z.number().int(),
    focusSessionMinutes: z.union([z.literal(25), z.literal(45)]),
    reviewPreferences: z.object({ today: z.boolean(), week: z.boolean(), month: z.boolean() }),
    timeZone: z.string(),
  }),
);

/** Today cap preference — global across lenses, 3–12, integer, default 5. */
export const saveTodayCap = oc
  .input(z.object({ todayCap: z.number().int() }))
  .output(z.object({ ok: z.literal(true) }));

/** Store the closed-set Pomodoro duration used when opening new sessions. */
export const saveFocusSessionMinutes = oc
  .input(z.object({ minutes: z.union([z.literal(25), z.literal(45)]) }))
  .output(z.object({ ok: z.literal(true) }));

/** Review cadence visibility — saving never touches Review or work records. */
export const saveReviewPreferences = oc
  .input(z.object({ today: z.boolean(), week: z.boolean(), month: z.boolean() }))
  .output(z.object({ ok: z.literal(true) }));

/**
 * The daily Today reminder: time (24h HH:mm) + the device's IANA zone.
 * Back-fills `User.timeZone` when null (first device zone wins).
 */
export const saveDailyReminder = oc
  .input(
    z.object({
      enabled: z.boolean(),
      time: ReminderTime,
      timeZone: z.string().min(1).max(100),
    }),
  )
  .output(z.object({ ok: z.literal(true) }));

/**
 * Reminder settings + the push public key (null until S12 stamps VAPID).
 * The client enable flow checks this before requesting permission.
 */
export const getNotificationPreferences = oc.output(
  z.object({
    dailyReminderEnabled: z.boolean(),
    dailyReminderTime: z.string(),
    dailyReminderTimeZone: z.string(),
    vapidPublicKey: z.string().nullable(),
  }),
);

/**
 * The prefs namespace — paths: POST /rpc/prefs/{updateProfile,getAccount,
 * getPreferences,saveTodayCap,saveFocusSessionMinutes,saveReviewPreferences,
 * saveDailyReminder,getNotificationPreferences}. Composed into the tree by
 * src/router.ts (the composition line lives in
 * docs/plans/slices/s7-s11-wiring.md).
 */
export const prefsContract = {
  updateProfile,
  getAccount,
  getPreferences,
  saveTodayCap,
  saveFocusSessionMinutes,
  saveReviewPreferences,
  saveDailyReminder,
  getNotificationPreferences,
};
