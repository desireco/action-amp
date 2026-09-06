import { useEffect } from "react";

const PROJECT_ID = "13339807";
const SECURITY_CODE = "f345783e";
const SCRIPT_ID = "actionamp-statcounter";
type StatCounterQueue = Array<{ tags: Record<string, string> }> & { record_pageview?: () => void };
type StatCounterTags = { event: string; surface?: string; plan?: string };

const ALLOWED_EVENTS = new Set(["landing_view", "signup_complete", "app_first_open", "checkout_started"]);

export function isLocalStatCounterHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1"
    || normalized === "::1";
}

function statCounterEnabled() {
  return !import.meta.env.DEV && !isLocalStatCounterHost(window.location.hostname);
}

/** Record one of the four anonymous observability milestones as a StatCounter
 * custom-tagged pageview. Never pass identity, task content, or account data. */
export function trackStatCounterEvent(event: string, surface?: string, plan?: string) {
  if (!statCounterEnabled() || !ALLOWED_EVENTS.has(event)) return;
  const tags: StatCounterTags = { event };
  if (surface) tags.surface = surface.slice(0, 40);
  if (plan) tags.plan = plan.slice(0, 40);
  // SAFETY: double/wide assertion needed — runtime shape is verified.
  const queue = window._statcounter ?? (window._statcounter = [] as StatCounterQueue);
  queue.push({ tags });
  window._statcounter.record_pageview?.();
}

/** Loads StatCounter only in production, keeping local development traffic out. */
export function StatCounter() {
  useEffect(() => {
    if (!statCounterEnabled() || document.getElementById(SCRIPT_ID)) return;

    window.sc_project = Number(PROJECT_ID);
    window.sc_invisible = 1;
    window.sc_security = SECURITY_CODE;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://www.statcounter.com/counter/counter.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  return null;
}

declare global {
  interface Window {
    sc_project?: number;
    sc_invisible?: number;
    sc_security?: string;
    _statcounter?: StatCounterQueue;
  }
}
