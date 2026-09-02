/**
 * S1+S4 e2e seed — `bun src/seed-s4.ts` (idempotent, localhost-only).
 *
 * Ensures the three per-spec e2e users exist (dev-style, via the F10c
 * helper) with a "Me" lens and exactly the rows the S1/S4 specs assert
 * against:
 *
 *   s4-next@test.local   "Bench task" (Upcoming, undated — the /do
 *                        empty-pool probe) + "Deep work task" (Someday —
 *                        the spec promotes it to Today, then starts and
 *                        completes it through focus).
 *   s4-today@test.local  "Focus task 1..6" (Today — the cap test's six
 *                        commits) + "Swap me around" (Today — the When-chip
 *                        demote/promote round-trip).
 *   s4-lists@test.local  SIMPLE_LIST projects "Packing" (/do/projects/
 *                        packing) and "Groceries" (empty checklist).
 *
 * `lastTodayRolloverAt` is stamped to now for every seeded user so the lazy
 * daily rollover in getAppData never sweeps the seeded Today rows to
 * Upcoming mid-run. RESET semantics, not top-up: each seeded user's task rows
 * (and list items) are wiped and re-created on every run, so specs assume
 * fresh rows regardless of what a previous run did. This file never edits
 * seed.ts's rows — it is additive to the dev user's data, not a replacement
 * of it.
 */
import { and, eq } from "drizzle-orm";
import {
  createDb,
  lens as lensTable,
  listItem as listItemTable,
  project as projectTable,
  task as taskTable,
  user as userTable,
} from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { databaseUrl, isLocalDatabaseUrl } from "./db.js";
import { ensureEmailUser } from "./auth/seed-session.js";

interface SeedTask {
  description: string;
  status: "TODAY" | "UPCOMING" | "SOMEDAY";
  priority?: "LOW" | "NORMAL" | "IMPORTANT";
  order: number;
}

const S4_USERS: Array<{ email: string; tasks: SeedTask[]; listProjects?: string[] }> = [
  {
    email: "s4-next@test.local",
    tasks: [
      { description: "Bench task", status: "UPCOMING", order: 0 },
      { description: "Deep work task", status: "SOMEDAY", order: 1 },
    ],
  },
  {
    email: "s4-today@test.local",
    tasks: [
      { description: "Focus task 1", status: "TODAY", order: 0 },
      { description: "Focus task 2", status: "TODAY", order: 1 },
      { description: "Focus task 3", status: "TODAY", order: 2 },
      { description: "Focus task 4", status: "TODAY", order: 3 },
      { description: "Focus task 5", status: "TODAY", order: 4 },
      { description: "Focus task 6", status: "TODAY", order: 5 },
      { description: "Swap me around", status: "TODAY", order: 6 },
    ],
  },
  {
    email: "s4-lists@test.local",
    tasks: [],
    listProjects: ["Packing", "Groceries"],
  },
];

async function ensureUser(db: DomainDb, email: string): Promise<string> {
  const seeded = await ensureEmailUser(db, email);
  return seeded.userId;
}

async function ensureLens(db: DomainDb, userId: string): Promise<string> {
  const existing = await db
    .select({ id: lensTable.id })
    .from(lensTable)
    .where(and(eq(lensTable.userId, userId), eq(lensTable.name, "Me")))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const lensId = crypto.randomUUID();
  await db.insert(lensTable).values({
    id: lensId,
    name: "Me",
    userId,
    isDefault: true,
    isIncluded: true,
  });
  return lensId;
}

async function ensureTask(
  db: DomainDb,
  userId: string,
  lensId: string,
  sample: SeedTask,
): Promise<void> {
  const existing = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(and(eq(taskTable.userId, userId), eq(taskTable.description, sample.description)))
    .limit(1);
  if (existing[0]) return;
  await db.insert(taskTable).values({
    id: crypto.randomUUID(),
    description: sample.description,
    status: sample.status,
    priority: sample.priority ?? "NORMAL",
    order: sample.order,
    userId,
    lensId,
    permalink: `${sample.description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}-${sample.order}`,
    updatedAt: new Date(),
  });
}

async function ensureListProject(
  db: DomainDb,
  userId: string,
  lensId: string,
  name: string,
): Promise<void> {
  const permalink = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existing = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(and(eq(projectTable.userId, userId), eq(projectTable.permalink, permalink)))
    .limit(1);
  if (existing[0]) return;
  await db.insert(projectTable).values({
    id: crypto.randomUUID(),
    name,
    userId,
    lensId,
    permalink,
    type: "SIMPLE_LIST",
    isDone: false,
    order: 0,
  });
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
  for (const spec of S4_USERS) {
    const userId = await ensureUser(db, spec.email);
    const lensId = await ensureLens(db, userId);
    // RESET, not just top-up: the specs assume fresh rows (a previous run
    // may have completed/promoted the seeded tasks). These are dedicated
    // test users — wiping their task rows + list items keeps re-runs
    // deterministic in a way find-or-create cannot.
    await db.delete(taskTable).where(eq(taskTable.userId, userId));
    for (const name of spec.listProjects ?? []) {
      await ensureListProject(db, userId, lensId, name);
      const permalink = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const projectRow = (
        await db
          .select({ id: projectTable.id })
          .from(projectTable)
          .where(and(eq(projectTable.userId, userId), eq(projectTable.permalink, permalink)))
          .limit(1)
      )[0];
      if (projectRow) {
        await db.delete(listItemTable).where(eq(listItemTable.projectId, projectRow.id));
      }
    }
    for (const sample of spec.tasks) {
      await ensureTask(db, userId, lensId, sample);
    }
    // Stamp the rollover clock so the lazy rollover never sweeps the seeded
    // Today rows to Upcoming on the first getAppData call of a run.
    await db
      .update(userTable)
      .set({ lastTodayRolloverAt: new Date() })
      .where(eq(userTable.id, userId));
    console.log(JSON.stringify({ event: "s4-seeded", email: spec.email, userId }));
  }
} finally {
  await db.$client.end();
}
