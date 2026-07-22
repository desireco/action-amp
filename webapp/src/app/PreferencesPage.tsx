import { useEffect, useState } from "react";
import {
  useQuery,
  useAction,
  getNotificationPreferences,
  getAppData,
  saveDailyReminder,
  savePushSubscription,
  saveTodayCap,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { SettingsLayout } from "./SettingsLayout";
import { Field } from "./Field";
import { Chip } from "../components/ui";
import { TODAY_CAP_DEFAULT, TODAY_CAP_MIN, TODAY_CAP_MAX } from "./operations";
import "./Field.css";
import "./PreferencesPage.css";
import { supportsPushNotifications, urlBase64ToUint8Array } from "../notifications/client";

/**
 * Preferences — app behavior. Theme toggle is live (wired to [data-theme] +
 * localStorage); the rest are stubbed with "soon" chips until their features
 * ship, per the honesty-over-fake-toggles principle. The Today cap is live
 * (global ceiling, default 5, range 3–12).
 */

export function PreferencesPage() {
  // ---- Theme: live, persisted ----
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("aa-theme") as "light" | "dark" | null;
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const toggleTheme = (next: boolean) => {
    const value = next ? "dark" : "light";
    setTheme(value);
    localStorage.setItem("aa-theme", value);
    document.documentElement.dataset.theme = value;
  };
  const { data: notificationPrefs, refetch: refetchNotifications } = useQuery(getNotificationPreferences);
  const { data: appData } = useQuery(getAppData);
  const queryClient = useQueryClient();
  const saveCapAction = useAction(saveTodayCap);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [notificationStatus, setNotificationStatus] = useState<"idle" | "saving" | "error">("idle");
  const [notificationError, setNotificationError] = useState<string | null>(null);

  useEffect(() => {
    if (!notificationPrefs) return;
    setReminderEnabled(notificationPrefs.dailyReminderEnabled);
    setReminderTime(notificationPrefs.dailyReminderTime);
  }, [notificationPrefs]);

  // ---- Today cap (global, user-tunable) ----
  const storedCap = appData?.todayCap ?? TODAY_CAP_DEFAULT;
  const [draftCap, setDraftCap] = useState<number>(storedCap);
  const [capStatus, setCapStatus] = useState<"idle" | "saving" | "error">("idle");
  const [capError, setCapError] = useState<string | null>(null);
  const capDirty = draftCap !== storedCap;

  useEffect(() => {
    // Sync local draft when the server value changes (first load, post-save
    // invalidation, or a change made elsewhere).
    setDraftCap(storedCap);
  }, [storedCap]);

  async function commitCap(value: number) {
    const clamped = Math.max(TODAY_CAP_MIN, Math.min(TODAY_CAP_MAX, Math.round(value)));
    setDraftCap(clamped);
    if (clamped === storedCap) return;
    setCapStatus("saving");
    setCapError(null);
    try {
      await saveCapAction({ todayCap: clamped });
      await queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      await queryClient.invalidateQueries({ queryKey: ["getTodayTasks"] });
      setCapStatus("idle");
    } catch (error) {
      setCapStatus("error");
      setCapError(error instanceof Error ? error.message : "Could not save Today cap.");
    }
  }

  async function setDailyReminder(enabled: boolean, time = reminderTime) {
    setNotificationStatus("saving");
    setNotificationError(null);
    try {
      if (enabled) {
        if (!supportsPushNotifications()) throw new Error("This browser does not support push notifications.");
        if (!notificationPrefs?.vapidPublicKey) throw new Error("Notifications are not configured on this ActionAmp server yet.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notification permission was not granted.");
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(notificationPrefs.vapidPublicKey),
        });
        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Could not create notification subscription.");
        await savePushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
      }
      await saveDailyReminder({
        enabled,
        time,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setReminderEnabled(enabled);
      setNotificationStatus("idle");
      await refetchNotifications();
    } catch (error) {
      setNotificationStatus("error");
      setNotificationError(error instanceof Error ? error.message : "Could not update reminders.");
    }
  }

  // The rest are not yet wired (their features ship later).
  return (
    <SettingsLayout>
      <section className="aa-settings-section">
        <h2 className="aa-settings-sh">Appearance</h2>
        <Field
          label="Dark mode"
          description="Switch the app to a dark theme. Respects your system setting on first visit."
          toggle={{ checked: theme === "dark", onChange: toggleTheme }}
        />
      </section>

      <section className="aa-settings-section">
        <h2 className="aa-settings-sh">Today</h2>
        <Field
          label="Today cap"
          description={`Today is global across lenses. Cap the day's commitment between ${TODAY_CAP_MIN} and ${TODAY_CAP_MAX}. Default ${TODAY_CAP_DEFAULT}.`}
        >
          <div className="aa-settings-stepper" role="group" aria-label="Today cap">
            <button
              type="button"
              className="aa-settings-stepper__btn"
              onClick={() => void commitCap(draftCap - 1)}
              disabled={draftCap <= TODAY_CAP_MIN || capStatus === "saving"}
              aria-label="Decrease Today cap"
            >
              −
            </button>
            <input
              className="aa-settings-stepper__value"
              type="number"
              inputMode="numeric"
              min={TODAY_CAP_MIN}
              max={TODAY_CAP_MAX}
              step={1}
              value={draftCap}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                setDraftCap(Number.isFinite(n) ? n : storedCap);
              }}
              onBlur={(e) => void commitCap(Number.parseInt(e.target.value, 10) || storedCap)}
              disabled={capStatus === "saving"}
              aria-label="Today cap value"
            />
            <button
              type="button"
              className="aa-settings-stepper__btn"
              onClick={() => void commitCap(draftCap + 1)}
              disabled={draftCap >= TODAY_CAP_MAX || capStatus === "saving"}
              aria-label="Increase Today cap"
            >
              +
            </button>
            {capDirty && capStatus !== "saving" && (
              <button
                type="button"
                className="aa-settings-stepper__save"
                onClick={() => void commitCap(draftCap)}
              >
                Save
              </button>
            )}
            {capStatus === "saving" && <Chip variant="muted" small>saving…</Chip>}
          </div>
        </Field>
        {capError && <p className="aa-settings-error">{capError}</p>}
        <Field
          label="Daily Today reminder"
          description="One quiet nudge at your chosen local time. It opens Today, Next, or Capture."
          toggle={{ checked: reminderEnabled, onChange: (next) => void setDailyReminder(next), disabled: notificationStatus === "saving" }}
        />
        {reminderEnabled && (
          <Field label="Reminder time" description="Uses this device's current time zone.">
            <input
              className="aa-settings-input"
              type="time"
              value={reminderTime}
              onChange={(event) => {
                setReminderTime(event.target.value);
              }}
              onBlur={() => void setDailyReminder(true)}
              disabled={notificationStatus === "saving"}
            />
          </Field>
        )}
        {notificationError && <p className="aa-settings-error">{notificationError}</p>}
      </section>

      <section className="aa-settings-section">
        <h2 className="aa-settings-sh">Feedback</h2>
        <Field
          label="Completion sounds"
          description="A soft sound when you complete a task. Off by default."
        >
          <Chip variant="muted" small>soon</Chip>
        </Field>
        <Field
          label="Momentum"
          description="A light 'X done today' counter. No badges, no guilt trips."
        >
          <Chip variant="muted" small>soon</Chip>
        </Field>
      </section>
    </SettingsLayout>
  );
}
