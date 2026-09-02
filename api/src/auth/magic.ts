/**
 * Passwordless magic login — S10. Verbatim port of
 * webapp/src/auth/magicLogin.ts (challenge lifecycle) +
 * webapp/src/auth/returnTo.ts (returnTo sanitization) +
 * webapp/src/auth/loginActivity.ts (provider-bounded login bookkeeping).
 *
 * Constants and behaviors are parity-checked against
 * packages/contract/src/s10-auth/README.md §3:
 *  - 6-digit code (localhost fixed "111111", prod randomInt(100000, 1000000)),
 *    SHA-256-hashed at rest as sha256(`${id}:${code}`); link token
 *    randomBytes(32) base64url hashed as sha256(token).
 *  - 10-minute TTL, single-use ATOMIC consume (updateMany count gate — the
 *    loser of a code/link race gets "already used"), 5 attempts, one active
 *    challenge per email per 60 s answered with the byte-identical
 *    `{ sent: true }`, newer requests supersede older ones.
 *  - Unknown email still creates a challenge (passwordless sign-in IS
 *    sign-up); verifying creates the User + Auth + email AuthIdentity with
 *    an unusable scrypt password and isEmailVerified: true.
 *  - Email delivery failure deletes the just-created challenge (never leaves
 *    a usable credential) and surfaces 503 "Could not send email. Try again
 *    shortly."
 *
 * The DB surface is a narrow port (EntitySpy pattern, like session.ts/pat.ts)
 * so the lifecycle is unit-testable without a database; the drizzle ports are
 * the real implementations. Errors throw AuthHttpError — surfaces map it
 * (REST: status + {error}; oRPC: ORPCError with matching code/status).
 */
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import {
  auth,
  authIdentity,
  loginEvent,
  magicLoginChallenge,
  user,
} from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { hashPassword, issueSessionCore } from "./issue.js";
import type { SessionIssuePort } from "./issue.js";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_INTERVAL_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

/** An HttpError-shaped failure — surfaces translate it 1:1. */
export class AuthHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthHttpError";
  }
}

export type MagicLoginInput = { email: string; returnTo?: string };
export type MagicVerifyInput = {
  email?: string;
  code?: string;
  token?: string;
};

export interface MagicChallengeRow {
  id: string;
  email: string;
  codeHash: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
}

/** The display-name pair derived from an email's local part. */
export interface EmailDisplayName {
  fullName: string;
  firstName: string;
}

export function normalizeEmail(value: string | undefined): string {
  if (!value) throw new AuthHttpError(400, "Enter a valid email.");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthHttpError(400, "Enter a valid email.");
  }
  return email;
}

export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const DEFAULT_CLIENT_URL = "http://localhost:4000";

/**
 * webapp magicLogin.ts isLocalhost() parity: the hostname check (localhost →
 * fixed code; unparseable URL → NODE_ENV === "development" fallback). The
 * NODE_ENV !== "production" prod gate lives in resolveMagicEnv — prod must
 * never reach the fixed code, however the URL is misconfigured.
 */
export function isLocalhostClientUrl(clientUrl: string): boolean {
  try {
    return new URL(clientUrl).hostname === "localhost";
  } catch {
    return process.env.NODE_ENV === "development";
  }
}

/** Localhost fixed code for fast manual QA; prod is crypto-random. */
export function createCode(localhost: boolean): string {
  if (localhost) return "111111";
  return String(randomInt(100000, 1000000));
}

/** devAutologin.ts:38-45 splitting rules, "There" fallback (magicLogin.ts). */
export function displayNameFromEmail(email: string): EmailDisplayName {
  const localPart = email.split("@")[0] ?? "there";
  const fullName =
    localPart
      .split(/[._+-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "There";
  return { fullName, firstName: fullName.split(/\s+/)[0] ?? "There" };
}

// --- returnTo.ts port ---------------------------------------------------------

export const DEFAULT_AUTH_RETURN_TO = "/do";

const RETURN_TO_BASE = "https://actionamp.local";

/**
 * Accept only same-origin paths as post-auth destinations. Besides blocking
 * absolute URLs, the origin comparison catches protocol-relative and
 * backslash-based URLs that browsers can interpret as another host.
 */
export function safeAuthReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) {
    return DEFAULT_AUTH_RETURN_TO;
  }
  try {
    const url = new URL(value, RETURN_TO_BASE);
    if (url.origin !== RETURN_TO_BASE) return DEFAULT_AUTH_RETURN_TO;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AUTH_RETURN_TO;
  }
}

export function buildMagicLoginUrl(
  baseUrl: string,
  token: string,
  returnTo: string | null | undefined,
): string {
  const url = new URL("/login", baseUrl);
  url.searchParams.set("magic", token);
  url.searchParams.set("returnTo", safeAuthReturnTo(returnTo));
  return url.toString();
}

// --- request (challenge creation) ----------------------------------------------

/** Narrow DB port for the request half — the mockable seam. */
export interface MagicRequestPort {
  findRecentActiveChallenge(
    email: string,
    createdAfter: Date,
    now: Date,
  ): Promise<{ id: string } | null>;
  consumeAllForEmail(email: string, at: Date): Promise<void>;
  createChallenge(row: {
    id: string;
    email: string;
    codeHash: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<void>;
  deleteChallenge(id: string): Promise<void>;
  /** The email seam — Resend in prod; skipped entirely on localhost. */
  sendLoginEmail(args: { to: string; code: string; loginUrl: string }): Promise<void>;
}

/** Injectable environment the cores read (defaults resolved from process). */
export interface MagicEnvOptions {
  now?: Date;
  /** The web client base URL (WASP_WEB_CLIENT_URL parity). */
  baseUrl?: string;
  /** Localhost gate — fixed code + no email send. */
  localhost?: boolean;
}

export interface ResolvedMagicEnv {
  now: Date;
  baseUrl: string;
  localhost: boolean;
}

export function resolveMagicEnv(options: MagicEnvOptions = {}): ResolvedMagicEnv {
  const baseUrl = options.baseUrl ?? process.env.WASP_WEB_CLIENT_URL ?? DEFAULT_CLIENT_URL;
  return {
    now: options.now ?? new Date(),
    baseUrl,
    // Hardened beyond the webapp: NODE_ENV=production NEVER gets the fixed
    // code, even when the client URL host is localhost. The webapp's
    // isLocalhost() keyed on the hostname alone, so a prod deploy launched
    // without WASP_WEB_CLIENT_URL would resolve the localhost default and
    // hand every email the universal 111111 code (fail-open). Here that
    // misconfig instead takes the prod path: random code + real send, which
    // fails closed (challenge deleted, 503) when RESEND_API_KEY is missing.
    localhost:
      options.localhost ??
      (isLocalhostClientUrl(baseUrl) && process.env.NODE_ENV !== "production"),
  };
}

/**
 * The request core — verbatim magicLogin.ts requestMagicLogin flow. Always
 * resolves `{ sent: true }` except for invalid input (400) and, in prod, a
 * failed email send (challenge deleted, 503).
 */
export async function requestMagicLoginCore(
  port: MagicRequestPort,
  input: MagicLoginInput,
  env: ResolvedMagicEnv,
): Promise<{ sent: true }> {
  const email = normalizeEmail(input.email);
  const returnTo = safeAuthReturnTo(input.returnTo);

  const recent = await port.findRecentActiveChallenge(
    email,
    new Date(env.now.getTime() - RESEND_INTERVAL_MS),
    env.now,
  );

  // Same calm response for a fresh and rate-limited request. This limits email
  // spam without revealing whether an account already exists.
  if (recent) return { sent: true };

  // A newer request supersedes every older email for this address. That keeps
  // one clear sign-in path alive and limits the blast radius of a stale inbox.
  await port.consumeAllForEmail(email, env.now);

  const id = randomUUID();
  const code = createCode(env.localhost);
  const token = randomBytes(32).toString("base64url");
  await port.createChallenge({
    id,
    email,
    codeHash: hash(`${id}:${code}`),
    tokenHash: hash(token),
    expiresAt: new Date(env.now.getTime() + CODE_TTL_MS),
    createdAt: env.now,
  });

  // Localhost has a fixed code for fast manual QA. No email provider needed.
  if (!env.localhost) {
    try {
      await port.sendLoginEmail({
        to: email,
        code,
        loginUrl: buildMagicLoginUrl(env.baseUrl, token, returnTo),
      });
    } catch (error) {
      // The client receives a generic error, but keep the provider's reason in
      // server logs. This is essential for diagnosing delivery failures without
      // exposing provider details or a sign-in credential to the browser.
      console.error("Magic login email delivery failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      // Never leave a usable credential behind if delivery failed.
      await port.deleteChallenge(id).catch(() => undefined);
      throw new AuthHttpError(503, "Could not send email. Try again shortly.");
    }
  }
  return { sent: true };
}

// --- verify (consume + identity + issuance) ------------------------------------

/**
 * Narrow port for the verify half: challenge consume, identity find-or-create,
 * session issuance, and the safely-wrapped login-activity record.
 */
export interface MagicVerifyPort {
  findChallengeByTokenHash(tokenHash: string, now: Date): Promise<MagicChallengeRow | null>;
  findLatestActiveChallengeForEmail(email: string, now: Date): Promise<MagicChallengeRow | null>;
  incrementAttempts(id: string): Promise<void>;
  /** Atomic consume — true iff the row was still unconsumed at write time. */
  consumeChallenge(id: string, at: Date): Promise<boolean>;
  findEmailIdentity(email: string): Promise<{ authId: string } | null>;
  createEmailIdentityUser(
    email: string,
    displayName: EmailDisplayName,
    hashedPassword: string,
  ): Promise<{ authId: string; userId: string }>;
  findUserIdByAuthId(authId: string): Promise<string | null>;
  /** User.lastLoginAt + LoginEvent create — wrapped safely by the core. */
  recordLoginActivity(userId: string, provider: string): Promise<void>;
}

async function resolveChallenge(
  port: MagicVerifyPort,
  input: MagicVerifyInput,
  env: ResolvedMagicEnv,
): Promise<MagicChallengeRow> {
  if (input.token) {
    const challenge = await port.findChallengeByTokenHash(hash(input.token), env.now);
    if (!challenge) {
      throw new AuthHttpError(400, "That sign-in link is no longer valid. Request a new one.");
    }
    return challenge;
  }

  const email = normalizeEmail(input.email);
  const code = input.code?.trim() ?? "";
  if (!/^\d{6}$/.test(code)) throw new AuthHttpError(400, "Enter the six-digit code.");
  const challenge = await port.findLatestActiveChallengeForEmail(email, env.now);
  if (!challenge || challenge.codeHash !== hash(`${challenge.id}:${code}`)) {
    if (challenge) {
      await port.incrementAttempts(challenge.id);
    }
    throw new AuthHttpError(400, "That code is not valid. Try again or request a new one.");
  }
  return challenge;
}

/**
 * The verify core — verbatim magicLogin.ts verifyMagicLogin flow, ending in
 * S10's own issuance (issueSessionCore) instead of Wasp's createSession.
 */
export async function verifyMagicLoginCore(
  port: MagicVerifyPort,
  input: MagicVerifyInput,
  env: ResolvedMagicEnv,
  issue: SessionIssuePort,
): Promise<{ sessionId: string; userId: string | null }> {
  const challenge = await resolveChallenge(port, input, env);

  // Atomic consume prevents concurrent code/link submissions from creating two
  // sessions. The selected row must still be unused at write time.
  const consumed = await port.consumeChallenge(challenge.id, env.now);
  if (!consumed) {
    throw new AuthHttpError(400, "That sign-in link was already used.");
  }

  const identity = await port.findEmailIdentity(challenge.email);
  let authId = identity?.authId;
  let userId: string | null = null;
  if (!authId) {
    // Passwordless sign-in IS sign-up: create the user behind the email with
    // a random unusable password (users never type it).
    const displayName = displayNameFromEmail(challenge.email);
    const hashedPassword = await hashPassword(randomBytes(32).toString("base64url"));
    const created = await port.createEmailIdentityUser(challenge.email, displayName, hashedPassword);
    authId = created.authId;
    userId = created.userId;
  }
  if (!authId) throw new AuthHttpError(500, "Could not create your session.");

  const issued = await issueSessionCore(issue, authId, { now: env.now });
  if (!userId) {
    userId = await port.findUserIdByAuthId(authId);
  }
  if (userId) {
    // Never turn a successful session into an auth failure because logging failed.
    await port.recordLoginActivity(userId, "magic").catch((error: unknown) => {
      console.error("Login activity recording failed", {
        userId,
        provider: "magic",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  } else {
    console.error("Login activity recording skipped", { authId, provider: "magic" });
  }
  return { sessionId: issued.token, userId };
}

// --- drizzle ports (the real implementations) -----------------------------------

export function drizzleMagicRequestPort(
  db: DomainDb,
  sendLoginEmail: MagicRequestPort["sendLoginEmail"],
): MagicRequestPort {
  return {
    async findRecentActiveChallenge(email, createdAfter, now) {
      const rows = await db
        .select({ id: magicLoginChallenge.id })
        .from(magicLoginChallenge)
        .where(
          and(
            eq(magicLoginChallenge.email, email),
            isNull(magicLoginChallenge.consumedAt),
            gt(magicLoginChallenge.expiresAt, now),
            gt(magicLoginChallenge.createdAt, createdAfter),
          ),
        )
        .orderBy(desc(magicLoginChallenge.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async consumeAllForEmail(email, at) {
      await db
        .update(magicLoginChallenge)
        .set({ consumedAt: at })
        .where(
          and(eq(magicLoginChallenge.email, email), isNull(magicLoginChallenge.consumedAt)),
        );
    },

    async createChallenge(row) {
      await db.insert(magicLoginChallenge).values(row);
    },

    async deleteChallenge(id) {
      await db.delete(magicLoginChallenge).where(eq(magicLoginChallenge.id, id));
    },

    sendLoginEmail,
  };
}

export function drizzleMagicVerifyPort(db: DomainDb): MagicVerifyPort {
  return {
    async findChallengeByTokenHash(tokenHash, now) {
      const rows = await db
        .select()
        .from(magicLoginChallenge)
        .where(
          and(
            eq(magicLoginChallenge.tokenHash, tokenHash),
            isNull(magicLoginChallenge.consumedAt),
            gt(magicLoginChallenge.expiresAt, now),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async findLatestActiveChallengeForEmail(email, now) {
      const rows = await db
        .select()
        .from(magicLoginChallenge)
        .where(
          and(
            eq(magicLoginChallenge.email, email),
            isNull(magicLoginChallenge.consumedAt),
            gt(magicLoginChallenge.expiresAt, now),
            lt(magicLoginChallenge.attempts, MAX_ATTEMPTS),
          ),
        )
        .orderBy(desc(magicLoginChallenge.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async incrementAttempts(id) {
      await db
        .update(magicLoginChallenge)
        .set({ attempts: sql`${magicLoginChallenge.attempts} + 1` })
        .where(eq(magicLoginChallenge.id, id));
    },

    async consumeChallenge(id, at) {
      const rows = await db
        .update(magicLoginChallenge)
        .set({ consumedAt: at })
        .where(and(eq(magicLoginChallenge.id, id), isNull(magicLoginChallenge.consumedAt)))
        .returning({ id: magicLoginChallenge.id });
      return rows.length === 1;
    },

    async findEmailIdentity(email) {
      const rows = await db
        .select({ authId: auth.id })
        .from(authIdentity)
        .innerJoin(auth, eq(auth.id, authIdentity.authId))
        .where(
          and(
            eq(authIdentity.providerName, "email"),
            eq(authIdentity.providerUserId, email),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async createEmailIdentityUser(email, displayName, hashedPassword) {
      // User → Auth → email AuthIdentity, Wasp createUser parity (the
      // providerData JSON shape is what Wasp's own identity rows carry).
      const userId = crypto.randomUUID();
      const authId = crypto.randomUUID();
      await db.insert(user).values({
        id: userId,
        firstName: displayName.firstName,
        fullName: displayName.fullName,
      });
      await db.insert(auth).values({ id: authId, userId });
      await db.insert(authIdentity).values({
        providerName: "email",
        providerUserId: email,
        providerData: JSON.stringify({
          hashedPassword,
          isEmailVerified: true,
          emailVerificationSentAt: null,
          passwordResetSentAt: null,
        }),
        authId,
      });
      return { authId, userId };
    },

    async findUserIdByAuthId(authId) {
      const rows = await db
        .select({ userId: auth.userId })
        .from(auth)
        .where(eq(auth.id, authId))
        .limit(1);
      return rows[0]?.userId ?? null;
    },

    async recordLoginActivity(userId, provider) {
      // LoginActivity port (loginActivity.ts): User.lastLoginAt = now plus a
      // LoginEvent row whose provider is bounded to the known enum set.
      const KNOWN = new Set([
        "magic", "email", "google", "github", "discord", "slack",
        "keycloak", "microsoft", "username", "other",
      ]);
      const bounded = KNOWN.has(provider) ? provider : "other";
      const now = new Date();
      await db.update(user).set({ lastLoginAt: now }).where(eq(user.id, userId));
      await db.insert(loginEvent).values({
        id: crypto.randomUUID(),
        userId,
        provider: bounded,
        createdAt: now,
      });
    },
  };
}
