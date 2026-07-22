/**
 * Personal Access Token (PAT) utilities for the CLI auth layer.
 *
 * Tokens are full-scope, non-expiring v1 (revocation is the safety valve). The
 * plaintext is shown to the user exactly once at issue time; only the hash is
 * stored. Format: `aa_<base64url(32 random bytes)>` — the `aa_` prefix makes
 * "this is an ActionAmp token" obvious in logs and secret scanners. See
 * docs/specs/cli-pat-plumbing.md.
 *
 * Hashing is **SHA-256**, not argon2id — despite the spec originally leaning on
 * the password-hasher precedent. The reason: PATs are looked up *by hash*
 * (`ApiKey.findUnique({ where: { hashedToken } })`), which requires a
 * deterministic hash. argon2id uses a random salt, so the same plaintext hashes
 * differently each call and a hash-lookup can never match. Passwords avoid
 * this because they're looked up by username and *verified* with argon2's
 * constant-time compare — but tokens have no "username" equivalent; the token
 * IS the lookup key.
 *
 * This is the standard model (GitHub and Stripe both use HMAC-SHA256 for
 * exactly this reason). The token carries 256 bits of entropy, so a slow KDF
 * adds no marginal brute-force resistance anyway — SHA-256 is correct here,
 * not a compromise. If we ever rotate the hashing scheme, old rows need a
 * re-hash migration.
 */
import { createHash, randomBytes } from "node:crypto";

/** Prefix that identifies an ActionAmp PAT in logs and secret scanners. */
export const TOKEN_PREFIX = "aa_";

/** Generate a new plaintext PAT. Return this to the user exactly once. */
export function generateToken(): string {
  // 32 random bytes → ~43 chars base64url → ~256 bits of entropy.
  const body = randomBytes(32).toString("base64url");
  return `${TOKEN_PREFIX}${body}`;
}

/**
 * Hash a PAT for storage + lookup. Deterministic (SHA-256): the same plaintext
 * always produces the same hash, so the middleware can look up an inbound token
 * by re-hashing it. Returns hex.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * True if `value` looks like an ActionAmp PAT. Used by the middleware to fail
 * fast on obviously-wrong Authorization headers without spending a hash.
 */
export function looksLikeToken(value: string): boolean {
  return (
    value.startsWith(TOKEN_PREFIX) &&
    value.length > TOKEN_PREFIX.length &&
    // base64url alphabet only, after the prefix
    /^[A-Za-z0-9_-]+$/.test(value.slice(TOKEN_PREFIX.length))
  );
}
