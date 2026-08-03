import { recordAnalyticsEvent } from "wasp/client/operations";
import type { AnalyticsEventInput } from "./operationsCore";

const VISITOR_KEY = "actionamp.analytics.visitor";
const VISITOR_RE = /^[a-zA-Z0-9_-]+$/;

function visitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing && VISITOR_RE.test(existing)) return existing;
  const value = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(VISITOR_KEY, value);
  return value;
}

export function trackAnalyticsEvent(input: Omit<AnalyticsEventInput, "visitorId">) {
  if (import.meta.env.DEV) return;
  void recordAnalyticsEvent({
    ...input,
    visitorId: visitorId(),
    route: input.route ?? window.location.pathname,
    appVersion: import.meta.env.VITE_APP_VERSION ?? undefined,
    referrerHost: document.referrer ? new URL(document.referrer).hostname : undefined,
    initialPath: window.location.pathname,
    deviceClass: window.matchMedia("(max-width: 768px)").matches ? "mobile" : "desktop",
  }).catch(() => {
    // Analytics must never interrupt product work.
  });
}

export function getAnalyticsVisitorId() {
  return visitorId();
}
