/**
 * Global Express middleware customization.
 *
 * Wired via `app({ server: { middlewareConfigFn } })` in `main.wasp.ts`.
 * Wasp calls this once at startup with the default middleware Map (helmet,
 * cors, logger, express.json, express.urlencoded, cookieParser) and uses the
 * returned Map's values — in insertion order — as the global stack.
 *
 * We register two session-cookie handlers (see `sessionCookie.ts` for the why):
 *   1. `sessionCookieAuth` — must run after `cookieParser` (it reads
 *      `req.cookies`) and before Wasp's built-in `auth` (it synthesizes the
 *      Authorization header that `auth` consumes). The global Map runs
 *      before the per-route `auth` handler, so any slot here satisfies that.
 *   2. `sessionCookieWrite` — sets/clears/refreshes the cookie. Order-agnostic
 *      relative to the other globals; it hooks `res.on("finish")`.
 *
 * Note: the manifest file is served from the *client* service (app.actionamp.com),
 * a static host that this Express server doesn't touch. We fixed the manifest
 * MIME issue by renaming the file to manifest.json (Hikari's MIME table knows
 * .json → application/json) rather than trying to patch headers here.
 */
import type { MiddlewareConfigFn } from "wasp/server";
import {
  attachSessionFromCookie,
  sessionCookieWriteMiddleware,
} from "./sessionCookie";

export const globalMiddlewareConfigFn: MiddlewareConfigFn = (
  middlewareConfig,
) => {
  // Insertion order matters: this runs after cookieParser (already in the
  // default Map) and before Wasp's per-route `auth` handler (not in this Map).
  middlewareConfig.set("sessionCookieAuth", attachSessionFromCookie);
  middlewareConfig.set("sessionCookieWrite", sessionCookieWriteMiddleware);
  return middlewareConfig;
};
