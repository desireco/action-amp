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
 *   2. `sessionCookieWriteMiddleware` — wraps `res.end` so the cookie lands
 *      before headers flush:
 *        - On `/auth/login` 200: writes the cookie (httpOnly, sameSite=lax).
 *        - On `/auth/logout`: clears it.
 *        - On any authenticated request with `req.sessionId`: re-stamps the
 *          cookie with a fresh 30-day maxAge → sliding expiration.
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

// Wasp's auth middleware assigns the Lucia session id at runtime (null for
// tokenless requests — see the generated SDK's core/auth.ts); this
// augmentation makes the read below cast-free.
declare module "express-serve-static-core" {
  interface Request {
    sessionId?: string | null;
  }
}

/** A JSON value as JSON.parse produces it (concrete arms only). */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Pull `{ sessionId }` out of a parsed login response body. */
function sessionIdFromBody(body: Json): string | undefined {
  if (!(body instanceof Object) || Array.isArray(body)) return undefined;
  const id = body.sessionId;
  // JSON.parse only produces primitive strings, so constructor identity is
  // an exact string test here.
  return id?.constructor === String ? id : undefined;
}

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
 * Safe to mount anywhere: it reads `req.cookies` when a cookie parser has
 * already run (the global middleware Map position) and falls back to parsing
 * the raw `Cookie` header (the app-root position, where no parser has run
 * yet — see serverSetupFn in serverMiddleware.ts for why the root position
 * exists).
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

  const cookieValue = readSessionCookie(req);
  if (cookieValue) {
    req.headers.authorization = `Bearer ${cookieValue}`;
  }
  next();
}

function readSessionCookie(req: Request): string | undefined {
  // cookie-parser types its values as strings; absent/empty falls through to
  // the raw-header parse below.
  const parsed = req.cookies?.[SESSION_COOKIE_NAME];
  if (parsed && parsed.length > 0) return parsed;
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE_NAME) continue;
    const raw = part.slice(eq + 1).trim();
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/**
 * Write side: set/clear/refresh the cookie.
 *
 * The cookie must be stamped BEFORE the response's headers go out, so this
 * wraps `res.end` (every Express response path — json/send/redirect — funnels
 * through it) instead of listening on `finish`, which fires after the headers
 * are already on the wire and would make `res.cookie()` a silent no-op.
 *
 * When to write:
 *   - On `/auth/logout`: always clear.
 *   - On `/auth/*login` 2xx: the response body is `{ sessionId }` (Wasp's own
 *     shape) — parse it and stamp the cookie. The `auth` middleware doesn't
 *     run on login routes, so `req.sessionId` is not available there.
 *   - On any other authenticated 2xx (`req.sessionId` set by Wasp's `auth`
 *     middleware): re-stamp with a fresh 30-day maxAge → sliding expiration.
 *     As long as you open the app at least once every 30 days, you stay
 *     logged in indefinitely. Server-side Lucia also does half-life renewal,
 *     so the two layers stay in sync.
 */
export function sessionCookieWriteMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Pass-through end(): keep the original overloads opaque so chunk/callback
  // forms all survive untouched.
  // SAFETY: res.end's overloaded signature is opaque to a wrapper — bind and
  // forward args verbatim; every call shape reaches the original untouched.
  const originalEnd = res.end.bind(res) as (...args: never[]) => void;
  let cookieHandled = false;

  // SAFETY: same overload-opacity reason as originalEnd — the replacement
  // forwards everything it receives to the bound original.
  res.end = ((...args: never[]) => {
    if (!cookieHandled) {
      cookieHandled = true;
      try {
        stampSessionCookie(req, res, args[0]);
      } catch {
        // The cookie is a fallback on top of the Bearer token; a failed write
        // must never break the response itself.
      }
    }
    return originalEnd(...args);
  }) as typeof res.end;

  next();
}

function stampSessionCookie(
  req: Request,
  res: Response,
  chunk: string | Buffer | undefined,
): void {
  // Assigned by Wasp's auth middleware (see the Request augmentation above).
  const sessionId = req.sessionId;
  // This middleware also runs inside mounted routers ("/auth", "/operations"),
  // where Express strips the mount prefix — match by suffix so both the full
  // ("/auth/email/login") and stripped ("/email/login") forms are covered.
  const path = req.path;
  const isLogin = path.endsWith("/login");
  const isLogout = path.endsWith("/logout");

  // Logout always clears, regardless of status — losing the cookie on a
  // failed logout request is harmless (the client also clears localStorage).
  if (isLogout) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return;
  }

  const ok = res.statusCode >= 200 && res.statusCode < 300;
  if (!ok) return;

  if (isLogin) {
    // Wasp's login handlers return { sessionId } as JSON. `chunk` is the
    // serialized body on the first end() call.
    let loginSessionId: string | undefined;
    if (chunk !== undefined) {
      try {
        const body = JSON.parse(
          Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk,
        );
        loginSessionId = sessionIdFromBody(body);
      } catch {
        // Non-JSON body (e.g. a redirect) — nothing to stamp.
      }
    }
    if (loginSessionId) {
      res.cookie(SESSION_COOKIE_NAME, loginSessionId, cookieOptions());
    }
    return;
  }

  // Sliding refresh on every other authenticated request.
  if (sessionId) {
    res.cookie(SESSION_COOKIE_NAME, sessionId, cookieOptions());
  }
}
