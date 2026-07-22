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

/**
 * Poll /version.json and surface an update when the deployed SHA drifts from
 * the build-time __APP_VERSION__ baked into this bundle.
 *
 * The service-worker path above only fires on navigation (the browser
 * re-fetches /service-worker.js then). A tab left open across a deploy never
 * navigates, so it never prompts. This poll closes that gap: the deployed
 * manifest is written from the same git SHA as __APP_VERSION__ (see
 * vite.config.ts), so a mismatch means a newer build is live.
 *
 * - First check after DEPLOY_CHECK_DELAY_MS, then every DEPLOY_CHECK_INTERVAL_MS.
 * - Pauses while the tab is hidden and re-checks immediately on visibility
 *   return (cheap + battery-friendly).
 * - Non-fatal: a missing file (dev before first vite eval), network error, or
 *   malformed JSON → silent, no banner. Same posture as the SW hook.
 * - AbortController per fetch so unmount or visibility change can't land a
 *   stale setState.
 */
const DEPLOY_CHECK_DELAY_MS = 60_000;
const DEPLOY_CHECK_INTERVAL_MS = 5 * 60_000;

export function useDeployedVersionUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // __APP_VERSION__ is the build-time SHA; "dev" fallback means git was
    // unavailable at build — nothing to compare against, skip the poll.
    if (!__APP_VERSION__ || __APP_VERSION__ === "dev") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: AbortController | undefined;

    const check = async () => {
      abort?.abort();
      abort = new AbortController();
      try {
        const res = await fetch("/version.json", { cache: "no-store", signal: abort.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (cancelled) return;
        if (typeof data.version === "string" && data.version !== __APP_VERSION__) {
          setUpdateAvailable(true);
          return; // stop polling once a pending update is known
        }
      } catch {
        // Network error / abort / malformed JSON — non-fatal, stay silent.
      }
      if (!cancelled) scheduleNext();
    };

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    // First check sooner than the steady-state interval so a tab that just
    // loaded catches a deploy that happened moments ago.
    const start = () => {
      timer = setTimeout(check, DEPLOY_CHECK_DELAY_MS);
    };

    const scheduleNext = () => {
      timer = setTimeout(check, DEPLOY_CHECK_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
      } else {
        // Re-check immediately on return, then resume the interval.
        void check();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearTimer();
      abort?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    // The deployed build differs from the running one — a plain reload pulls
    // the new assets. No service-worker handoff needed on this path.
    window.location.reload();
  }, []);

  return { updateAvailable, applyUpdate };
}
