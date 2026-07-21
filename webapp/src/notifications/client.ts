import { useCallback, useEffect, useState } from "react";

export function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // This worker does not cache app assets or data, so registration is safe in
  // local dev too (and lets notification settings be tested before deploy).
  void navigator.serviceWorker.register("/service-worker.js");
}

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * Detect when a new service worker has been downloaded and is waiting to
 * activate, and expose an action to apply it.
 *
 * Flow:
 *   1. Browser fetches a new /service-worker.js on navigation (byte-differs).
 *   2. New worker installs but stays waiting (the SW doesn't self-activate;
 *      see service-worker.js header comment).
 *   3. updatefound fires → we track the installing worker's state → once
 *      "installed" and a controller already exists, we surface the banner.
 *   4. User clicks Refresh → applyUpdate posts {type: "SKIP_WAITING"}.
 *   5. SW activates → controllerchange fires → we reload into the new build.
 *
 * Also catches the case where a worker was already waiting before the page
 * loaded (getRegistration + check .waiting), so a tab reopened after a
 * deploy still prompts.
 */
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Catch a worker that was already waiting from a previous load.
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) setUpdateAvailable(true);
    });

    // Catch a worker that goes waiting during this session.
    navigator.serviceWorker.register("/service-worker.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          // navigator.serviceWorker.controller is null on first-ever install
          // (no previous worker controlled the page) — that's an initial
          // activation, not an update, so we don't prompt for it.
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    }).catch(() => {
      // SW registration failure is non-fatal — push and update-prompting are
      // both best-effort features; the app works without a registered SW.
    });

    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  }, []);

  return { updateAvailable, applyUpdate };
}
