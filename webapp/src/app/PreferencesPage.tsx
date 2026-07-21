import { useEffect, useState } from "react";
import { useQuery, getNotificationPreferences, saveDailyReminder, savePushSubscription } from "wasp/client/operations";
import { SettingsLayout } from "./SettingsLayout";
import { Field } from "./Field";
import { Chip } from "../components/ui";
import "./Field.css";
import "./PreferencesPage.css";
import { supportsPushNotifications, urlBase64ToUint8Array } from "../notifications/client";

/**
 * Preferences — app behavior. Theme toggle is live (wired to [data-theme] +
 * localStorage); the rest are stubbed with "soon" chips until their features
 * ship, per the honesty-over-fake-toggles principle.
 */

const TODAY_CAP_DEFAULT = 5;

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
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [notificationStatus, setNotificationStatus] = useState<"idle" | "saving" | "error">("idle");
  const [notificationError, setNotificationError] = useState<string | null>(null);

  useEffect(() => {
    if (!notificationPrefs) return;
    setReminderEnabled(notificationPrefs.dailyReminderEnabled);
    setReminderTime(notificationPrefs.dailyReminderTime);
  }, [notificationPrefs]);

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
          description={`Limit Today to ${TODAY_CAP_DEFAULT} items. Forces the "what actually matters" decision.`}
        >
          <Chip variant="muted" small>soon</Chip>
        </Field>
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
