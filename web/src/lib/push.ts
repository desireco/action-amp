/**
 * S12 — the Web-Push client utilities (webapp src/notifications/client.ts +
 * the subscribe half of PreferencesPage's enable flow, ported for the new
 * stack). Pure browser code; every failure is the caller's error to show.
 *
 * The enable flow's exact strings (webapp parity — PreferencesPage.tsx):
 *   - "This browser does not support push notifications."
 *   - "Notifications are not configured on this ActionAmp server yet."
 *   - "Notification permission was not granted."
 *   - "Could not create notification subscription."
 */
import { client } from "./api";

/** The notifications slice of the RPC client (structural — see prefs.svelte.ts). */
interface NotificationClientSlice {
  savePushSubscription(input: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<{ ok: true }>;
}

const rpc = (client as unknown as { notifications: NotificationClientSlice }).notifications;

export function supportsPushNotifications(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Register /service-worker.js. The worker caches NOTHING (shared-device
 * privacy), so registration is safe in local dev too — and lets the reminder
 * settings be tested before deploy. Failure is non-fatal: push and the
 * update prompt are best-effort; the app works without a worker.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/service-worker.js").catch(() => {
    // Non-fatal (webapp AppShell parity).
  });
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  // Fresh ArrayBuffer backing — pushManager.subscribe wants BufferSource.
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

/**
 * The enable-flow push half (webapp PreferencesPage.setDailyReminder, the
 * part S11 deferred to S12): permission → subscribe under the waiting worker
 * → savePushSubscription. Throws the webapp's exact strings; the caller then
 * saves the reminder preference via prefs.saveDailyReminder.
 */
export async function enablePushSubscription(vapidPublicKey: string): Promise<void> {
  if (!supportsPushNotifications()) {
    throw new Error("This browser does not support push notifications.");
  }
  if (!vapidPublicKey) {
    throw new Error("Notifications are not configured on this ActionAmp server yet.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  const json = subscription.toJSON();
  const keys = (json as { keys?: { p256dh?: string; auth?: string } }).keys;
  if (!json.endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error("Could not create notification subscription.");
  }
  await rpc.savePushSubscription({
    endpoint: json.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
}

/**
 * The update protocol's client half (webapp useServiceWorkerUpdate, minus the
 * long-tail banner UI): a new worker installs and WAITS (the SW never
 * auto-activates — auto-activating raced the banner and reload-looped installed
 * Android PWAs); applyUpdate() posts SKIP_WAITING from the banner;
 * controllerchange reloads into the new build. Reload-on-controllerchange is
 * wired app-wide in +layout.svelte.
 */
export function applyServiceWorkerUpdate(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.getRegistration().then((reg) => {
    reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
}
