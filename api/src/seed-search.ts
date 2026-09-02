/**
 * Search seed for the S9 surface — `bun src/seed-search.ts` (F11 e2e + dev).
 *
 * Ensures the dev user (api/src/db.ts SEED_DEV_EMAIL) has a few rows the
 * command palette + sitewide search can hit without driving capture/triage
 * first:
 *   - the "Me" lens (the FREE-included lens) + "Work" (the palette's switch-
 *     lens entries),
 *   - the "General" STANDARD project (the resources section's parent),
 *   - a demo resource row in it (the palette's resource href + the project
 *     page's Resources section),
 *   - one task and one live + one archived inbox note (task/inbox record
 *     entries with their permalink / ?item= anchors).
 *
 * Idempotent: every row is find-or-create. Safety: refuses anything but a
 * localhost database (same guard as seed.ts — this writes rows). Never
 * touches the other seeds' rows beyond referencing the shared lens/project.
 */
import { and, eq } from "drizzle-orm";
import {
  createDb,
  mintId,
  inboxItem,
  lens as lensTable,
  project as projectTable,
  resource as resourceTable,
  task as taskTable,
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

/** Find-or-create by the exact title (search demo rows are content-addressed
 *  by their searchable text — reruns never duplicate). */
async function ensureTask(
  db: DomainDb,
  userId: string,
  lensId: string,
  projectId: string,
  description: string,
): Promise<void> {
  const existing = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(and(eq(taskTable.userId, userId), eq(taskTable.description, description)))
    .limit(1);
  if (existing[0]) return;
  const permalink = await uniquePermalink(description, async (candidate) => {
    const rows = await db
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(
        and(eq(taskTable.userId, userId), eq(taskTable.permalink, candidate)),
      )
      .limit(1);
    return rows.length > 0;
  });
  await db.insert(taskTable).values({
    id: mintId(),
    description,
    permalink,
    content: "Seed row for the command palette — delete freely.",
    userId,
    lensId,
    projectId,
    status: "UPCOMING",
    priority: "NORMAL",
    size: "M",
    updatedAt: new Date(),
  });
}

async function ensureInboxItem(
  db: DomainDb,
  userId: string,
  text: string,
  status: "UNPROCESSED" | "ARCHIVED",
): Promise<void> {
  const existing = await db
    .select({ id: inboxItem.id })
    .from(inboxItem)
    .where(
      and(
        eq(inboxItem.userId, userId),
        eq(inboxItem.text, text),
        eq(inboxItem.status, status),
      ),
    )
    .limit(1);
  if (existing[0]) return;
  await db.insert(inboxItem).values({
    id: mintId(),
    text,
    userId,
    status,
    archivedAt: status === "ARCHIVED" ? new Date() : null,
  });
}

async function ensureResource(
  db: DomainDb,
  userId: string,
  projectId: string,
  title: string,
  url: string,
  notes: string,
): Promise<void> {
  const existing = await db
    .select({ id: resourceTable.id })
    .from(resourceTable)
    .where(and(eq(resourceTable.userId, userId), eq(resourceTable.title, title)))
    .limit(1);
  if (existing[0]) return;
  await db.insert(resourceTable).values({
    id: mintId(),
    title,
    url,
    notes,
    userId,
    projectId,
  });
}

async function main(): Promise<void> {
  const url = databaseUrl();
  if (!isLocalDatabaseUrl(url)) {
    console.error(
      "Refusing to seed search: DATABASE_URL host is not localhost. " +
        "This script writes rows and only ever targets a local dev database.",
    );
    process.exit(1);
  }
  const db = createDb(url);
  try {
    const seeded = await ensureEmailUser(db, SEED_DEV_EMAIL);

    // The palette is a Pro surface — grant the dev fixture entitlement
    // headroom (a manual grant, not a Stripe fact; keeps S16's data clean).
    await db
      .update(userTable)
      .set({ manualAccessGrant: "PRO" })
      .where(eq(userTable.id, seeded.userId));

    const meLens = await ensureLens(db, seeded.userId, "Me", "emerald");
    await ensureLens(db, seeded.userId, "Work", "indigo");
    const general = await ensureProject(db, seeded.userId, meLens, "General", "STANDARD");

    await ensureTask(db, seeded.userId, meLens, general, "Renew the insurance policy");
    await ensureInboxItem(db, seeded.userId, "Palette demo: call the broker back", "UNPROCESSED");
    await ensureInboxItem(db, seeded.userId, "Palette demo: archived policy note", "ARCHIVED");
    await ensureResource(
      db,
      seeded.userId,
      general,
      "Design tokens reference",
      "https://example.com/design-tokens",
      "Seed row for the Resources section — delete freely.",
    );

    console.log(
      JSON.stringify({
        event: "search-seeded",
        email: SEED_DEV_EMAIL,
        userId: seeded.userId,
      }),
    );
  } finally {
    await db.$client.end();
  }
}

await main();
