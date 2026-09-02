/**
 * PAT validation — F10b. The CLI token layer (`Authorization: Bearer aa_…`).
 *
 * Mirrors webapp/src/auth/patMiddleware.ts + pat.ts verbatim (verified in
 * docs/plans/auth-compatibility-notes.md §2):
 *  - Token: `aa_` + base64url(32 random bytes) ≈ 46 chars.
 *  - Storage: SHA-256 HEX of the full plaintext (incl. `aa_`) in
 *    `ApiKey.hashedToken` (UNIQUE index). Lookup = re-hash the inbound token
 *    → index equality. No timing-safe compare: the digest IS the key
 *    (deterministic hash, no salt — pat.ts:10-27 reasoning, kept as-is).
 *  - Errors (exact webapp bodies, no probing oracle — wrong and revoked are
 *    indistinguishable):
 *      missing/malformed → 401 {"error":"Missing or malformed bearer token."}
 *      unknown/revoked   → 401 {"error":"Invalid or revoked token."}
 *  - Entitlement gate BEFORE handlers (patMiddleware.ts:152-161 placement):
 *      FREE → 402 {"error":"<feature> is a Pro feature.","feature":…,"reason":…}
 *    Replicated here — a token proves who the caller is, never what they paid
 *    for; plan state is re-checked per request.
 *  - `ApiKey.lastUsedAt` stamped fire-and-forget (failure never blocks).
 *  - Bearer-only: a session cookie must NEVER satisfy this path (the webapp
 *    deletes the cookie middlewares on /api/cli/* — patMiddleware.ts:194-199).
 *
 * Bearer scheme match is the case-insensitive superset (`/^Bearer\s+(.+)$/i`)
 * both existing parsers share (fact #10 of the compat notes).
 */
import { and, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { apiKey, auth, authIdentity, user } from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { cliAccessViolation } from "@actionamp/domain/billing";

/** Prefix that identifies an ActionAmp PAT in logs and secret scanners. */
export const TOKEN_PREFIX = "aa_";

export interface PatUser {
  id: string;
  plan: string;
  planRenewsAt: Date | null;
  isAdmin: boolean;
  manualAccessGrant: "PRO" | "FOUNDER" | "FRIEND" | null;
  email: string | null;
  fullName: string;
}

/** Generate a new plaintext PAT. Shown to the user exactly once (S10+). */
export function generatePat(): string {
  const body = randomBytes(32).toString("base64url");
  return `${TOKEN_PREFIX}${body}`;
}

/** Hash a PAT for storage + lookup — deterministic SHA-256, hex. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Fail-fast shape check (pat.ts:54-61) — no hash spent on garbage. */
export function looksLikeToken(value: string): boolean {
  return (
    value.startsWith(TOKEN_PREFIX) &&
    value.length > TOKEN_PREFIX.length &&
    // base64url alphabet only, after the prefix
    /^[A-Za-z0-9_-]+$/.test(value.slice(TOKEN_PREFIX.length))
  );
}

/**
 * Extract the Bearer token from an Authorization header, or null if
 * absent/malformed. Case-insensitive scheme, 1+ whitespace separator —
 * the superset of Wasp's case-sensitive parse and ActionAmp's regex.
 */
export function readBearerToken(
  authHeader: string | undefined,
): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Narrow DB port — the mockable seam (EntitySpy pattern). */
export interface PatLookupPort {
  findApiKeyUserByHash(
    hashedToken: string,
  ): Promise<(PatUser & { apiKeyId: string }) | null>;
  /** lastUsedAt write-behind. */
  touchApiKey(id: string, at: Date): Promise<void>;
}

export type PatResolution =
  | { ok: true; user: PatUser; apiKeyId: string }
  | { ok: false; status: 401; body: { error: string } }
  | {
      ok: false;
      status: 402;
      body: { error: string; feature: string; reason: string };
    };

const MISSING = "Missing or malformed bearer token.";
const INVALID = "Invalid or revoked token.";

/**
 * The F10b core: resolve an Authorization header to a PatUser, replicating
 * patMiddleware.ts:70-180 step-for-step (parse → shape check → hash → lookup
 * → entitlement gate → lastUsedAt stamp).
 */
export async function resolvePatCore(
  port: PatLookupPort,
  authHeader: string | undefined,
): Promise<PatResolution> {
  const token = readBearerToken(authHeader);
  if (!token || !looksLikeToken(token)) {
    return { ok: false, status: 401, body: { error: MISSING } };
  }

  const row = await port.findApiKeyUserByHash(hashToken(token));
  if (!row) {
    // Same response for "wrong token" and "revoked" — no probing oracle.
    return { ok: false, status: 401, body: { error: INVALID } };
  }

  const { apiKeyId, ...patUser } = row;
  // Entitlement gate before every handler (webapp placement: patMiddleware
  // 402s FREE before the route handler ever runs).
  const violation = cliAccessViolation(patUser);
  if (violation) {
    return {
      ok: false,
      status: 402,
      body: {
        error: `${violation.feature} is a Pro feature.`,
        feature: violation.feature,
        reason: violation.reason,
      },
    };
  }

  // Fire-and-forget audit stamp — authenticated either way.
  void port.touchApiKey(apiKeyId, new Date()).catch(() => {});

  return { ok: true, user: patUser, apiKeyId };
}

/** The real port over Drizzle (direct query builder — never db.$client raw). */
export function drizzlePatLookupPort(db: DomainDb): PatLookupPort {
  return {
    async findApiKeyUserByHash(hashedToken) {
      const rows = await db
        .select({
          apiKeyId: apiKey.id,
          id: user.id,
          plan: user.plan,
          planRenewsAt: user.planRenewsAt,
          isAdmin: user.isAdmin,
          manualAccessGrant: user.manualAccessGrant,
          fullName: user.fullName,
          email: authIdentity.providerUserId,
        })
        .from(apiKey)
        .innerJoin(user, eq(user.id, apiKey.userId))
        .leftJoin(auth, eq(auth.userId, user.id))
        .leftJoin(
          authIdentity,
          and(
            eq(authIdentity.authId, auth.id),
            eq(authIdentity.providerName, "email"),
          ),
        )
        .where(eq(apiKey.hashedToken, hashedToken))
        .limit(1);
      return rows[0] ?? null;
    },

    async touchApiKey(id, at) {
      await db.update(apiKey).set({ lastUsedAt: at }).where(eq(apiKey.id, id));
    },
  };
}

/** Convenience: validate against the real database. */
export function validatePat(
  db: DomainDb,
  authHeader: string | undefined,
): Promise<PatResolution> {
  return resolvePatCore(drizzlePatLookupPort(db), authHeader);
}
