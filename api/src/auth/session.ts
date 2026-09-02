/**
 * Session validation — F10a. Wasp-compatible auth against the SAME Postgres.
 *
 * Storage contract (verified in docs/plans/auth-compatibility-notes.md §1):
 *  - The cookie `wasp_session` (httpOnly, SameSite=Lax, Path=/, Max-Age 30d,
 *    +Secure in prod) carries the session token verbatim.
 *  - Session tokens are NOT hashed: `Session.id` IS the token — exact-string
 *    PK lookup (Wasp 0.25 vendors Lucia 3.2.2, which looks the id up directly).
 *  - Token shape: 40 chars of `[a-z2-7]` (RFC 4648 lowercase base32, no
 *    padding) = 25 random bytes. Match by exact string regardless — no format
 *    assumption on the inbound token.
 *  - Join path: `Session.userId → Auth.id` (NOT User.id), then
 *    `Auth.userId → User.id`. `Auth.userId` is nullable; an orphaned Auth
 *    authenticates nobody.
 *  - Expiry semantics replicated from Lucia (lazy, on read): an expired row is
 *    DELETED; a row past half-life (15d of the 30d lifetime) has `expiresAt`
 *    extended to now+30d with NO id rotation. These writes go through Drizzle
 *    directly — the one sanctioned write path (docs/plans/tasks-port-inventory.md
 *    §7: never read temporal values via db.$client raw; the drizzle query
 *    builder with mode:'date' columns is the safe path).
 *
 * The DB surface is a narrow port (`SessionAuthPort`) so tests can mock it
 * EntitySpy-style (packages/domain/src/test/mockContext.ts pattern) without a
 * live database; `drizzleSessionAuthPort` is the real implementation.
 */
import { and, eq } from "drizzle-orm";
import { auth, authIdentity, session, user } from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";

/** The cookie name — kept verbatim so existing browsers transition unchanged. */
export const SESSION_COOKIE_NAME = "wasp_session";

/** Lucia's default lifetime (Wasp doesn't override it). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Renewal kicks in once the remaining lifetime drops below half. */
export const SESSION_HALF_LIFE_MS = SESSION_TTL_MS / 2;

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/**
 * Mint a Wasp-format session token: 25 random bytes → lowercase base32,
 * no padding → exactly 40 chars. Same algorithm as Lucia's issuance
 * (lucia/dist/crypto.js:25-28) — used by the F10c seed helpers; S10 will
 * reuse it for real issuance.
 */
export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(25));
  let value = 0;
  let bits = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/**
 * Read the `wasp_session` cookie out of a raw `Cookie` header — byte-for-byte
 * the parse in webapp/src/auth/sessionCookie.ts:109-129 (split on ";", match
 * the name exactly, URI-decode the value with a raw fallback; a no-op for
 * base32 but replicated for parity).
 */
export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() !== SESSION_COOKIE_NAME) continue;
    const raw = part.slice(eqIdx + 1).trim();
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/** The acting user a router needs — hydrated from User + the email identity. */
export interface SessionUser {
  /** The application user id (`User.id`). */
  id: string;
  /** `AuthIdentity.providerUserId` where providerName = "email". */
  email: string;
  fullName: string;
  firstName: string;
  preferredName: string | null;
  isAdmin: boolean;
  plan: string;
  planRenewsAt: Date | null;
  manualAccessGrant: "PRO" | "FOUNDER" | "FRIEND" | null;
  hasSeenOnboarding: boolean;
}

/** The session row + owning Auth id, exactly what expiry decisions need. */
export interface SessionAuthRow {
  expiresAt: Date;
  /** `Auth.userId` — nullable at the schema level (orphaned Auth). */
  authUserId: string | null;
}

/** Narrow DB port — the mockable seam (EntitySpy pattern). */
export interface SessionAuthPort {
  findSessionAuth(token: string): Promise<SessionAuthRow | null>;
  deleteSession(id: string): Promise<void>;
  /** Half-life renewal: same id, fresh expiresAt — no token rotation. */
  extendSession(id: string, expiresAt: Date): Promise<void>;
  findUserWithEmail(userId: string): Promise<SessionUser | null>;
}

/**
 * The F10a core: resolve a session token to the acting user, replicating
 * Lucia's lazy side effects on the SAME rows.
 *
 * Returns null (unauthenticated) when: token absent, no row, expired (row
 * DELETED), orphan Auth (Auth.userId null — rejected with no side effect,
 * matching webapp/src/auth/sessionAuth.ts:57-59), or the hydrated user is
 * missing (row deleted — Lucia deletes sessions whose user vanished).
 */
export async function validateSessionCore(
  port: SessionAuthPort,
  token: string | null | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;

  const row = await port.findSessionAuth(token);
  if (!row) return null;

  // Expired → lazy cleanup (Lucia: delete + null).
  if (row.expiresAt.getTime() <= Date.now()) {
    await port.deleteSession(token);
    return null;
  }

  // Orphan Auth authenticates nobody (Auth.userId is the nullable link to
  // User; the Session → Auth leg itself is valid, so no deletion).
  if (!row.authUserId) return null;

  // Half-life renewal: same id, expiresAt = now + 30d, no rotation.
  const now = Date.now();
  if (now > row.expiresAt.getTime() - SESSION_HALF_LIFE_MS) {
    await port.extendSession(token, new Date(now + SESSION_TTL_MS));
  }

  const hydrated = await port.findUserWithEmail(row.authUserId);
  if (!hydrated) {
    // Lucia parity: a session whose user is gone is deleted (defensive — the
    // Auth.userId FK normally makes this unreachable).
    await port.deleteSession(token);
    return null;
  }
  return hydrated;
}

/** The real port over Drizzle (direct query builder — never db.$client raw). */
export function drizzleSessionAuthPort(db: DomainDb): SessionAuthPort {
  return {
    async findSessionAuth(token) {
      const rows = await db
        .select({
          expiresAt: session.expiresAt,
          authUserId: auth.userId,
        })
        .from(session)
        .innerJoin(auth, eq(auth.id, session.userId))
        .where(eq(session.id, token))
        .limit(1);
      return rows[0] ?? null;
    },

    async deleteSession(id) {
      await db.delete(session).where(eq(session.id, id));
    },

    async extendSession(id, expiresAt) {
      await db.update(session).set({ expiresAt }).where(eq(session.id, id));
    },

    async findUserWithEmail(userId) {
      const rows = await db
        .select({
          id: user.id,
          email: authIdentity.providerUserId,
          fullName: user.fullName,
          firstName: user.firstName,
          preferredName: user.preferredName,
          isAdmin: user.isAdmin,
          plan: user.plan,
          planRenewsAt: user.planRenewsAt,
          manualAccessGrant: user.manualAccessGrant,
          hasSeenOnboarding: user.hasSeenOnboarding,
        })
        .from(user)
        .innerJoin(auth, eq(auth.userId, user.id))
        .innerJoin(
          authIdentity,
          and(
            eq(authIdentity.authId, auth.id),
            eq(authIdentity.providerName, "email"),
          ),
        )
        .where(eq(user.id, userId))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}

/** Convenience: validate against the real database. */
export function validateSession(
  db: DomainDb,
  token: string | null | undefined,
): Promise<SessionUser | null> {
  return validateSessionCore(drizzleSessionAuthPort(db), token);
}
