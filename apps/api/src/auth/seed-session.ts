/**
 * Session seeding — F10c test affordances. How e2e (F11) "logs in".
 *
 * A session row is all auth needs: INSERT directly into `Session`
 * (the one sanctioned write besides F10a's lazy expiry side effects).
 *
 *   INSERT INTO "Session" (id, "expiresAt", "userId")
 *   VALUES ('<40-char [a-z2-7] token>', now() + 30d, <Auth.id>);
 *
 * `Session.userId` is the **Auth** id, not the User id (compat notes §1.3).
 * The token is minted with the same algorithm Lucia uses for issuance
 * (generateSessionToken) so seeded rows are indistinguishable from real ones.
 *
 * Two entry points:
 *  - `seedSessionForEmail(db, email, opts)` — exported fn; mints + inserts a
 *    session for the user behind an email identity (creating that user
 *    dev-style when missing), returns the token. F11's e2e helper + the dev
 *    login route consume this.
 *  - CLI: `bun src/auth/seed-session.ts [--email a@b.c] [--days N]` — prints
 *    the token + ready-made curl hints as one JSON line (import.meta.main
 *    gates the CLI block; importing the helpers never runs it).
 *
 * Safety (CLI): refuses to run against anything but a localhost database
 * (same guard as src/seed.ts) — seeded sessions are live credentials.
 */
import { and, eq } from "drizzle-orm";
import {
  auth,
  authIdentity,
  createDb,
  session,
  user,
} from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { databaseUrl, isLocalDatabaseUrl, SEED_DEV_EMAIL } from "../db.js";
import { generateSessionToken } from "./session.js";

export interface SeededUser {
  userId: string;
  authId: string;
  email: string;
}

/**
 * Find-or-create the User + Auth + email AuthIdentity behind `email` — the
 * devAutologin shape (fullName/firstName derived from the email local part,
 * isEmailVerified + hasSeenOnboarding true, hashedPassword null — no password
 * plumbing: sessions are minted directly). Seeded rows are indistinguishable
 * from real ones for downstream code.
 */
export async function ensureEmailUser(
  db: DomainDb,
  email: string,
): Promise<SeededUser> {
  const existing = await db
    .select({ userId: auth.userId, authId: auth.id })
    .from(authIdentity)
    .innerJoin(auth, eq(auth.id, authIdentity.authId))
    .where(
      and(
        eq(authIdentity.providerName, "email"),
        eq(authIdentity.providerUserId, email),
      ),
    )
    .limit(1);

  const found = existing[0];
  if (found?.userId) {
    // Keep the onboarding gate quiet mid-test (devAutologin parity).
    await db
      .update(user)
      .set({ hasSeenOnboarding: true })
      .where(eq(user.id, found.userId));
    return { userId: found.userId, authId: found.authId, email };
  }

  // Create dev-style: User → Auth → email AuthIdentity.
  const fullName = nameFromEmail(email);
  const userId = crypto.randomUUID();
  const authId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    firstName: fullName.split(/\s+/)[0] ?? "Dev",
    fullName,
    hasSeenOnboarding: true,
  });
  await db.insert(auth).values({ id: authId, userId });
  await db.insert(authIdentity).values({
    providerName: "email",
    providerUserId: email,
    providerData: JSON.stringify({
      hashedPassword: null,
      isEmailVerified: true,
    }),
    authId,
  });
  return { userId, authId, email };
}

/** devAutologin.ts:38-45 parity — "first.last@x" → "First Last". */
function nameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "Dev";
  const words = localPart
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return words.length > 0 ? words.join(" ") : "Dev User";
}

export interface SeedSessionOptions {
  /** Fixed token override (tests); default mints a fresh 40-char token. */
  token?: string;
  /** Lifetime override in days (default 30; e2e can pass 0.001 etc.). */
  lifetimeDays?: number;
}

export interface SeededSession extends SeededUser {
  /** The plaintext token — becomes the cookie/Bearer value verbatim. */
  token: string;
  expiresAt: Date;
}

/**
 * Mint + INSERT a valid Wasp-format Session row for the given email.
 * INSERTs directly (F10c's sanctioned write) — no issuance flow involved.
 */
export async function seedSessionForEmail(
  db: DomainDb,
  email: string,
  options: SeedSessionOptions = {},
): Promise<SeededSession> {
  const seededUser = await ensureEmailUser(db, email);
  const token = options.token ?? generateSessionToken();
  const lifetimeMs = (options.lifetimeDays ?? 30) * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + lifetimeMs);
  await db.insert(session).values({
    id: token,
    userId: seededUser.authId, // Auth.id — NOT User.id
    expiresAt,
  });
  return { ...seededUser, token, expiresAt };
}

// --- CLI entry (runs only when invoked directly: bun src/auth/seed-session.ts)

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flagValue = (name: string): string | undefined => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const email = flagValue("--email") ?? SEED_DEV_EMAIL;
  const days = flagValue("--days");

  const url = databaseUrl();
  if (!isLocalDatabaseUrl(url)) {
    console.error(
      `Refusing to seed a session: DATABASE_URL host is not localhost (${url.replace(/\/\/[^@/]*@/, "//<redacted>@")}). ` +
        "Seeded sessions are live credentials and only ever target a local dev database.",
    );
    process.exit(1);
  }

  const db = createDb(url);
  try {
    const seeded = await seedSessionForEmail(db, email, {
      lifetimeDays: days === undefined ? undefined : Number(days),
    });
    console.log(
      JSON.stringify({
        event: "session-seeded",
        email: seeded.email,
        userId: seeded.userId,
        authId: seeded.authId,
        token: seeded.token,
        expiresAt: seeded.expiresAt.toISOString(),
        hints: {
          cookie: `Cookie: wasp_session=${seeded.token}`,
          bearer: `Authorization: Bearer ${seeded.token}`,
          curl:
            `curl -X POST localhost:8080/rpc/tasks/list ` +
            `-H "Cookie: wasp_session=${seeded.token}" ` +
            `-H "x-requested-with: actionamp" -H "content-type: application/json" -d '{}'`,
        },
      }),
    );
  } finally {
    await db.$client.end();
  }
}
