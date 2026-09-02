/**
 * Inbox seed for the S2+S3 surfaces — `bun src/seed-inbox.ts` (F11 e2e + dev).
 *
 * Ensures the dev user (apps/api/src/db.ts SEED_DEV_EMAIL) has what the
 * capture + triage flows need to be exercised end-to-end while the sibling
 * slices are still landing:
 *   - the seeded "Me" lens (the FREE-included lens — filing into it passes
 *     the entitlement guard),
 *   - "General" + "Briefs" STANDARD projects (the resource parent picker;
 *     the #briefs capture-token resolution test),
 *   - the "Groceries" SIMPLE_LIST project (the list-item dispatch test),
 *   - a PRO manual access grant (the `project` triage decision needs cap
 *     headroom beyond the FREE 3 — this is a dev fixture, not a billing fact),
 *   - two unprocessed inbox items so a fresh dev database shows the queue.
 *
 * Idempotent: every row is find-or-create. Safety: refuses anything but a
 * localhost database (same guard as seed.ts — this writes rows).
 */
import { and, eq } from "drizzle-orm";
import {
  createDb,
  mintId,
  inboxItem,
  lens as lensTable,
  project as projectTable,
  user as userTable,
} from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { uniquePermalink } from "@actionamp/domain/shared/permalinks";
import { ensureEmailUser } from "./auth/seed-session.js";
import { SEED_DEV_EMAIL, databaseUrl, isLocalDatabaseUrl } from "./db.js";

async function ensureLens(
  db: DomainDb,
  userId: string,
  name: string,
  color: string,
): Promise<string> {
  const existing = await db
    .select({ id: lensTable.id })
    .from(lensTable)
    .where(and(eq(lensTable.userId, userId), eq(lensTable.name, name)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const id = mintId();
  await db.insert(lensTable).values({
    id,
    name,
    userId,
    color,
    isDefault: name === "Me",
    isIncluded: name === "Me",
  });
  return id;
}

async function ensureProject(
  db: DomainDb,
  userId: string,
  lensId: string,
  name: string,
  type: "STANDARD" | "SIMPLE_LIST",
): Promise<string> {
  const existing = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.userId, userId),
        eq(projectTable.lensId, lensId),
        eq(projectTable.name, name),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  const permalink = await uniquePermalink(name, async (candidate) => {
    const rows = await db
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(
        and(eq(projectTable.userId, userId), eq(projectTable.permalink, candidate)),
      )
      .limit(1);
    return rows.length > 0;
  });
  const id = mintId();
  await db.insert(projectTable).values({ id, name, permalink, userId, lensId, type });
  return id;
}

async function ensureInboxItem(db: DomainDb, userId: string, text: string): Promise<void> {
  const existing = await db
    .select({ id: inboxItem.id })
    .from(inboxItem)
    .where(
      and(
        eq(inboxItem.userId, userId),
        eq(inboxItem.text, text),
        eq(inboxItem.status, "UNPROCESSED"),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(inboxItem).values({ id: mintId(), text, userId });
}

async function main(): Promise<void> {
  const url = databaseUrl();
  if (!isLocalDatabaseUrl(url)) {
    console.error(
      "Refusing to seed the inbox: DATABASE_URL host is not localhost. " +
        "This script writes rows and only ever targets a local dev database.",
    );
    process.exit(1);
  }
  const db = createDb(url);
  try {
    const seeded = await ensureEmailUser(db, SEED_DEV_EMAIL);

    // Dev fixture: the project-cap + Work-lens paths need entitlement
    // headroom. A manual grant (not a Stripe fact) keeps S16's data clean.
    await db
      .update(userTable)
      .set({ manualAccessGrant: "PRO" })
      .where(eq(userTable.id, seeded.userId));

    const meLens = await ensureLens(db, seeded.userId, "Me", "emerald");
    const workLens = await ensureLens(db, seeded.userId, "Work", "indigo");
    await ensureProject(db, seeded.userId, meLens, "General", "STANDARD");
    await ensureProject(db, seeded.userId, meLens, "Briefs", "STANDARD");
    await ensureProject(db, seeded.userId, meLens, "Groceries", "SIMPLE_LIST");
    // The Work lens gets its General too (FREE-visibility in the resolver).
    await ensureProject(db, seeded.userId, workLens, "General", "STANDARD");

    await ensureInboxItem(db, seeded.userId, "Outline the launch announcement");
    await ensureInboxItem(db, seeded.userId, "Sketch the triage walkthrough notes");

    console.log(
      JSON.stringify({
        event: "inbox-seeded",
        email: SEED_DEV_EMAIL,
        userId: seeded.userId,
        lens: meLens,
      }),
    );
  } finally {
    await db.$client.end();
  }
}

await main();
