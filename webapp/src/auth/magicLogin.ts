import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { hashPassword } from "@wasp.sh/lib-auth/node";
import { HttpError } from "wasp/server";
import type { RequestMagicLogin, VerifyMagicLogin } from "wasp/server/operations";
import { createSession } from "wasp/auth/session";
import { createProviderId, createUser, findAuthIdentity } from "wasp/server/auth";
import { renderMagicLoginEmailHtml } from "./magicLoginEmail";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

type MagicLoginInput = { email: string };
type VerifyMagicLoginInput = { email?: string; code?: string; token?: string };

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Enter a valid email.");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email.");
  }
  return email;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isLocalhost(): boolean {
  try {
    return new URL(process.env.WASP_WEB_CLIENT_URL ?? "http://localhost:4000").hostname === "localhost";
  } catch {
    return process.env.NODE_ENV === "development";
  }
}

function createCode(): string {
  // Stable local code makes manual localhost QA fast. Production always uses a
  // cryptographically random six-digit code.
  if (isLocalhost()) return "111111";
  return String(randomInt(100000, 1000000));
}

function displayNameFromEmail(email: string): { fullName: string; firstName: string } {
  const localPart = email.split("@")[0] ?? "there";
  const fullName = localPart
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "There";
  return { fullName, firstName: fullName.split(/\s+/)[0] ?? "There" };
}

async function sendLoginEmail(email: string, code: string, token: string): Promise<void> {
  const baseUrl = process.env.WASP_WEB_CLIENT_URL ?? "http://localhost:4000";
  const loginUrl = `${baseUrl}/login?magic=${encodeURIComponent(token)}`;
  const emailModule = "wasp/server/" + "email";
  const { emailSender } = await import(emailModule);
  await emailSender.send({
    to: email,
    subject: "Your ActionAmp sign-in code",
    text: `Your ActionAmp sign-in code is ${code}. It expires in 10 minutes. Or sign in directly: ${loginUrl}`,
    html: await renderMagicLoginEmailHtml({ code, loginUrl }),
  });
}

export const requestMagicLogin = (async (args: MagicLoginInput, context) => {
  const email = normalizeEmail(args.email);
  const recent = await context.entities.MagicLoginChallenge.findFirst({
    where: {
      email,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      createdAt: { gt: new Date(Date.now() - RESEND_INTERVAL_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  // Same calm response for a fresh and rate-limited request. This limits email
  // spam without revealing whether an account already exists.
  if (recent) return { sent: true };

  // A newer request supersedes every older email for this address. That keeps
  // one clear sign-in path alive and limits the blast radius of a stale inbox.
  await context.entities.MagicLoginChallenge.updateMany({
    where: { email, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const id = randomUUID();
  const code = createCode();
  const token = randomBytes(32).toString("base64url");
  await context.entities.MagicLoginChallenge.create({
    data: {
      id,
      email,
      codeHash: hash(`${id}:${code}`),
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  // Localhost has a fixed code for fast manual QA. No email provider needed.
  if (!isLocalhost()) {
    try {
      await sendLoginEmail(email, code, token);
    } catch {
      // Never leave a usable credential behind if delivery failed.
      await context.entities.MagicLoginChallenge.delete({ where: { id } }).catch(() => undefined);
      throw new HttpError(503, "Could not send email. Try again shortly.");
    }
  }
  return { sent: true };
}) satisfies RequestMagicLogin<MagicLoginInput, { sent: true }>;

async function resolveChallenge(args: VerifyMagicLoginInput, entities: any) {
  const now = new Date();
  if (typeof args.token === "string" && args.token.length > 0) {
    return entities.MagicLoginChallenge.findFirst({
      where: { tokenHash: hash(args.token), consumedAt: null, expiresAt: { gt: now } },
    });
  }

  const email = normalizeEmail(args.email);
  const code = typeof args.code === "string" ? args.code.trim() : "";
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "Enter the six-digit code.");
  const challenge = await entities.MagicLoginChallenge.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.codeHash !== hash(`${challenge.id}:${code}`)) {
    if (challenge) {
      await entities.MagicLoginChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
    }
    throw new HttpError(400, "That code is not valid. Try again or request a new one.");
  }
  return challenge;
}

export const verifyMagicLogin = (async (args: VerifyMagicLoginInput, context) => {
  const challenge = await resolveChallenge(args, context.entities);
  if (!challenge) throw new HttpError(400, "That sign-in link is no longer valid. Request a new one.");

  // Atomic consume prevents concurrent code/link submissions from creating two
  // sessions. The selected row must still be unused at write time.
  const consumed = await context.entities.MagicLoginChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw new HttpError(400, "That sign-in link was already used.");

  const providerId = createProviderId("email", challenge.email);
  const identity = await findAuthIdentity(providerId);
  let authId = identity?.authId;
  if (!authId) {
    const { fullName, firstName } = displayNameFromEmail(challenge.email);
    const user = await createUser(
      providerId,
      JSON.stringify({
        hashedPassword: await hashPassword(randomBytes(32).toString("base64url")),
        isEmailVerified: true,
        emailVerificationSentAt: null,
        passwordResetSentAt: null,
      }),
      { fullName, firstName },
    );
    authId = user.auth?.id;
  }
  if (!authId) throw new HttpError(500, "Could not create your session.");

  const session = await createSession(authId);
  return { sessionId: session.id };
}) satisfies VerifyMagicLogin<VerifyMagicLoginInput, { sessionId: string }>;
