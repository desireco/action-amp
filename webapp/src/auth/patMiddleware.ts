/**
 * Middleware config for PAT-protected `/api/cli/*` routes.
 *
 * Resolves `Authorization: Bearer aa_<token>` → the owning `User`, stamps
 * `ApiKey.lastUsedAt`, and attaches `{ user, apiKeyId }` to `req` for the
 * handler. Missing/revoked/wrong → 401. Modeled on the billing middleware
 * pattern (`statusMiddleware.ts`/`webhookMiddleware.ts`): a
 * `MiddlewareConfigFn` that injects one Express middleware ahead of the
 * handler.
 *
 * Why middleware (not a per-route helper): the handler shouldn't re-derive
 * auth on every CLI route — that's the whole point of the layer. One resolve
 * per request, then the handler just reads `req.user`. The stub `/api/cli/now`
 * proves the contract; cli-package adds more routes behind the same guard.
 *
 * ponytail: `prisma` here is imported lazily so `wasp compile` doesn't try to
 * bundle the DB client into the SDK build. The generated Prisma client lives
 * at `.wasp/out/db` at runtime; importing from `@prisma/client` would couple
 * this file to Wasp's build graph. Instead the middleware resolves via the
 * `context.entities` injected by Wasp — but middleware runs before the
 * handler gets `context`, so we use a standalone Prisma client scoped to this
 * one job. See `create-verified-user.mjs` for the same pattern.
 */
import type { MiddlewareConfigFn } from "wasp/server";
import { PrismaClient } from "@prisma/client";
import { hashToken, looksLikeToken } from "./pat";

// One client per process; reused across requests. Lazily instantiated.
const prisma = new PrismaClient();

// The fields a CLI handler needs from the resolved user. Kept narrow so the
// stub route can call `getTopTask` with the same shape a Wasp op's context
// provides (id + entitlement fields the guards read).
export type PatUser = {
  id: string;
  plan: string;
  planRenewsAt: Date | null;
  isAdmin: boolean;
};

// Augment Express's Request so handlers can read the resolved user without a
// cast. `apiKeyId` is exposed so handlers can attribute usage to a key.
declare module "express-serve-static-core" {
  interface Request {
    patUser?: PatUser;
    patApiKeyId?: string;
  }
}

/**
 * Extract the Bearer token from the Authorization header, or null if absent /
 * malformed. Does NOT validate the token — just parses the header shape.
 */
function readBearerToken(authHeader: unknown): string | null {
  if (typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * The injected middleware. Resolves the PAT or rejects with 401. On success,
 * stamps `lastUsedAt` and attaches the user to `req`.
 */
async function patAuthMiddleware(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): Promise<void> {
  // CORS preflight passes through — the actual request will re-auth.
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const token = readBearerToken(req.headers.authorization);
  if (!token || !looksLikeToken(token)) {
    res.status(401).json({ error: "Missing or malformed bearer token." });
    return;
  }

  let apiKey: { id: string; userId: string } | null = null;
  let user: PatUser | null = null;
  try {
    const hashedToken = hashToken(token);
    // Single round-trip: join ApiKey → User so a missing user can't leave a
    // dangling key resolving to null.
    const row = await prisma.apiKey.findUnique({
      where: { hashedToken },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            id: true,
            plan: true,
            planRenewsAt: true,
            isAdmin: true,
          },
        },
      },
    });
    if (row) {
      apiKey = { id: row.id, userId: row.userId };
      user = row.user;
    }
  } catch (err) {
    // Never leak internals via the auth path; log + 500.
    console.error("[pat] token lookup failed:", err);
    res.status(500).json({ error: "Token lookup failed." });
    return;
  }

  if (!apiKey || !user) {
    // Same response for "wrong token" and "revoked" so an attacker can't tell
    // them apart by probing.
    res.status(401).json({ error: "Invalid or revoked token." });
    return;
  }

  // Stamp lastUsedAt without blocking the response. A failure here is
  // non-fatal — the token still authenticated; we just lose the audit row.
  prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => {
      console.error(`[pat] failed to stamp lastUsedAt for key ${apiKey!.id}:`, err);
    });

  req.patUser = user;
  req.patApiKeyId = apiKey.id;
  next();
}

/**
 * The Wasp middleware config fn. Injects the PAT resolver and removes the
 * session-cookie auth that the global stack registers (`sessionCookieAuth` in
 * `auth/serverMiddleware.ts`). Without the delete, a browser with a valid
 * session cookie could hit `/api/cli/*` without a PAT — defeating the point
 * of the token layer (a CLI route must require a CLI token, not a browser
 * session). We keep helmet/json/etc.; only the cookie path is dropped.
 *
 * Routes using this must also declare `auth: false` in main.wasp.ts —
 * otherwise Wasp adds its per-route session `auth` handler on top, which would
 * reject unauthenticated (no-cookie) CLI requests before our middleware runs.
 */
export const patRouteMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  middlewareConfig.delete("sessionCookieAuth");
  middlewareConfig.delete("sessionCookieWrite");
  middlewareConfig.set("patAuth", patAuthMiddleware);
  return middlewareConfig;
};
