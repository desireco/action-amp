/**
 * The public procedures (S15) — the marketing site's DB coupling + the app's
 * public offer surfaces, ported from webapp/src/billing/operations.ts
 * (getFounding100Status + founding100StatusHandler + statusMiddleware.ts) and
 * webapp/src/analytics/eventApi.ts (the FunnelTracker ingest).
 *
 * Three REST routes (mounted in index.ts — see
 * docs/plans/slices/s13-s15-wiring.md) + one oRPC proc:
 *
 * - `GET /founding-100/status` — the Astro marketing site's ONLY coupling to
 *   the DB. Byte-exact payload parity: `{cap, reserved, claimed, remaining,
 *   isFull}` in that key order, `Cache-Control: public, max-age=60`, and CORS
 *   widened for EXACTLY `https://actionamp.com` (GET + OPTIONS preflight,
 *   `Vary: Origin`, Cache-Control exposed). Wasp's global CORS only allowed
 *   the app origin — without the explicit allow-list the Astro site can't
 *   read the live count and the teaser stays hidden. Any other origin gets NO
 *   CORS headers (the fetch fails; the page still works).
 * - `GET /` — the app-subdomain root redirect (webapp RedirectToMarketing):
 *   prod → https://actionamp.com, localhost/127.0.0.1/::1 → /login. On this
 *   stack the WEB app serves the app at /, so the route lives on the API
 *   host — api.actionamp.com/ must not 404 (wiring doc §2).
 * - `POST /api/analytics/event` — the public funnel ingest the Astro
 *   FunnelTracker posts to (visitor id in localStorage
 *   `actionamp.analytics.visitor`). 204 on success; 400
 *   `{error: "Invalid analytics event."}` otherwise (webapp body verbatim).
 *
 * ANALYTICS FIDELITY (deferred — wiring doc §5): the recorder (in
 * publicCore.ts, the testable slice) is the MINIMAL public path — visitor-id
 * session upsert + event insert + the one-time-event dedup — enough for the
 * funnel events to land. The full analytics port (utm attribution on
 * first-seen, session reuse for `user_*` visitors, admin funnel reads) owns
 * the rest; completeOnboarding already routes through this recorder so its
 * events keep the same shape.
 */
import { Hono } from "hono";
import { implement } from "@orpc/server";
import { FOUNDER_MEMBERSHIP_WHERE } from "@actionamp/domain/billing";
import type { DomainDb, Entities } from "@actionamp/domain/db";
import { publicContract } from "@actionamp/contract";
import type { ApiContext } from "../context.js";
import {
  founding100Payload,
  recordPublicAnalyticsEvent,
} from "./publicCore.js";

// ----------------------------------------------------------------
// oRPC — the founding-100 status query (public: no requireUser)
// ----------------------------------------------------------------

const ORPC = implement(publicContract).$context<ApiContext>();

const getFounding100Status = ORPC.getFounding100Status.handler(
  async ({ context }) => {
    // Counted as billed FOUNDER plan OR manual FOUNDER grant, never FRIEND
    // (FOUNDER_MEMBERSHIP_WHERE — billing/config.ts).
    const claimed = await context.entities.User.count({
      where: FOUNDER_MEMBERSHIP_WHERE,
    });
    return founding100Payload(claimed);
  },
);

/** The implemented public fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s13-s15-wiring.md). */
export const publicProcedures = {
  getFounding100Status,
};

// ----------------------------------------------------------------
// The REST fragment (mounted in index.ts)
// ----------------------------------------------------------------

/** The exact marketing origin that reads the status endpoint. No allow-list
 *  entries beyond it — a new origin gets no CORS headers (P0 §5). */
const MARKETING_ORIGIN = "https://actionamp.com";

/** The webapp analyticsMiddleware ORIGINS (verbatim): the marketing site posts
 *  funnel events from actionamp.com, the app posts from app.actionamp.com.
 *  Text/plain posts are "simple requests" and land regardless, but a
 *  JSON-content-type poster preflights — and dies without an ACAO answer. */
const ANALYTICS_ORIGINS = new Set([
  "https://actionamp.com",
  "https://app.actionamp.com",
]);

/** The webapp RedirectToMarketing hostname test (verbatim list). */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

/**
 * Build the REST fragment over the shared seam handles (same db/entities the
 * /rpc mount uses — index.ts calls `app.route("/", createPublicRest({ db,
 * entities }))`). Not a plain `new Hono()` export because the handlers need
 * the request context's seam, and the app's Hono Variables type doesn't
 * carry it.
 */
export function createPublicRest(deps: {
  db: DomainDb;
  entities: Entities;
  /** True when the API serves the built SPA at "/" (single-service deploy) —
   *  the RedirectToMarketing redirect is then skipped: "/" IS the app. */
  serveSpaRedirect?: boolean;
}): Hono {
  const rest = new Hono();

  // CORS for exactly the marketing origin, on this one endpoint (the webapp
  // publicStatusMiddleware, ported). OPTIONS short-circuits 204.
  rest.use("/founding-100/status", async (c, next) => {
    if (c.req.header("origin") === MARKETING_ORIGIN) {
      c.header("Access-Control-Allow-Origin", MARKETING_ORIGIN);
      c.header("Vary", "Origin");
      c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
      // Cache-Control is set by the handler; expose it to the browser.
      c.header("Access-Control-Expose-Headers", "Cache-Control");
    }
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  });

  rest.get("/founding-100/status", async (c) => {
    const claimed = await deps.entities.User.count({
      where: FOUNDER_MEMBERSHIP_WHERE,
    });
    c.header("Cache-Control", "public, max-age=60");
    return c.json(founding100Payload(claimed));
  });

  // The app-host root: same semantics as webapp RedirectToMarketing
  // (client-side there because Wasp served an SPA; a 302 here — wiring doc).
  // SKIPPED when the API serves the built SPA (single-service deploy): "/"
  // is the app home, not a redirect.
  if (!deps.serveSpaRedirect) {
    rest.get("/", (c) => {
      const target = isLocalHost(new URL(c.req.url).hostname)
        ? "/login"
        : "https://actionamp.com";
      return c.redirect(target, 302);
    });
  }

  // The FunnelTracker ingest (public, no PII, never returns event data).
  // CORS per the webapp analyticsMiddleware: the two product origins, on
  // POST + OPTIONS with the Content-Type request header (the marketing site
  // posts cross-origin; the Astro tracker's text/plain body is a simple
  // request, but preflighted posters need the answer).
  rest.use("/api/analytics/event", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && ANALYTICS_ORIGINS.has(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Vary", "Origin");
      c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type");
    }
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    await next();
  });

  rest.post("/api/analytics/event", async (c) => {
    const invalid = () => c.json({ error: "Invalid analytics event." }, 400);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return invalid();
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalid();
    }
    const record = body as Record<string, unknown>;
    const name = record.name;
    const visitorId = record.visitorId;
    if (typeof name !== "string" || typeof visitorId !== "string") {
      return invalid();
    }
    const metadata =
      record.metadata &&
      typeof record.metadata === "object" &&
      !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, string | number | boolean>)
        : null;
    try {
      await recordPublicAnalyticsEvent(
        deps.db,
        {
          name,
          visitorId,
          route: typeof record.route === "string" ? record.route : null,
          appVersion:
            typeof record.appVersion === "string" ? record.appVersion : null,
          metadata,
        },
        null, // public ingest — no acting user on this mount
      );
      return c.body(null, 204);
    } catch {
      return invalid();
    }
  });

  return rest;
}
