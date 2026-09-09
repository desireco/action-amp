// Legacy-path redirects for the deployed single-service image.
//
// /app was the old-webapp authed prefix and /do was the pre-flatten app home;
// stale links (bookmarks, sent emails) still hit both. The redirects mirror
// web/src/routes/{app,do}/+server.ts — but the web build is a static SPA
// (adapter-static drops +server endpoints entirely), so in production only
// the server can answer them. Mounted from index.ts ABOVE the SPA catch-all:
// without it Hono serves the shell for /app and /do/…, the client router
// finds no page route, and the user lands on the 404 card instead of home.
import { Hono } from "hono";

export function createLegacyRedirectRoutes() {
  const app = new Hono();

  // /app → home (matches web/src/routes/app/+server.ts: exact match, no
  // subpath forwarding — that route's deliberate choice).
  app.get("/app", (c) => c.redirect("/", 307));

  // /do → home; /do/<path>?<q> → /<path>?<q> (the flatten redirects —
  // /do/today/x → /today/x — query string rides, same as the +server.ts).
  app.get("/do", (c) => c.redirect("/", 307));
  app.get("/do/*", (c) => {
    const url = new URL(c.req.url);
    return c.redirect(url.pathname.slice("/do".length) + url.search, 307);
  });

  return app;
}
