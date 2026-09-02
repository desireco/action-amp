/**
 * Prefs store — the S11 settings data client (F9a class-singleton pattern):
 * the Account tab's profile read/write, the preferences reads/saves, and the
 * notification (daily reminder) prefs. All server contact goes through the
 * client in `../api`.
 *
 * The `PrefsClientSlice` mirrors the contract's prefs procedures structurally
 * (the same bridge the projects store uses): the shared client's type gains
 * `prefs` when the composition line in docs/plans/slices/s7-s11-wiring.md
 * lands; this slice keeps the store typechecking either way.
 */
import { client } from "../api";

export interface Account {
  email: string | null;
  fullName: string;
  firstName: string;
  preferredName: string | null;
  plan: string;
  entitled: boolean;
}

export interface Preferences {
  todayCap: number;
  focusSessionMinutes: 25 | 45;
  reviewPreferences: { today: boolean; week: boolean; month: boolean };
  timeZone: string;
}

export interface NotificationPrefs {
  dailyReminderEnabled: boolean;
  dailyReminderTime: string;
  dailyReminderTimeZone: string;
  /** null until S12 stamps the VAPID key (the enable flow errors then). */
  vapidPublicKey: string | null;
}

/** Today-cap bounds + focus options (webapp app/operations.ts constants). */
export const TODAY_CAP_DEFAULT = 5;
export const TODAY_CAP_MIN = 3;
export const TODAY_CAP_MAX = 12;
export const FOCUS_SESSION_OPTIONS = [25, 45] as const;
export type FocusSessionMinutes = (typeof FOCUS_SESSION_OPTIONS)[number];
export const FOCUS_SESSION_DEFAULT: FocusSessionMinutes = 25;

interface PrefsClientSlice {
  updateProfile(input: {
    fullName: string;
    preferredName: string;
  }): Promise<{ fullName: string; firstName: string; preferredName: string }>;
  getAccount(): Promise<Account>;
  getPreferences(): Promise<Preferences>;
  saveTodayCap(input: { todayCap: number }): Promise<{ ok: true }>;
  saveFocusSessionMinutes(input: { minutes: FocusSessionMinutes }): Promise<{ ok: true }>;
  saveReviewPreferences(input: {
    today: boolean;
    week: boolean;
    month: boolean;
  }): Promise<{ ok: true }>;
  saveDailyReminder(input: {
    enabled: boolean;
    time: string;
    timeZone: string;
  }): Promise<{ ok: true }>;
  getNotificationPreferences(): Promise<NotificationPrefs>;
}

const rpc = (client as unknown as { prefs: PrefsClientSlice }).prefs;

class PrefsStore {
  /** Account tab data (profile + sign-in email + entitlement flag). */
  account = $state<Account | null>(null);
  /** Preferences tab data (cap / focus / reviews / zone). */
  preferences = $state<Preferences | null>(null);
  /** Daily reminder + push key read. */
  notifications = $state<NotificationPrefs | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  async loadAccount(): Promise<Account | null> {
    try {
      this.account = await rpc.getAccount();
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    return this.account;
  }

  async loadPreferences(): Promise<Preferences | null> {
    this.loading = true;
    try {
      this.preferences = await rpc.getPreferences();
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
    return this.preferences;
  }

  async loadNotifications(): Promise<NotificationPrefs | null> {
    try {
      this.notifications = await rpc.getNotificationPreferences();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    return this.notifications;
  }

  async saveProfile(fullName: string, preferredName: string) {
    // Throws on validation error — the page surfaces err.message verbatim.
    return await rpc.updateProfile({ fullName, preferredName });
  }

  async saveTodayCap(todayCap: number) {
    return await rpc.saveTodayCap({ todayCap });
  }

  async saveFocusSessionMinutes(minutes: FocusSessionMinutes) {
    return await rpc.saveFocusSessionMinutes({ minutes });
  }

  async saveReviewPreferences(next: { today: boolean; week: boolean; month: boolean }) {
    return await rpc.saveReviewPreferences(next);
  }

  async saveDailyReminder(enabled: boolean, time: string, timeZone: string) {
    return await rpc.saveDailyReminder({ enabled, time, timeZone });
  }
}

export const prefs = new PrefsStore();

/** The device zone (webapp: Intl.DateTimeFormat().resolvedOptions().timeZone). */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
