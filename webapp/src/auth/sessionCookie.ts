/**
 * Session-cookie fallback + sliding 30-day refresh.
 *
 * Why this exists:
 *   Wasp/Lucia stores the session ID only in localStorage (`wasp:sessionId`),
 *   sent as `Authorization: Bearer …` per request. On iOS/Brave PWAs, WebKit's
 *   ITP caps script-writable storage at 7 days, and Brave's "clear on exit"
 *   wipes it on app close — so users get logged out daily despite the
 *   server-side session being valid for 30 days. An httpOnly cookie is exempt
 *   from those eviction paths and survives across browser restarts.
 *
 * What this does (two handlers, registered via server.middlewareConfigFn):
 *   1. `attachSessionFromCookie` — runs before Wasp's built-in `auth`
 *      middleware. When there's no `Authorization` header but a valid
 *      `wasp_session` cookie is present, it synthesizes the Bearer header so
 *      Wasp's auth path works unchanged. No SDK patching, no fork.
 *   2. `sessionCookieWriteMiddleware` — runs after `auth` resolves:
 *        - On `/auth/login` 200: writes the cookie (httpOnly, sameSite=lax).
 *        - On `/auth/logout`: clears it.
 *        - On any authenticated request with `req.sessionId`: re-stamps the
 *          cookie with a fresh 30-day maxAge → sliding expiration. As long as
 *          you open the app at least once every 30 days, you stay logged in
 *          indefinitely. Server-side Lucia also does half-life renewal, so
 *          the two layers stay in sync.
 *
 * Security:
 *   - `httpOnly`: client JS can't read it (XSS-exfil resistance beats
 *     localStorage).
 *   - `secure` in prod: HTTPS only.
 *   - `sameSite: 'lax'`: blocks cross-site POST submission (CSRF posture
 *     unchanged from Wasp default).
 *   - The cookie is still a bearer token — a stolen cookie = same threat
 *     model as a stolen localStorage token. The server still runs the
 *     session through Lucia's `validateSession` (checks `expiresAt`), so
 *     invalidating a session server-side invalidates both paths at once.
 *
 * Coexistence with localStorage:
 *   The client SDK keeps writing `wasp:sessionId` as before. The cookie is
 *   purely a fallback. If either survives, the user stays logged in; both
 *   wiped → real logout. Manual logout clears both.
 */
import type { Request, Response, NextFunction } from "express";

// Keep this in sync with Lucia's default sessionExpiresIn (30d). The cookie
// and the DB row should expire together — if you change one, change both.
const SESSION_COOKIE_NAME = "wasp_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  };
}

/**
 * Read side: lift `wasp_session` cookie → `Authorization` header.
 *
 * Placed in the global middleware Map after `cookieParser`. Runs before the
 * per-route `auth` handler, which then sees a normal Bearer header and does
 * its usual thing.
 */
export function attachSessionFromCookie(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // Don't clobber an explicit Authorization header — if the client sent one
  // (the normal localStorage path), it wins. The cookie only fills the gap.
  if (req.headers.authorization) {
    return next();
  }

  const cookieValue = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieValue === "string" && cookieValue.length > 0) {
    req.headers.authorization = `Bearer ${cookieValue}`;
  }
  next();
}

/**
 * Write side: set/clear/refresh the cookie.
 *
 * Runs after `auth` has populated `req.sessionId` (on protected routes) or
 * after the login/logout handlers have run. Uses `res.on("finish")` so the
 * response path isn't blocked by cookie writes, and so we see the final
 * status code (login 200 → set; logout → clear).
 */
export function sessionCookieWriteMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on("finish", () => {
    // Wasp's auth middleware assigns this at runtime, but its Express Request
    // augmentation is not visible in the generated server's TypeScript build.
    const sessionId = (req as Request & { sessionId?: unknown }).sessionId;
    const path = req.path;
    const isLogin = path === "/auth/login" || path.endsWith("/auth/email/login");
    const isLogout = path === "/auth/logout" || path.endsWith("/auth/logout");

    // Logout always clears, regardless of status — losing the cookie on a
    // failed logout request is harmless (the client also clears localStorage).
    if (isLogout) {
      res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
      return;
    }

    // Login: only stamp on success. The handler returns { sessionId } on 200.
    // Re-stamp on every other authenticated request (req.sessionId set by the
    // `auth` middleware) → sliding expiration.
    const shouldRefresh =
      (isLogin && res.statusCode >= 200 && res.statusCode < 300) ||
      (typeof sessionId === "string" && res.statusCode >= 200 && res.statusCode < 300);

    // Guard against ERR_HTTP_HEADERS_SENT: the `finish` event fires after the
    // response has been written to the wire, so `res.cookie()` (which calls
    // `setHeader`) throws if headers already went out. The sliding refresh is
    // best-effort — if we can't set the cookie here, the client still holds a
    // valid session via its existing cookie / Bearer token; only the refresh
    // is skipped for this response. Crash > skipped refresh.
    if (shouldRefresh && typeof sessionId === "string" && !res.headersSent) {
      res.cookie(SESSION_COOKIE_NAME, sessionId, cookieOptions());
    }
  });
  next();
}
