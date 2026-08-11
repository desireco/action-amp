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

function deviceClass(): "mobile" | "tablet" | "desktop" {
  const ua = navigator.userAgent;
  // iPadOS can present a desktop-like Macintosh UA; touch points distinguish it.
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
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
    deviceClass: deviceClass(),
  }).catch(() => {
    // Analytics must never interrupt product work.
  });
}

export function getAnalyticsVisitorId() {
  return visitorId();
}
