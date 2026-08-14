#!/usr/bin/env node
/**
 * ActionAmp — dev user password reset + email verify.
 *
 * One-off dev helper: sets a known password and marks the email verified for a
 * user, bypassing the email/verification flows. Uses Wasp's own `hashPassword`
 * (argon2id, same as signup) so the hash matches what login expects.
 *
 * USAGE:
 *   node scripts/reset-user.mjs --email test@example.com --password 'Testpass123!'
 *   node scripts/reset-user.mjs --email a@b.c --password 'x' --no-verify  # skip verify
 *
 * ponytail: argon2 hashing + providerData JSON shape are Wasp internals that
 * could change between versions. If this breaks after a Wasp upgrade, re-check
 * @wasp.sh/lib-auth/node exports and the AuthIdentity.providerData schema.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@wasp.sh/lib-auth/node";

// ponytail: bespoke argv parse — 2 flags, not worth a CLI dep.
const argv = process.argv.slice(2);
const email = argv[argv.indexOf("--email") + 1];
const password = argv[argv.indexOf("--password") + 1];
const verify = !argv.includes("--no-verify");
if (!email || !password || password === true) {
  console.error("Usage: node scripts/reset-user.mjs --email X --password 'Y' [--no-verify]");
  process.exit(1);
}

const db = new PrismaClient();
try {
  const identity = await db.authIdentity.findUnique({
    where: {
      providerName_providerUserId: { providerName: "email", providerUserId: email },
    },
    include: { auth: { include: { user: true } } },
  });
  if (!identity) {
    console.error(`✗ No email identity for ${email}`);
    process.exit(2);
  }

  const data = JSON.parse(identity.providerData || "{}");
  data.hashedPassword = await hashPassword(password);
  if (verify) data.isEmailVerified = true;

  await db.authIdentity.update({
    where: { providerName_providerUserId: { providerName: "email", providerUserId: email } },
    data: { providerData: JSON.stringify(data) },
  });

  // Mark onboarding complete so the seeded dev/e2e user lands on /do, not
  // /welcome — the first-run gate in App.tsx redirects hasSeenOnboarding=false
  // users. Skipped with --no-verify for parity with the email-verify flag.
  if (verify) {
    await db.user.update({
      where: { id: identity.auth.userId },
      data: { hasSeenOnboarding: true },
    });
  }

  console.log(`✓ ${email} → password reset, email ${verify ? "verified" : "left as-is"}, onboarding ${verify ? "completed" : "left as-is"}`);
  console.log(`  user: ${identity.auth.user.fullName} (${identity.auth.userId})`);
} finally {
  await db.$disconnect();
}
