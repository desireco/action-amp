/**
 * Public store — the S15 client (F9a class-singleton pattern): the
 * Founding-100 status read shared by the offer page and the post-checkout
 * welcome page. PII-free global counts; "am I already a founder?" comes from
 * the account read (prefs store), webapp parity (useAuth carried it there).
 */
import { client } from "../api";
import type { Founding100Status } from "@actionamp/contract";

interface PublicClientSlice {
  getFounding100Status(): Promise<Founding100Status>;
}

const rpc = (client as unknown as { public: PublicClientSlice }).public;

class PublicStore {
  founding100Status = $state<Founding100Status | null>(null);

  /** Fetch (or refetch) the live count. Errors leave the previous value —
   *  the page falls back to the static copy (webapp parity). */
  async loadFounding100Status(): Promise<Founding100Status | null> {
    try {
      this.founding100Status = await rpc.getFounding100Status();
    } catch {
      /* keep the previous value / null */
    }
    return this.founding100Status;
  }
}

export const publicStore = new PublicStore();

/**
 * Fire one funnel event at the public ingest (the app-side analogue of the
 * Astro FunnelTracker POST; the webapp's checkout click sent
 * `checkout_started` via trackStatCounterEvent). Best-effort, never awaited
 * by UI flows. Visitor id lives in localStorage
 * `actionamp.analytics.visitor` (Astro parity — same key, so one visitor id
 * spans site + app).
 */
export function trackFunnelEvent(
  name: string,
  metadata?: Record<string, string | number | boolean>,
): void {
  try {
    let visitorId = localStorage.getItem("actionamp.analytics.visitor");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("actionamp.analytics.visitor", visitorId);
    }
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        visitorId,
        route: location.pathname,
        ...(metadata ? { metadata } : {}),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics is best-effort */
  }
}
