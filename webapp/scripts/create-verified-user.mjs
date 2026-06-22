#!/usr/bin/env node
/**
 * ActionAmp — create a fresh, email-verified user (for e2e tests).
 *
 * Creates the full User → Auth → AuthIdentity chain with isEmailVerified=true
 * and a known argon2id password hash, so Playwright can log in immediately
 * without the email round-trip. Prints the email on stdout (last line).
 *
 * Bypasses the signup endpoint entirely because SKIP_EMAIL_VERIFICATION_IN_DEV
 * is unreliable in this dev server session — direct DB insert is deterministic.
 *
 * USAGE:
 *   node scripts/create-verified-user.mjs --email a@b.c --password 'p' --fullName 'E2E'
 *
 * ponytail: the User/Auth/AuthIdentity shape + providerData JSON are Wasp
 * internals. If this breaks after a Wasp upgrade, re-check the generated
 * schema (.wasp/out/db/schema.prisma) and @wasp.sh/lib-auth/node exports.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@wasp.sh/lib-auth/node";

const argv = process.argv.slice(2);
const get = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const email = get("--email");
const password = get("--password");
const fullName = get("--fullName") ?? "E2E User";
if (!email || !password) {
  console.error("Usage: node scripts/create-verified-user.mjs --email X --password 'Y' [--fullName 'Z']");
  process.exit(1);
}
const firstName = fullName.split(/\s+/)[0];

const db = new PrismaClient();
try {
  // Idempotent: if the identity already exists (re-run), reset + verify it.
  const existing = await db.authIdentity.findUnique({
    where: { providerName_providerUserId: { providerName: "email", providerUserId: email } },
    include: { auth: { include: { user: true } } },
  });

  if (existing) {
    const data = JSON.parse(existing.providerData || "{}");
    data.hashedPassword = await hashPassword(password);
    data.isEmailVerified = true;
    await db.authIdentity.update({
      where: { providerName_providerUserId: { providerName: "email", providerUserId: email } },
      data: { providerData: JSON.stringify(data) },
    });
    console.log(email);
    process.exit(0);
  }

  // Fresh create: User → Auth → verified email identity, matching Wasp's shape.
  const providerData = JSON.stringify({
    hashedPassword: await hashPassword(password),
    isEmailVerified: true,
    emailVerificationSentAt: null,
    passwordResetSentAt: null,
  });

  await db.user.create({
    data: {
      fullName,
      firstName,
      auth: {
        create: {
          identities: {
            create: {
              providerName: "email",
              providerUserId: email,
              providerData,
            },
          },
        },
      },
    },
  });

  console.log(email);
} finally {
  await db.$disconnect();
}
