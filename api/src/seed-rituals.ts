/**
 * Rituals e2e seed — `bun src/seed-rituals.ts` (idempotent, localhost-only).
 *
 * Ensures the rituals spec's users + rows exist:
 *
 *   rituals-pro@test.local  BILLED PRO (renews in a year) with a "Me" lens
 *                           (default + included) and three rituals — two
 *                           DAILY ones in the MORNING/EVENING intervals the
 *                           Today assertions group by (DAILY = due every
 *                           day, so the spec never depends on the run date)
 *                           and one WEEKLY on Mondays (Planning-list only —
 *                           its due-ness is weekday-dependent).
 *   s4-today@test.local     reused as the FREE account (no rituals rows —
 *                           the whole-feature gate needs no setup).
 *
 * RESET semantics: the PRO user's rituals + entries are wiped and re-created
 * each run (a previous run may have checked/paused them) — the dedicated
 * e2e-user convention from seed-s4.ts.
 */
import { and, eq } from "drizzle-orm";
import {
  createDb,
  lens as lensTable,
  ritual as ritualTable,
  ritualEntry as ritualEntryTable,
  user as userTable,
} from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { databaseUrl, isLocalDatabaseUrl } from "./db.js";
import { ensureEmailUser } from "./auth/seed-session.js";

const PRO_EMAIL = "rituals-pro@test.local";

interface SeedRitual {
  name: string;
  interval: "MORNING" | "MIDDAY" | "EVENING";
  cadence: "DAILY" | "WEEKDAYS" | "WEEKLY" | "INTERVAL";
  weekday?: number | null;
  intervalDays?: number | null;
  order: number;
}

const RITUALS: SeedRitual[] = [
  { name: "Take vitamins", interval: "MORNING", cadence: "DAILY", order: 0 },
  { name: "Evening stretch", interval: "EVENING", cadence: "DAILY", order: 1 },
  { name: "Week plan review", interval: "MIDDAY", cadence: "WEEKLY", weekday: 0, order: 2 },
];

async function ensureLens(db: DomainDb, userId: string): Promise<string> {
  const existing = await db
    .select({ id: lensTable.id })
    .from(lensTable)
    .where(and(eq(lensTable.name, "Me"), eq(lensTable.userId, userId)))
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
  const { userId } = await ensureEmailUser(db, PRO_EMAIL);

  // Billed PRO (renews in a year) — the whole-feature gate passes.
  await db
    .update(userTable)
    .set({ plan: "PRO", planRenewsAt: new Date(Date.now() + 365 * 24 * 3600 * 1000) })
    .where(eq(userTable.id, userId));

  const lensId = await ensureLens(db, userId);

  // RESET: the spec assumes fresh, unchecked, unpaused rituals — including
  // any "Read 10 pages" row a previous run created through the UI.
  await db.delete(ritualEntryTable).where(eq(ritualEntryTable.userId, userId));
  await db.delete(ritualTable).where(eq(ritualTable.userId, userId));
  for (const r of RITUALS) {
    await db.insert(ritualTable).values({
      id: crypto.randomUUID(),
      userId,
      lensId,
      name: r.name,
      interval: r.interval,
      cadence: r.cadence,
      weekday: r.weekday ?? null,
      intervalDays: r.intervalDays ?? null,
      goalId: null,
      order: r.order,
    });
  }
  console.log(`seeded ${RITUALS.length} rituals for ${PRO_EMAIL} (lens ${lensId})`);
} finally {
  await db.$client.end();
}
