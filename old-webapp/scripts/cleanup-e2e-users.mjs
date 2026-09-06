#!/usr/bin/env node
/**
 * Removes only disposable Playwright accounts created by e2e/helpers.ts.
 *
 * The address guard intentionally matches the helper's exact generated form:
 * e2e-<random>@test.actionamp.dev. Run without --delete to inspect targets.
 */
import { PrismaClient } from "@prisma/client";

const execute = process.argv.includes("--delete");
const TEST_EMAIL = /^e2e-[a-z0-9-]+@test\.actionamp\.dev$/i;
const db = new PrismaClient();

try {
  const identities = await db.authIdentity.findMany({
    where: { providerName: "email", providerUserId: { startsWith: "e2e-", endsWith: "@test.actionamp.dev" } },
    select: { providerUserId: true, auth: { select: { userId: true } } },
  });
  const targets = identities.filter((identity) => TEST_EMAIL.test(identity.providerUserId));
  if (!execute) {
    console.log(`Would delete ${targets.length} e2e user(s).`);
    for (const target of targets) console.log(target.providerUserId);
    process.exit(0);
  }
  for (const target of targets) {
    await db.user.delete({ where: { id: target.auth.userId } });
  }
  console.log(`Deleted ${targets.length} e2e user(s).`);
} finally {
  await db.$disconnect();
}
