import { useEffect } from "react";

const PROJECT_ID = "13339807";
const SECURITY_CODE = "f345783e";
const SCRIPT_ID = "actionamp-statcounter";
type StatCounterQueue = Array<{ tags: Record<string, string> }> & { record_pageview?: () => void };

const ALLOWED_EVENTS = new Set(["landing_view", "signup_complete", "app_first_open", "checkout_started"]);

/** Record one of the four anonymous observability milestones as a StatCounter
 * custom-tagged pageview. Never pass identity, task content, or account data. */
export function trackStatCounterEvent(event: string, surface?: string, plan?: string) {
  if (import.meta.env.DEV || !ALLOWED_EVENTS.has(event)) return;
  const tags: Record<string, string> = { event };
  if (surface) tags.surface = surface.slice(0, 40);
  if (plan) tags.plan = plan.slice(0, 40);
  const queue = window._statcounter ?? (window._statcounter = [] as unknown as StatCounterQueue);
  queue.push({ tags });
  if (typeof window._statcounter.record_pageview === "function") window._statcounter.record_pageview();
}

/** Loads StatCounter only in production, keeping local development traffic out. */
export function StatCounter() {
  useEffect(() => {
    if (import.meta.env.DEV || document.getElementById(SCRIPT_ID)) return;

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
