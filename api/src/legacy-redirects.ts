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

// Old subpaths whose stripped form has no route in the new app — the feature
// either moved or isn't ported. Map them to the nearest living page so a
// stale link never lands on the 404 card. Keys are the STRIPPED paths
// (what's left after /app or /do comes off), so both prefixes share one map.
const REMAPPED: Record<string, string> = {
  // Cadence reviews (Today/Week/Month) aren't ported; the Logbook is the
  // accomplishments surface they built on. Re-point when reviews ship.
  "/review": "/logbook",
  "/review/today": "/logbook",
  "/review/week": "/logbook",
  "/review/month": "/logbook",
  // PAT management became the CLI's OAuth flow (`actionamp login`); no
  // settings page exists — send token managers to the settings hub.
  "/settings/pat": "/settings",
  // The legacy admin settings alias always was a redirect to the dashboard.
  "/settings/admin": "/admin",
};

// Strip a legacy prefix: /do/today/x?q → /today/x?q, /app/inbox → /inbox.
// Remapped paths drop the query (their target page doesn't consume it);
// passthroughs keep it (e.g. ?capture=1, ?task=…).
function stripPrefix(prefix: string) {
  return (path: string, search: string) => {
    const stripped = path.slice(prefix.length) || "/";
    return REMAPPED[stripped] ?? stripped + search;
  };
}

const stripApp = stripPrefix("/app");
const stripDo = stripPrefix("/do");

// 308 = permanent: browsers cache it, so repeat visits of a stale bookmark
// never round-trip. (307 kept the redirect "live" forever for no benefit —
// these paths are retired, the mapping will not change again.)
export function createLegacyRedirectRoutes() {
  const app = new Hono();

  // /app → home; /app/<path> forwards the subpath (the old webapp's
  // LegacyAppRedirectPage forwarded /app/x → /do/x, which now strips).
  app.get("/app", (c) => c.redirect("/", 308));
  app.get("/app/*", (c) => {
    const url = new URL(c.req.url);
    return c.redirect(stripApp(url.pathname, url.search), 308);
  });

  // /do → home; /do/<path>?<q> → /<path>?<q> (the flatten redirects).
  app.get("/do", (c) => c.redirect("/", 308));
  app.get("/do/*", (c) => {
    const url = new URL(c.req.url);
    return c.redirect(stripDo(url.pathname, url.search), 308);
  });

  return app;
}
