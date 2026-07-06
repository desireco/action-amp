/**
 * Middleware config for the public Founding 100 status endpoint.
 *
 * Wasp's global CORS allows only the WASP_WEB_CLIENT_URL origin (app.actionamp.com),
 * which blocks the Astro marketing site (actionamp.com) from fetching the live
 * spots-remaining count. This widens CORS for this one endpoint only — it's
 * public (auth: false) and returns PII-free data ({cap, claimed, remaining,
 * isFull}), so a permissive CORS policy is safe here.
 *
 * NB: we use a dedicated header-writing middleware rather than overriding the
 * 'cors' middleware entry, so the allowed-origin list is explicit and obvious.
 */
import type { MiddlewareConfigFn } from "wasp/server";

// The marketing origin that needs to read this endpoint. Trailing slash
// stripped to match the Origin header form.
const MARKETING_ORIGIN = "https://actionamp.com";

export const publicStatusMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  middlewareConfig.set("corsApex", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin === MARKETING_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", MARKETING_ORIGIN);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      // Cache-Control is set by the handler; expose it to the browser.
      res.setHeader("Access-Control-Expose-Headers", "Cache-Control");
    }
    // Handle CORS preflight (OPTIONS) short-circuit.
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });
  return middlewareConfig;
};
