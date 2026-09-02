/**
 * Dev seed — `bun src/seed.ts` (F8b).
 *
 * Ensures the local dev database (actionamp_dev) has one dev user with a lens
 * and a handful of open tasks, so the API's /rpc surface returns real data.
 * Idempotent: every row is find-or-create, so re-running only tops up what's
 * missing.
 *
 * Safety: this script REFUSES to run against anything but a localhost
 * database — it writes rows, and must never point at staging/prod.
 *
 * Client-side default obligations (docs/plans/introspection-report.md §4):
 * the seam's delegates are read/update-shaped (no Task/Lens/User create), so
 * inserts go through Drizzle directly and apply the Prisma-era client-side
 * defaults the seam normally supplies — uuid ids via `mintId()`, and
 * `updatedAt` on Task (no DB default; ordering-critical for the Logbook).
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  auth,
  authIdentity,
  lens as lensTable,
  task as taskTable,
  user as userTable,
} from "@actionamp/domain/db";
import { createDb, mintId } from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { uniquePermalink } from "@actionamp/domain/shared/permalinks";
import { SEED_DEV_EMAIL, databaseUrl, isLocalDatabaseUrl } from "./db.js";

/** The sample rows: calm content across the three open statuses. */
const SAMPLE_TASKS = [
  {
    description: "Reply to Dana about the venue shortlist",
    status: "TODAY" as const,
    priority: "IMPORTANT" as const,
    order: 0,
  },
  {
    description: "Draft the September signup announcement",
    status: "TODAY" as const,
    priority: "NORMAL" as const,
    order: 1,
  },
  {
    description: "Book the dentist",
    status: "UPCOMING" as const,
    priority: "LOW" as const,
    order: 2,
  },
  {
    description: "Read the deployment research doc",
    status: "SOMEDAY" as const,
    priority: "NORMAL" as const,
    order: 3,
  },
];

async function findDevUserId(db: DomainDb): Promise<string | null> {
  const rows = await db
    .select({ userId: auth.userId })
    .from(authIdentity)
    .innerJoin(auth, eq(authIdentity.authId, auth.id))
    .where(
      and(
        eq(authIdentity.providerName, "email"),
        eq(authIdentity.providerUserId, SEED_DEV_EMAIL),
      ),
    )
    .limit(1);
  return rows[0]?.userId ?? null;
}

async function ensureDevUser(db: DomainDb): Promise<string> {
  const existing = await findDevUserId(db);
  if (existing) return existing;

  const userId = mintId();
  const authId = mintId();
  await db.insert(userTable).values({
    id: userId,
    firstName: "Dev",
    fullName: "Dev Local",
  });
  await db.insert(auth).values({ id: authId, userId });
  await db.insert(authIdentity).values({
    providerName: "email",
    providerUserId: SEED_DEV_EMAIL,
    // Wasp's email-identity shape; hashedPassword stays null — real login is
    // F10's job, this identity only anchors the API's dev-user stub.
    providerData: JSON.stringify({
      hashedPassword: null,
      isEmailVerified: true,
    }),
    authId,
  });
  return userId;
}

async function ensurePrimaryLens(
  db: DomainDb,
  userId: string,
): Promise<string> {
  const existing = await db
    .select({ id: lensTable.id })
    .from(lensTable)
    .where(and(eq(lensTable.userId, userId), eq(lensTable.name, "Me")))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const lensId = mintId();
  await db.insert(lensTable).values({
    id: lensId,
    name: "Me",
    userId,
    isDefault: true,
    isIncluded: true,
  });
  return lensId;
}

async function ensureSampleTasks(
  db: DomainDb,
  userId: string,
  lensId: string,
): Promise<number> {
  let created = 0;
  // RESET semantics for the sample rows: specs complete/promote them, so a
  // find-or-create top-up would leave isDone=true rows behind and fail the
  // next run. Deleting exactly the four sample descriptions (scoped to this
  // user) keeps re-runs deterministic without touching other data.
  await db
    .delete(taskTable)
    .where(
      and(
        eq(taskTable.userId, userId),
        inArray(
          taskTable.description,
          SAMPLE_TASKS.map((sample) => sample.description),
        ),
      ),
    );
  for (const sample of SAMPLE_TASKS) {

    // The domain's own slug math (same helper the webapp create paths use) —
    // collision-retried against the Task(userId, permalink) unique.
    const permalink = await uniquePermalink(sample.description, async (candidate) => {
      const hit = await db
        .select({ id: taskTable.id })
        .from(taskTable)
        .where(and(eq(taskTable.userId, userId), eq(taskTable.permalink, candidate)))
        .limit(1);
      return hit.length > 0;
    });

    await db.insert(taskTable).values({
      id: mintId(),
      description: sample.description,
      status: sample.status,
      priority: sample.priority,
      order: sample.order,
      userId,
      lensId,
      permalink,
      updatedAt: new Date(),
    });
    created += 1;
  }
  return created;
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
  const userId = await ensureDevUser(db);
  const lensId = await ensurePrimaryLens(db, userId);
  const created = await ensureSampleTasks(db, userId, lensId);
  console.log(
    JSON.stringify({
      event: "seeded",
      database: new URL(url).pathname.replace(/^\//, ""),
      userId,
      lensId,
      tasksCreated: created,
      email: SEED_DEV_EMAIL,
      hint: "Set SEED_USER_ID to this userId, or rely on the dev-user lookup.",
    }),
  );
} finally {
  await db.$client.end();
}
