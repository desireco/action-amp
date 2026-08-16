/**
 * Cookie/session auth for `/api/*` routes that cannot use Wasp's per-route
 * `auth: true` handler — primarily `<img>` requests (browser image loads
 * cannot set an Authorization header; they rely on the wasp_session cookie).
 *
 * Why a separate middleware: Wasp composes `auth: true` API routes as
 * `[auth, ...globalMiddleware]` — its auth handler runs BEFORE every
 * middlewareConfigFn entry, so it can never see the Authorization header
 * that the session-cookie lift (attachSessionFromCookie) would synthesize
 * later in the same stack. Routes using this middleware declare `auth: false`
 * and validate themselves; inside that route's stack the lift DOES run first
 * (global stack order: cookieParser → sessionCookieAuth lift → this).
 *
 * Storage contract (schema-level, verified against Wasp 0.25 / Lucia):
 * `Session.id` holds the session token VERBATIM (no hashing);
 * `Session.userId` → `Auth.id`; `Auth.userId` → `User.id`.
 */
import type { Request, Response, NextFunction } from "express";
import type { MiddlewareConfigFn } from "wasp/server";
import { prisma } from "wasp/server";
import { attachSessionFromCookie } from "./sessionCookie";

// Re-exported for route middleware composers (shareRouteMiddleware).
export { attachSessionFromCookie };

export interface SessionAuth {
  userId: string;
}

// Attach the middleware's resolved user to Express's Request so reads and
// writes are cast-free (same pattern as patMiddleware's patUser).
declare module "express-serve-static-core" {
  interface Request {
    sessionAuth?: SessionAuth;
  }
}

/** The user a sessionAuthMiddleware-equipped route authenticated, if any. */
export function getSessionAuth(req: Request): SessionAuth | undefined {
  return req.sessionAuth;
}

async function resolveSessionAuth(req: Request): Promise<SessionAuth | null> {
  const header = req.headers.authorization;
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: token },
    select: {
      expiresAt: true,
      auth: { select: { userId: true } },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  // Auth.userId is nullable at the schema level (orphaned Auth rows), but a
  // session pointing at one authenticates nobody.
  const userId = session.auth.userId;
  if (!userId) return null;
  return { userId };
}

/**
 * Route middleware: 401 without a valid session token (from the
 * wasp_session cookie via the lift, or a direct Authorization header);
 * otherwise attaches `req.sessionAuth` and continues.
 */
export function sessionAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  resolveSessionAuth(req)
    .then((auth) => {
      if (!auth) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      req.sessionAuth = auth;
      next();
    })
    .catch((err) => {
      console.error("[sessionAuth] lookup failed:", err);
      res.status(500).json({ error: "Could not authenticate." });
    });
}

/**
 * middlewareConfigFn for cookie-authenticated API routes (`auth: false`).
 * Re-asserts the cookie lift (in case a future default stack drops it) and
 * appends the session check after it.
 */
export const sessionRouteAuthMiddleware: MiddlewareConfigFn = (
  middlewareConfig,
) => {
  middlewareConfig.set("sessionCookieAuth", attachSessionFromCookie);
  middlewareConfig.set("sessionAuth", sessionAuthMiddleware);
  return middlewareConfig;
};
