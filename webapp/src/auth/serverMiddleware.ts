/**
 * Global Express middleware customization.
 *
 * Wired via app({ server: { middlewareConfigFn } }) in main.wasp.ts.
 * Wasp calls this once at startup with the default middleware Map (helmet,
 * cors, logger, express.json, express.urlencoded, cookieParser) and uses the
 * returned Map values — in insertion order — as the global stack.
 *
 * We do two things here:
 *
 * 1. Replace the default cors with a credentials-aware variant. Wasps default
 *    cors middleware does NOT set Access-Control-Allow-Credentials, which means
 *    the browser blocks any credentialed (credentials include) cross-origin
 *    fetch. Every session-authed route the React client calls cross-origin
 *    needs the session cookie — so credentials must be allowed. This is a
 *    global concern (it benefits every /api/* + /operations/* route), not a
 *    per-route one: a per-route middlewareConfigFn can't handle the OPTIONS
 *    preflight because Express method-specific routes do not match OPTIONS.
 *
 *    Security: we reuse Wasp's config.allowedCORSOrigins (the configured web
 *    client origin in prod; match-anything in dev). The only change is adding
 *    credentials true. The origin check is unchanged; an attacker origin
 *    still gets no Access-Control-Allow-Origin header.
 *
 * 2. Register two session-cookie handlers (see sessionCookie.ts for the why):
 *    - sessionCookieAuth — must run after cookieParser (it reads req.cookies)
 *       and before Wasp's built-in auth (it synthesizes the Authorization
 *       header that auth consumes).
 *    - sessionCookieWrite — sets/clears/refreshes the cookie.
 *
 * Note: the manifest file is served from the client service (app.actionamp.com),
 * a static host that this Express server does not touch.
 */
import cors from "cors";
import express from "express";
import type { MiddlewareConfigFn } from "wasp/server";
import { config } from "wasp/server";
import {
  attachSessionFromCookie,
  sessionCookieWriteMiddleware,
} from "./sessionCookie";

export const globalMiddlewareConfigFn: MiddlewareConfigFn = (
  middlewareConfig,
) => {
  // Android image shares travel through the normal Wasp action as base64.
  // Keep the limit bounded: client code accepts one image up to 5 MB, which
  // expands to roughly 6.7 MB in JSON.
  middlewareConfig.delete("express.json");
  middlewareConfig.set("express.json", express.json({ limit: "8mb" }));

  // Replace the default cors with a credentials-aware variant (same origin
  // allowlist, adds credentials true). See the file header for why this is
  // global, not per-route.
  middlewareConfig.delete("cors");
  middlewareConfig.set(
    "cors",
    cors({ origin: config.allowedCORSOrigins, credentials: true }),
  );

  // Insertion order matters: this runs after cookieParser (already in the
  // default Map) and before Wasp's per-route auth handler (not in this Map).
  middlewareConfig.set("sessionCookieAuth", attachSessionFromCookie);
  middlewareConfig.set("sessionCookieWrite", sessionCookieWriteMiddleware);
  return middlewareConfig;
};
