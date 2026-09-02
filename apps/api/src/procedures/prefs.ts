/**
 * The prefs procedures (S11 — Settings/account, the preference parts): thin
 * wrappers implementing `prefsContract` over direct drizzle User reads/writes.
 *
 * The webapp ops these port (s11-settings/README.md §2 is the checklist):
 * `app/operations.ts`'s updateProfile + saveTodayCap / saveFocusSessionMinutes
 * / saveReviewPreferences, and `notifications/operations.ts`'s
 * getNotificationPreferences + saveDailyReminder. Validation strings are the
 * webapp's verbatim ("Name is required.", "Today cap must be a whole number
 * between 3 and 12.", "Choose a valid reminder time.", …). saveDailyReminder
 * back-fills `User.timeZone` when null (first device zone wins).
 *
 * Deviations (surface-driven, see docs/plans/slices/s7-s11-wiring.md):
 * - `getPreferences` is new — the webapp read these values off getAppData,
 *   whose S4 contract output doesn't carry them; the preferences screen has
 *   its own read instead.
 * - `getNotificationPreferences.vapidPublicKey` returns null until S12 (push
 *   subscription save + VAPID keys are S12's; the client enable flow surfaces
 *   the webapp's exact "not configured" error, today's behavior without the
 *   VAPID env).
 *
 * NOTE — fragment implements FRAGMENT: the `prefs:` composition line for
 * apps/api/src/router.ts lives in docs/plans/slices/s7-s11-wiring.md.
 */
import { implement, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { user } from "@actionamp/domain/db";
import { isEntitled } from "@actionamp/domain/billing";
import {
  prefsContract,
  TODAY_CAP_MIN,
  TODAY_CAP_MAX,
  FOCUS_SESSION_OPTIONS,
} from "@actionamp/contract";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(prefsContract).$context<ApiContext>();

/** `24h HH:mm` — the webapp's TIME_RE (notifications/operations.ts). */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The webapp's cleanName: trimmed, required, ≤ 120 chars. */
function cleanName(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  if (trimmed.length > 120) {
    throw new Error(`${fieldName} must be 120 characters or fewer.`);
  }
  return trimmed;
}

/** Core `Error`s are user-facing validation messages — rethrown as oRPC
 *  BAD_REQUEST so the message reaches the client like HttpError(400) did. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && !(err instanceof ORPCError)) {
      throw new ORPCError("BAD_REQUEST", { message: err.message });
    }
    throw err;
  }
}

const updateProfile = ORPC.updateProfile.handler(async ({ context, input }) =>
  guard(async () => {
    const acting = requireUser(context);
    const fullName = cleanName(input.fullName, "Name");
    const preferredName = cleanName(input.preferredName, "Call me");
    // firstName recomputed from the new fullName (webapp parity).
    const firstName = fullName.split(/\s+/)[0] ?? fullName;
    const rows = await context.db
      .update(user)
      .set({ fullName, firstName, preferredName })
      .where(eq(user.id, acting.id))
      .returning({ fullName: user.fullName, firstName: user.firstName });
    const row = rows[0];
    if (!row) throw new ORPCError("NOT_FOUND", { message: "User not found." });
    return { fullName: row.fullName, firstName: row.firstName, preferredName };
  }),
);

const getAccount = ORPC.getAccount.handler(async ({ context }) => {
  const acting = requireUser(context);
  // Email is NOT on the User row (it lives in AuthIdentity) — the session's
  // identity email rides the acting user; PAT callers get null.
  const rows = await context.db
    .select({
      fullName: user.fullName,
      firstName: user.firstName,
      preferredName: user.preferredName,
      plan: user.plan,
      planRenewsAt: user.planRenewsAt,
      isAdmin: user.isAdmin,
      manualAccessGrant: user.manualAccessGrant,
    })
    .from(user)
    .where(eq(user.id, acting.id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ORPCError("NOT_FOUND", { message: "User not found." });
  return {
    email: acting.email ?? null,
    fullName: row.fullName,
    firstName: row.firstName,
    preferredName: row.preferredName ?? null,
    plan: row.plan,
    entitled: isEntitled(row.plan, row.planRenewsAt, row.isAdmin, row.manualAccessGrant),
  };
});

const getPreferences = ORPC.getPreferences.handler(async ({ context }) => {
  const acting = requireUser(context);
  const rows = await context.db
    .select({
      todayCap: user.todayCap,
      focusSessionMinutes: user.focusSessionMinutes,
      todayReviewEnabled: user.todayReviewEnabled,
      weekReviewEnabled: user.weekReviewEnabled,
      monthReviewEnabled: user.monthReviewEnabled,
      timeZone: user.timeZone,
    })
    .from(user)
    .where(eq(user.id, acting.id))
    .limit(1);
  const row = rows[0];
  return {
    todayCap: row?.todayCap ?? 5,
    focusSessionMinutes: row?.focusSessionMinutes === 45 ? (45 as const) : (25 as const),
    reviewPreferences: {
      today: row?.todayReviewEnabled ?? true,
      week: row?.weekReviewEnabled ?? true,
      month: row?.monthReviewEnabled ?? true,
    },
    timeZone: row?.timeZone ?? "UTC",
  };
});

const saveTodayCap = ORPC.saveTodayCap.handler(async ({ context, input }) =>
  guard(async () => {
    const acting = requireUser(context);
    if (
      !Number.isInteger(input.todayCap) ||
      input.todayCap < TODAY_CAP_MIN ||
      input.todayCap > TODAY_CAP_MAX
    ) {
      throw new Error(
        `Today cap must be a whole number between ${TODAY_CAP_MIN} and ${TODAY_CAP_MAX}.`,
      );
    }
    await context.db
      .update(user)
      .set({ todayCap: input.todayCap })
      .where(eq(user.id, acting.id));
    return { ok: true as const };
  }),
);

const saveFocusSessionMinutes = ORPC.saveFocusSessionMinutes.handler(
  async ({ context, input }) =>
    guard(async () => {
      const acting = requireUser(context);
      // SAFETY: the closed set is also zod-enforced by the contract input.
      if (!FOCUS_SESSION_OPTIONS.includes(input.minutes)) {
        throw new Error("Focus session must be 25 or 45 minutes.");
      }
      await context.db
        .update(user)
        .set({ focusSessionMinutes: input.minutes })
        .where(eq(user.id, acting.id));
      return { ok: true as const };
    }),
);

const saveReviewPreferences = ORPC.saveReviewPreferences.handler(
  async ({ context, input }) =>
    guard(async () => {
      const acting = requireUser(context);
      // Parity guard (the contract's zod already admits booleans only).
      if (
        typeof input.today !== "boolean" ||
        typeof input.week !== "boolean" ||
        typeof input.month !== "boolean"
      ) {
        throw new Error("Review preferences must be true or false.");
      }
      await context.db
        .update(user)
        .set({
          todayReviewEnabled: input.today,
          weekReviewEnabled: input.week,
          monthReviewEnabled: input.month,
        })
        .where(eq(user.id, acting.id));
      return { ok: true as const };
    }),
);

const saveDailyReminder = ORPC.saveDailyReminder.handler(async ({ context, input }) =>
  guard(async () => {
    const acting = requireUser(context);
    if (!TIME_RE.test(input.time ?? "")) {
      throw new Error("Choose a valid reminder time.");
    }
    const timeZone = input.timeZone?.trim();
    if (!timeZone || timeZone.length > 100) {
      throw new Error("Could not determine device time zone.");
    }
    // Back-fill the account zone once; a saved device zone always wins.
    const rows = await context.db
      .select({ timeZone: user.timeZone })
      .from(user)
      .where(eq(user.id, acting.id))
      .limit(1);
    await context.db
      .update(user)
      .set({
        dailyReminderEnabled: Boolean(input.enabled),
        dailyReminderTime: input.time,
        dailyReminderTimeZone: timeZone,
        timeZone: rows[0]?.timeZone ?? timeZone,
      })
      .where(eq(user.id, acting.id));
    return { ok: true as const };
  }),
);

const getNotificationPreferences = ORPC.getNotificationPreferences.handler(
  async ({ context }) => {
    const acting = requireUser(context);
    const rows = await context.db
      .select({
        dailyReminderEnabled: user.dailyReminderEnabled,
        dailyReminderTime: user.dailyReminderTime,
        dailyReminderTimeZone: user.dailyReminderTimeZone,
      })
      .from(user)
      .where(eq(user.id, acting.id))
      .limit(1);
    const row = rows[0];
    return {
      dailyReminderEnabled: row?.dailyReminderEnabled ?? false,
      dailyReminderTime: row?.dailyReminderTime ?? "09:00",
      dailyReminderTimeZone: row?.dailyReminderTimeZone ?? "UTC",
      // S12 owns the VAPID keys (and savePushSubscription); null keeps the
      // client's enable flow on the webapp's "not configured" error string.
      vapidPublicKey: null,
    };
  },
);

/** The implemented prefs fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s7-s11-wiring.md). */
export const prefsProcedures = {
  updateProfile,
  getAccount,
  getPreferences,
  saveTodayCap,
  saveFocusSessionMinutes,
  saveReviewPreferences,
  saveDailyReminder,
  getNotificationPreferences,
};
