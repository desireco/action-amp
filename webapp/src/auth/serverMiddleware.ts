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
 *
 * Implementation note: Wasp's express.static handler runs *after* this
 * middleware and overwrites Content-Type from the file extension. We can't
 * set it inline (static clobbers it) and we can't use res.on("finish")
 * (headers are already flushed by then). So we monkey-patch res.setHeader
 * on this one request: the first Content-Type write from static is
 * overridden with the manifest MIME, then the patch is removed so
 * subsequent setHeader calls behave normally.
 */
function setManifestContentType(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path === "/manifest.webmanifest") {
    const originalSetHeader = res.setHeader.bind(res);
    res.setHeader = ((name: string, value: string | number | readonly string[]) => {
      if (name.toLowerCase() === "content-type") {
        // Override once, then restore the original so a later setHeader
        // (if any) isn't affected.
        res.setHeader = originalSetHeader;
        return originalSetHeader(name, "application/manifest+json; charset=utf-8");
      }
      return originalSetHeader(name, value);
    }) as typeof res.setHeader;
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
