/**
 * Admin seed — `bun src/seed-admin.ts` (S17).
 *
 * Ensures the local dev database has the fixtures the admin dashboard (and
 * its e2e spec) need: one admin user, two managee accounts to grant/delete,
 * a lens + tasks per managee (so the activity columns aren't all zeros), and
 * three feedback rows across the triage statuses.
 *
 * Idempotent: every row is find-or-create (users by email identity, feedback
 * by shortId), so re-running only tops up what's missing — an admin whose
 * rows exist is NOT demoted or overwritten (its only write is `isAdmin: true`,
 * which is the point of the seed).
 *
 * Safety: REFUSES to run against anything but a localhost database — same
 * guard as src/seed.ts. It writes rows and must never touch staging/prod.
 */
import { and, eq } from "drizzle-orm";
import {
  auth,
  authIdentity,
  createDb,
  feedback,
  lens as lensTable,
  mintId,
  task as taskTable,
  user as userTable,
} from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { uniquePermalink } from "@actionamp/domain/shared/permalinks";
import { ensureEmailUser } from "./auth/seed-session.js";
import { databaseUrl, isLocalDatabaseUrl } from "./db.js";

/** The admin account the dashboard e2e logs in as (dev login + seed agree). */
export const SEED_ADMIN_EMAIL = "admin@local.test";

/** Managee fixtures — one recently active, one never active. */
const MANAGEES = [
  { email: "ada@local.test", firstName: "Ada", fullName: "Ada Lovelace", activeDaysAgo: 0 },
  { email: "grace@local.test", firstName: "Grace", fullName: "Grace Hopper", activeDaysAgo: null },
] as const;

const FEEDBACK_ROWS = [
  {
    shortId: "TEST-0001",
    message: "The capture popover loses my draft when I switch lenses.",
    status: "OPEN" as const,
    route: "/do",
    section: "work",
    daysAgo: 1,
  },
  {
    shortId: "TEST-0002",
    message: "Would love a weekly review digest in the inbox.",
    status: "IN_PROGRESS" as const,
    route: "/do/inbox",
    section: "plan",
    daysAgo: 2,
  },
  {
    shortId: "TEST-0003",
    message: "Keyboard shortcut for triage delete feels risky — consider a confirm.",
    status: "RESOLVED" as const,
    route: "/do/inbox/review",
    section: "review",
    daysAgo: 5,
  },
] as const;

async function promoteToAdmin(db: DomainDb, email: string): Promise<string> {
  const seeded = await ensureEmailUser(db, email);
  await db.update(userTable).set({ isAdmin: true }).where(eq(userTable.id, seeded.userId));
  return seeded.userId;
}

async function findUserId(db: DomainDb, email: string): Promise<string | null> {
  const rows = await db
    .select({ userId: auth.userId })
    .from(authIdentity)
    .innerJoin(auth, eq(auth.id, authIdentity.authId))
    .where(and(eq(authIdentity.providerName, "email"), eq(authIdentity.providerUserId, email)))
    .limit(1);
  return rows[0]?.userId ?? null;
}

async function seedManagee(
  db: DomainDb,
  managee: (typeof MANAGEES)[number],
): Promise<void> {
  const seeded = await ensureEmailUser(db, managee.email);
  const activeAt =
    managee.activeDaysAgo === null
      ? null
      : new Date(Date.now() - managee.activeDaysAgo * 86_400_000);
  await db
    .update(userTable)
    .set({
      firstName: managee.firstName,
      fullName: managee.fullName,
      lastActiveAt: activeAt,
      createdAt: new Date(Date.now() - 3 * 86_400_000),
    })
    .where(eq(userTable.id, seeded.userId));

  // A lens + a couple of recent tasks, so the directory's 7d activity columns
  // and the overview's task tiles have real rows to count.
  const existingLens = await db
    .select({ id: lensTable.id })
    .from(lensTable)
    .where(eq(lensTable.userId, seeded.userId))
    .limit(1);
  let lensId = existingLens[0]?.id;
  if (!lensId) {
    const inserted = await db
      .insert(lensTable)
      .values({ id: mintId(), name: "Me", isDefault: true, isIncluded: true, userId: seeded.userId })
      .returning({ id: lensTable.id });
    lensId = inserted[0].id;
  }
  const existingTasks = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(eq(taskTable.userId, seeded.userId))
    .limit(1);
  if (!existingTasks[0]) {
    for (const description of [
      "Skim the admin dashboard notes",
      "Try a manual access grant",
    ]) {
      await db.insert(taskTable).values({
        id: mintId(),
        description,
        permalink: await uniquePermalink(description, async (candidate) => {
          const clash = await db
            .select({ id: taskTable.id })
            .from(taskTable)
            .where(eq(taskTable.permalink, candidate))
            .limit(1);
          return !!clash[0];
        }),
        userId: seeded.userId,
        lensId,
        status: "TODAY",
        updatedAt: new Date(),
      });
    }
  }
}

async function seedFeedback(db: DomainDb): Promise<void> {
  const adminId = await findUserId(db, SEED_ADMIN_EMAIL);
  if (!adminId) throw new Error("Admin user must be seeded before feedback rows.");
  for (const row of FEEDBACK_ROWS) {
    const existing = await db
      .select({ id: feedback.id })
      .from(feedback)
      .where(eq(feedback.shortId, row.shortId))
      .limit(1);
    if (existing[0]) continue;
    await db.insert(feedback).values({
      id: mintId(),
      shortId: row.shortId,
      message: row.message,
      status: row.status,
      userId: adminId,
      userName: "ActionAmp Admin",
      userEmail: SEED_ADMIN_EMAIL,
      route: row.route,
      section: row.section,
      createdAt: new Date(Date.now() - row.daysAgo * 86_400_000),
      updatedAt: new Date(Date.now() - row.daysAgo * 86_400_000),
    });
  }
}

async function main(): Promise<void> {
  const url = databaseUrl();
  if (!isLocalDatabaseUrl(url)) {
    console.error(
      `Refusing to seed admin fixtures: DATABASE_URL host is not localhost (${url.replace(/\/\/[^@/]*@/, "//<redacted>@")}).`,
    );
    process.exit(1);
  }
  const db = createDb(url);
  try {
    const adminId = await promoteToAdmin(db, SEED_ADMIN_EMAIL);
    for (const managee of MANAGEES) {
      await seedManagee(db, managee);
    }
    await seedFeedback(db);
    console.log(
      JSON.stringify({
        event: "admin-seeded",
        adminEmail: SEED_ADMIN_EMAIL,
        adminId,
        managees: MANAGEES.map((m) => m.email),
        feedback: FEEDBACK_ROWS.length,
      }),
    );
  } finally {
    await db.$client.end();
  }
}

main();
