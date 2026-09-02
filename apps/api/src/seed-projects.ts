/**
 * S5/S6 seed — `bun src/seed-projects.ts` (companion to src/seed.ts, which
 * it never edits).
 *
 * Ensures the local dev database has planning-surface fixtures for the dev
 * user: a Goal, a project under that goal, a standalone project, and a
 * Simple-list project — so /rpc/projects/* + /rpc/goals/* return real data
 * before any capture flow ran. Idempotent: every row is find-or-create.
 *
 * Also grants the dev user an active PRO plan: the FREE caps (3 projects /
 * 1 goal per lens) are per-lens lifetime counts, so repeated e2e runs that
 * create projects would trip the 402 gate and strand the suite. The cap
 * behavior itself is unit-tested at the domain layer; e2e wants an unobstructed
 * surface (webapp parity: its e2e used a fresh signup per run).
 *
 * Safety: REFUSES to run against anything but a localhost database.
 */
import { and, eq } from "drizzle-orm";
import {
  createDb,
  goal as goalTable,
  lens as lensTable,
  mintId,
  project as projectTable,
  user as userTable,
} from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { uniquePermalink } from "@actionamp/domain/shared/permalinks";
import { databaseUrl, isLocalDatabaseUrl, SEED_DEV_EMAIL } from "./db.js";

/** The dev user's PRO grant horizon (far future — isPlanActive stays true). */
const PRO_RENEWS_AT = new Date(Date.now() + 365 * 24 * 86_400_000);

interface SeedFixture {
  key: string;
  name: string;
  description: string | null;
  type: "STANDARD" | "SIMPLE_LIST";
  /** The goal key this project sits under (null = standalone). */
  goalKey: string | null;
}

const SEED_GOAL = {
  key: "goal-tend-the-garden",
  name: "Tend the garden",
  description: "Keep the outside alive without it becoming a chore.",
};

const SEED_PROJECTS: SeedFixture[] = [
  {
    key: "proj-repot-the-citrus",
    name: "Repot the citrus",
    description: "Two trees, bigger pots, fresh soil.",
    type: "STANDARD",
    goalKey: SEED_GOAL.key,
  },
  {
    key: "proj-garage-inventory",
    name: "Garage inventory",
    description: "Everything on shelves, one list.",
    type: "SIMPLE_LIST",
    goalKey: null,
  },
];

async function findDevUserId(db: DomainDb): Promise<string | null> {
  const { auth, authIdentity } = await import("@actionamp/domain/db");
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

async function ensurePrimaryLens(db: DomainDb, userId: string): Promise<string> {
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

/** Dev-user PRO grant (see header — unobstructed e2e surface). */
async function ensureProPlan(db: DomainDb, userId: string): Promise<void> {
  await db
    .update(userTable)
    .set({ plan: "PRO", planRenewsAt: PRO_RENEWS_AT })
    .where(eq(userTable.id, userId));
}

async function ensurePermalink(
  db: DomainDb,
  userId: string,
  table: typeof goalTable | typeof projectTable,
  name: string,
): Promise<string> {
  return uniquePermalink(name, async (candidate) => {
    const hit = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.permalink, candidate)))
      .limit(1);
    return hit.length > 0;
  });
}

async function ensureGoal(db: DomainDb, userId: string, lensId: string): Promise<string> {
  const existing = await db
    .select({ id: goalTable.id })
    .from(goalTable)
    .where(and(eq(goalTable.userId, userId), eq(goalTable.name, SEED_GOAL.name)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const permalink = await ensurePermalink(db, userId, goalTable, SEED_GOAL.name);
  const goalId = mintId();
  await db.insert(goalTable).values({
    id: goalId,
    name: SEED_GOAL.name,
    description: SEED_GOAL.description,
    userId,
    lensId,
    permalink,
  });
  return goalId;
}

async function ensureProject(
  db: DomainDb,
  userId: string,
  lensId: string,
  goalId: string | null,
  fixture: SeedFixture,
  order: number,
): Promise<string> {
  const existing = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(and(eq(projectTable.userId, userId), eq(projectTable.name, fixture.name)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const permalink = await ensurePermalink(db, userId, projectTable, fixture.name);
  const projectId = mintId();
  await db.insert(projectTable).values({
    id: projectId,
    name: fixture.name,
    description: fixture.description,
    type: fixture.type,
    userId,
    lensId,
    goalId,
    order,
    permalink,
  });
  return projectId;
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
  const userId = await findDevUserId(db);
  if (!userId) {
    console.log(
      JSON.stringify({
        event: "seed-projects-skipped",
        reason: `No dev user for ${SEED_DEV_EMAIL} — run \`bun src/seed.ts\` first.`,
      }),
    );
    process.exit(0);
  }

  await ensureProPlan(db, userId);
  const lensId = await ensurePrimaryLens(db, userId);
  const goalId = await ensureGoal(db, userId, lensId);

  const projectIds: string[] = [];
  for (const fixture of SEED_PROJECTS) {
    const underGoal = fixture.goalKey === SEED_GOAL.key ? goalId : null;
    const id = await ensureProject(db, userId, lensId, underGoal, fixture, projectIds.length);
    projectIds.push(id);
  }

  console.log(
    JSON.stringify({
      event: "seeded-projects",
      database: new URL(url).pathname.replace(/^\//, ""),
      userId,
      lensId,
      goalId,
      projectIds,
      email: SEED_DEV_EMAIL,
      plan: "PRO (e2e runs must not trip the FREE caps)",
    }),
  );
} finally {
  await db.$client.end();
}
