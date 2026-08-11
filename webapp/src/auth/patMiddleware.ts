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
import { hashToken, looksLikeToken } from "./pat";
import { authPrisma as prisma } from "./prisma";
import { cliAccessViolation } from "../billing/entitlements";

// `prisma` is the shared process-level singleton from ./prisma.ts — reused
// across the middleware + all /api/cli/* handlers so concurrent requests
// don't each open their own connection pool.

// The fields a CLI handler needs from the resolved user. Kept narrow so the
// stub route can call `getTopTask` with the same shape a Wasp op's context
// provides (id + entitlement fields the guards read), plus email/fullName for
// the CLI's "Signed in as X" output.
export type PatUser = {
  id: string;
  plan: string;
  planRenewsAt: Date | null;
  isAdmin: boolean;
  manualAccessGrant: "PRO" | "FOUNDER" | "FRIEND" | null;
  email: string | null;
  fullName: string;
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
    // Single round-trip: join ApiKey → User → Auth → AuthIdentity so a missing
    // user can't leave a dangling key resolving to null, AND we get the email
    // (AuthIdentity.providerUserId where providerName="email") for CLI output
    // ("Signed in as <email>"). The email identity is the only login method
    // shipping today (Google disabled — main.wasp.ts:97-101), so taking the
    // first email identity is correct.
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
            manualAccessGrant: true,
            fullName: true,
            auth: {
              select: {
                identities: {
                  where: { providerName: "email" },
                  select: { providerUserId: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (row) {
      apiKey = { id: row.id, userId: row.userId };
      const email = row.user.auth?.identities[0]?.providerUserId ?? null;
      user = {
        id: row.user.id,
        plan: row.user.plan,
        planRenewsAt: row.user.planRenewsAt,
        isAdmin: row.user.isAdmin,
        manualAccessGrant: row.user.manualAccessGrant,
        email,
        fullName: row.user.fullName,
      };
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

  // A token proves who the caller is, but does not grant a Free account the
  // paid developer surface. Check this before every CLI route so an old token
  // stops working immediately when a plan ends or is downgraded.
  const cliViolation = cliAccessViolation(user);
  if (cliViolation) {
    res.status(402).json({
      error: `${cliViolation.feature} is a Pro feature.`,
      feature: cliViolation.feature,
      reason: cliViolation.reason,
    });
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

/**
 * The CORS config for the session-authed `/api/pat/*` management routes
 * (issue/revoke/list) + `/cli/login`'s mint call.
 *
 * NOTE: this middleware exists but is NOT currently applied per-route. Express's
 * method-specific routes (`router.post`) don't match OPTIONS, so a per-route
 * CORS middleware can't handle the preflight — the preflight never reaches it.
 * Instead, the credentials-aware CORS is applied GLOBALLY via
 * `auth/serverMiddleware.ts`'s `globalMiddlewareConfigFn` (it replaces the
 * default `cors` entry with a credentials-aware variant for the web origin).
 *
 * Keeping this file's export in case a future route needs a tighter CORS
 * policy than the global one (e.g. allowing a third origin). For now, the
 * global widening covers every session-authed cross-origin route the client
 * calls — which is correct, since they ALL need credentials (the session cookie).
 */
