/**
 * Session ISSUANCE — S10. The write side of the Wasp-compatible session
 * contract (F10a is the read side, session.ts).
 *
 * Contract (docs/plans/auth-compatibility-notes.md §4, verified against the
 * installed Lucia 3.2.2 that Wasp 0.25 vendors):
 *  - Token: `generateSessionToken()` (session.ts) — 25 random bytes → RFC
 *    4648 lowercase base32, no padding → exactly 40 chars of [a-z2-7].
 *  - Hashing: NONE. The encoded string is stored VERBATIM as `Session.id`
 *    and returned to the client as-is; cookie value, Bearer value, and DB id
 *    are the same string.
 *  - Row: `{ id: token, userId: <Auth.id>, expiresAt: now + 30d }` —
 *    `Session.userId` references the AUTH id, not the User id.
 *  - Lifetime: 30d fixed; renewal never rotates the id (F10a's half-life
 *    extension keeps the same id).
 *  - Login response shape: `{ sessionId: "<token>" }` (Wasp's own).
 *  - Cookie stamp (sessionCookie.ts parity): `wasp_session=<token>;
 *    HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax` + `; Secure` in prod.
 *
 * Also home to the scrypt password hasher the verify flow needs when it
 * creates a brand-new user behind an email identity: Wasp stores Lucia's
 * scrypt format (`salt:key`, both hex; N=16384, r=16, p=1, dkLen=64) in
 * `AuthIdentity.providerData.hashedPassword`. The magic-login password is
 * 32 random bytes of base64url the user can never type — replicated in the
 * exact format so rows stay indistinguishable from Wasp-created ones.
 */
import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";
import { session } from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, generateSessionToken } from "./session.js";

const scrypt = promisify(nodeScrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** The one session record an issuance produces. */
export interface IssuedSession {
  /** The token — stored verbatim as Session.id, returned as sessionId. */
  token: string;
  expiresAt: Date;
}

/** Narrow DB port — the mockable seam (EntitySpy pattern). */
export interface SessionIssuePort {
  insertSession(id: string, userId: string, expiresAt: Date): Promise<void>;
}

/** Lucia's default lifetime (Wasp doesn't override it) — session.ts parity. */
export const SESSION_LIFETIME_MS = SESSION_TTL_MS;

/**
 * The S10 core: mint a Wasp-format session row for an Auth id.
 * Pure orchestration — token generation + row insert, nothing else.
 */
export async function issueSessionCore(
  port: SessionIssuePort,
  authId: string,
  options: { now?: Date } = {},
): Promise<IssuedSession> {
  const now = options.now ?? new Date();
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  await port.insertSession(token, authId, expiresAt);
  return { token, expiresAt };
}

/** The real port over Drizzle (direct query builder — never db.$client raw). */
export function drizzleSessionIssuePort(db: DomainDb): SessionIssuePort {
  return {
    async insertSession(id, userId, expiresAt) {
      await db.insert(session).values({ id, userId, expiresAt });
    },
  };
}

/**
 * The `Set-Cookie` header value for the session cookie — sessionCookie.ts
 * cookieOptions() parity: httpOnly, Secure in prod, SameSite=Lax, Path=/,
 * Max-Age 30d (cookie and DB row expire together, per its comment).
 */
export function sessionCookieHeader(
  token: string,
  options: { secure?: boolean } = {},
): string {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Lucia's scrypt password hash (`salt:key` hex) — the format
 * `@wasp.sh/lib-auth/node`'s hashPassword writes (lucia/dist/crypto.js:
 * salt = 16 random bytes hex; N=16384, r=16, p=1, dkLen=64; password
 * NFKC-normalized). Node's scrypt needs maxmem raised: 128·N·r is exactly
 * the 32MB default it refuses to exceed.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${key.toString("hex")}`;
}
