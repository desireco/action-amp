/**
 * Global Express middleware customization.
 *
 * Wired via `app({ server: { middlewareConfigFn } })` in `main.wasp.ts`.
 * Wasp calls this once at startup with the default middleware Map (helmet,
 * cors, logger, express.json, express.urlencoded, cookieParser) and uses the
 * returned Map's values — in insertion order — as the global stack.
 *
 * We register three handlers:
 *   1. `manifestContentType` — serves /manifest.webmanifest with the
 *      spec-correct MIME (application/manifest+json). Railway/Hikari's static
 *      MIME table doesn't include `.webmanifest`, so without this Chrome
 *      Android downgrades or skips manifest parsing — breaking WebAPK
 *      installability and the long-press shortcuts menu.
 *   2. `sessionCookieAuth` — must run after `cookieParser` (it reads
 *      `req.cookies`) and before Wasp's built-in `auth` (it synthesizes the
 *      Authorization header that `auth` consumes). The global Map runs
 *      before the per-route `auth` handler, so any slot here satisfies that.
 *   3. `sessionCookieWrite` — sets/clears/refreshes the cookie. Order-agnostic
 *      relative to the other globals; it hooks `res.on("finish")`.
 */
import type { Request, Response, NextFunction } from "express";
import type { MiddlewareConfigFn } from "wasp/server";
import {
  attachSessionFromCookie,
  sessionCookieWriteMiddleware,
} from "./sessionCookie";

/**
 * Set the spec-correct Content-Type on /manifest.webmanifest.
 *
 * Sibling static files (.js, .png) are typed correctly by Hikari; only the
 * `.webmanifest` extension is missing from its MIME table, so Chrome Android
 * sees `text/plain`, refuses to parse the manifest as a manifest, and won't
 * build a true WebAPK — which silently breaks long-press app-icon shortcuts.
 * Override just for this one path.
 */
function setManifestContentType(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path === "/manifest.webmanifest") {
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  }
  next();
}

export const globalMiddlewareConfigFn: MiddlewareConfigFn = (
  middlewareConfig,
) => {
  // Insertion order matters: this runs after cookieParser (already in the
  // default Map) and before Wasp's per-route `auth` handler (not in this Map).
  middlewareConfig.set("manifestContentType", setManifestContentType);
  middlewareConfig.set("sessionCookieAuth", attachSessionFromCookie);
  middlewareConfig.set("sessionCookieWrite", sessionCookieWriteMiddleware);
  return middlewareConfig;
};
