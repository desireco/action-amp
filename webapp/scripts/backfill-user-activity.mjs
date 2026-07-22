#!/usr/bin/env node
/**
 * One-off: backfill User.createdAt for pre-existing users.
 *
 * Background: the `createdAt` column was added to `User` in migration
 * 20260722173258_user_activity_fields (Task 1) with
 * `DEFAULT CURRENT_TIMESTAMP`. For users that already existed, that means
 * their `createdAt` was set to the *migration-run time* — not their real
 * signup time. The admin dashboard's signup metrics
 * (src/admin/operationsCore.ts) filter on `User.createdAt`, so without a
 * backfill every legacy user is counted as a brand-new signup.
 *
 * --------------------------------------------------------------------------
 * VERIFIED SCHEMA (read from .wasp/out/db/schema.prisma on 2026-07-22,
 * Wasp ^0.24.0). The plan's draft assumed `AuthIdentity.creationTimestamp`
 * — THAT FIELD DOES NOT EXIST. Verified field names:
 *
 *   model User {
 *     id        String  @id @default(uuid())
 *     createdAt DateTime @default(now())
 *     lastActiveAt DateTime?
 *     auth      Auth?
 *   }
 *   model Auth {              // one-to-one with User (User.auth → Auth?)
 *     id         String   @id @default(uuid())
 *     userId     String?  @unique
 *     identities AuthIdentity[]
 *   }
 *   model AuthIdentity {      // NO timestamp field at all
 *     providerName   String
 *     providerUserId String
 *     providerData   String  @default("{}")
 *     authId         String
 *     auth           Auth    @relation(fields: [authId], references: [id])
 *     @@id([providerName, providerUserId])
 *   }
 *
 * Confirmed against the DB DDL in migrations/20260616223539_init/migration.sql:
 * neither `Auth`, `AuthIdentity`, nor `Session` has any created/updated
 * timestamp column. So there is no "earliest identity creation" to read —
 * the plan's strategy is impossible in this Wasp version.
 * --------------------------------------------------------------------------
 *
 * ADAPTATION: since the auth tables carry no timestamp, we instead take the
 * earliest `createdAt` across the user's own records (Lens, Goal, Project,
 * Task, TaskUpdate, TaskSession, Feedback, Resource, InboxItem, ApiKey,
 * Payment) as the best available proxy for when they actually started using
 * the app. For a legacy user, that earliest activity is older than the
 * migration-run timestamp, so we update. For a user who genuinely signed up
 * after the migration, their real `createdAt` (set by `@default(now())` at
 * insert) is already <= any of their activity, so they are skipped.
 *
 * Users with NO activity records at all are skipped (we can't derive
 * anything better than what's there, and overwriting with NULL would lose
 * the column's NOT NULL value).
 *
 * Idempotent: a re-run only writes where the derived proxy is strictly
 * earlier than the current `createdAt`. Safe to run multiple times.
 *
 * Usage:
 *   node webapp/scripts/backfill-user-activity.mjs
 *
 * Requires DATABASE_URL in env. Uses @prisma/client directly (same pattern
 * as src/auth/prisma.ts and scripts/create-verified-user.mjs). DO NOT run
 * against the dev DB casually — the operator runs this once against prod at
 * deploy time. (It is safe to re-run, but it mutates every legacy user row.)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Per-user tables that carry a `createdAt` timestamp and a `userId` FK.
 * Mirrored from .wasp/out/db/schema.prisma. If a model is added/renamed in
 * a future migration, update this list.
 */
const ACTIVITY_MODELS = [
  "lens",
  "goal",
  "project",
  "task",
  "taskUpdate",
  "taskSession",
  "feedback",
  "resource",
  "inboxItem",
  "apiKey",
  "payment",
];

/**
 * Find the earliest `createdAt` across all of a user's activity records.
 * Issues one bounded `findFirst` per table (ordered asc, take 1) and takes
 * the min. Returns null if the user has no activity at all.
 */
async function earliestActivity(userId) {
  let earliest = null;
  for (const model of ACTIVITY_MODELS) {
    const row = await prisma[model].findFirst({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const ts = row?.createdAt;
    if (ts && (!earliest || ts.getTime() < earliest.getTime())) {
      earliest = ts;
    }
  }
  return earliest;
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, createdAt: true },
  });

  let updated = 0;
  let skippedNoActivity = 0;
  let skippedAlreadyCorrect = 0;

  for (const u of users) {
    const proxy = await earliestActivity(u.id);
    if (!proxy) {
      // No activity records to derive from — leave createdAt alone.
      skippedNoActivity++;
      continue;
    }
    // Only update if the derived proxy is strictly earlier than the current
    // value. Legacy users got createdAt = migration-run time (later than
    // their first activity); genuine post-migration signups already have a
    // correct (earlier-or-equal) createdAt and are left untouched. This is
    // the idempotency guard: a re-run finds proxy >= createdAt and skips.
    if (u.createdAt && u.createdAt.getTime() <= proxy.getTime()) {
      skippedAlreadyCorrect++;
      continue;
    }
    await prisma.user.update({
      where: { id: u.id },
      data: { createdAt: proxy },
    });
    updated++;
  }

  console.log(
    `Backfill complete: ${updated} users updated, ` +
      `${skippedAlreadyCorrect} already correct, ` +
      `${skippedNoActivity} skipped (no activity) ` +
      `(total ${users.length}).`,
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
