/**
 * S7/S11 e2e seed — `bun src/seed-lenses.ts` (idempotent, localhost-only).
 *
 * Ensures the two lens-management e2e users exist (dev-style, via the F10c
 * helper) with exactly the rows the lenses spec asserts against:
 *
 *   s11-lenses@test.local  PRO (renews in a year) — Me (included) + Work
 *                          (indigo, "Day job"; 1 goal / 1 project / 1 task)
 *                          + Studio (empty, coral).
 *   s11-free@test.local    FREE with the same two defaults — the whole
 *                          Lenses tab must render its ProGate and the ops 402.
 *
 * RESET semantics, not top-up: each seeded user's goal/project/task rows and
 * custom lenses are wiped and re-created on every run (the default Me/Work
 * lenses are kept, Studio is re-created), so specs assume fresh rows. This
 * file never edits seed.ts's rows — it is additive to the dev user's data.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  createDb,
  goal as goalTable,
  lens as lensTable,
  project as projectTable,
  task as taskTable,
  user as userTable,
} from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { databaseUrl, isLocalDatabaseUrl } from "./db.js";
import { ensureEmailUser } from "./auth/seed-session.js";

/** A year out — isPlanActive treats PRO with a future renewal as entitled. */
const RENEWAL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const PRO_EMAIL = "s11-lenses@test.local";
const FREE_EMAIL = "s11-free@test.local";

async function ensureUser(db: DomainDb, email: string, plan: "FREE" | "PRO"): Promise<string> {
  const seeded = await ensureEmailUser(db, email);
  if (plan === "PRO") {
    await db
      .update(userTable)
      .set({ plan: "PRO", planRenewsAt: RENEWAL })
      .where(eq(userTable.id, seeded.userId));
  }
  return seeded.userId;
}

async function ensureLens(
  db: DomainDb,
  userId: string,
  name: string,
  opts: { isDefault: boolean; isIncluded: boolean; color?: string; purpose?: string },
): Promise<string> {
  const existing = await db
    .select({ id: lensTable.id })
    .from(lensTable)
    .where(and(eq(lensTable.userId, userId), eq(lensTable.name, name)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const lensId = crypto.randomUUID();
  await db.insert(lensTable).values({
    id: lensId,
    name,
    userId,
    isDefault: opts.isDefault,
    isIncluded: opts.isIncluded,
    color: opts.color ?? null,
    purpose: opts.purpose ?? null,
  });
  return lensId;
}

async function ensureProContent(db: DomainDb, userId: string, workLensId: string): Promise<void> {
  // Idempotency keys are the fixed names/descriptions (RESET below wipes them
  // on every run anyway — these guards only matter for a first run).
  const existingGoal = await db
    .select({ id: goalTable.id })
    .from(goalTable)
    .where(and(eq(goalTable.userId, userId), eq(goalTable.name, "Launch")))
    .limit(1);
  let goalId = existingGoal[0]?.id;
  if (!goalId) {
    goalId = crypto.randomUUID();
    await db.insert(goalTable).values({
      id: goalId,
      name: "Launch",
      userId,
      lensId: workLensId,
      permalink: "launch",
    });
  }

  const existingProject = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(and(eq(projectTable.userId, userId), eq(projectTable.name, "Website refresh")))
    .limit(1);
  if (!existingProject[0]) {
    await db.insert(projectTable).values({
      id: crypto.randomUUID(),
      name: "Website refresh",
      userId,
      lensId: workLensId,
      goalId,
      permalink: "website-refresh",
      type: "STANDARD",
      isDone: false,
      order: 0,
    });
  }

  const existingTask = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(and(eq(taskTable.userId, userId), eq(taskTable.description, "Draft the refresh brief")))
    .limit(1);
  if (!existingTask[0]) {
    await db.insert(taskTable).values({
      id: crypto.randomUUID(),
      description: "Draft the refresh brief",
      status: "UPCOMING",
      priority: "NORMAL",
      order: 0,
      userId,
      lensId: workLensId,
      permalink: "draft-the-refresh-brief",
      updatedAt: new Date(),
    });
  }
}

/** RESET: wipe the spec user's work rows + custom lenses (defaults kept). */
async function resetWorkRows(db: DomainDb, userId: string): Promise<void> {
  await db.delete(taskTable).where(eq(taskTable.userId, userId));
  await db.delete(projectTable).where(eq(projectTable.userId, userId));
  await db.delete(goalTable).where(eq(goalTable.userId, userId));
  const defaults = await db
    .select({ id: lensTable.id })
    .from(lensTable)
    .where(and(eq(lensTable.userId, userId), eq(lensTable.isDefault, true)));
  const keepIds = defaults.map((l) => l.id);
  const customs = await db.select({ id: lensTable.id }).from(lensTable).where(eq(lensTable.userId, userId));
  const removeIds = customs.map((l) => l.id).filter((id) => !keepIds.includes(id));
  if (removeIds.length > 0) {
    await db.delete(lensTable).where(inArray(lensTable.id, removeIds));
  }
}

const url = databaseUrl();
if (!isLocalDatabaseUrl(url)) {
  console.error(
    `Refusing to seed: DATABASE_URL host is not localhost (${url.replace(/\/\/[^@/]*@/, "//<redacted>@")}). ` +
      "The seed writes rows and only ever runs against a local dev database.",
  );
  process.exit(1);
}

const db = createDb(url);
try {
  const proUserId = await ensureUser(db, PRO_EMAIL, "PRO");
  const freeUserId = await ensureUser(db, FREE_EMAIL, "FREE");

  for (const userId of [proUserId, freeUserId]) {
    await resetWorkRows(db, userId);
    await ensureLens(db, userId, "Me", { isDefault: true, isIncluded: true });
    await ensureLens(db, userId, "Work", {
      isDefault: true,
      isIncluded: false,
      color: "indigo",
      purpose: "Day job",
    });
  }

  // Pro-only content: Work's blocking content + an empty custom lens.
  const workLensId = await ensureLens(db, proUserId, "Work", {
    isDefault: true,
    isIncluded: false,
    color: "indigo",
    purpose: "Day job",
  });
  await ensureProContent(db, proUserId, workLensId);
  await ensureLens(db, proUserId, "Studio", {
    isDefault: false,
    isIncluded: false,
    color: "coral",
    purpose: "Side projects",
  });

  // Stamp the rollover clock so the lazy rollover never sweeps seeded rows,
  // and RESET the preference fields the specs touch (cap saves, focus radio).
  await db
    .update(userTable)
    .set({
      lastTodayRolloverAt: new Date(),
      todayCap: 5,
      focusSessionMinutes: 25,
      todayReviewEnabled: true,
      weekReviewEnabled: true,
      monthReviewEnabled: true,
      dailyReminderEnabled: false,
      dailyReminderTime: "09:00",
      dailyReminderTimeZone: "UTC",
    })
    .where(inArray(userTable.id, [proUserId, freeUserId]));

  console.log(
    JSON.stringify({
      event: "lenses-seeded",
      pro: { email: PRO_EMAIL, userId: proUserId },
      free: { email: FREE_EMAIL, userId: freeUserId },
    }),
  );
} finally {
  await db.$client.end();
}
