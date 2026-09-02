/**
 * S18 seed — CLI conformance fixtures. `bun src/seed-cli.ts` (or imported by
 * cli-conformance.test.ts).
 *
 * Ensures the local dev database has three fixture accounts with data shaped
 * for the /api/cli/* responses, mints a fresh PAT for each, and (direct runs)
 * prints the plaintexts — the live `actionamp` / `actionamp-admin` runs write
 * them into the CLIs' config.json files.
 *
 *   cli-pro@local.test    PRO   — Me + Work lenses, goal, projects (incl. one
 *                                 Simple list), tasks (open + done + wont-do),
 *                                 inbox items (open + archived), an image
 *                                 attachment, resources, focus sessions.
 *   cli-free@local.test   FREE  — Me lens only + cap-filling data (3 projects,
 *                                 1 goal) so the 402 gates are reachable.
 *   cli-admin@local.test  PRO   — isAdmin, a feedback row, funnel events.
 *
 * Idempotent: every row is find-or-create by a fixed natural key (email /
 * name), so re-running only tops up what is missing. PATs cannot be recovered
 * (only the hash is stored), so each run deletes the run's previous fixture
 * keys (label "cli-conformance") and mints fresh ones.
 *
 * Safety: REFUSES to run against anything but a localhost database (same guard
 * as seed.ts) — it writes rows.
 */
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import {
  analyticsEvent,
  analyticsSession,
  auth,
  authIdentity,
  feedback,
  goal as goalTable,
  inboxAttachment,
  inboxItem,
  lens as lensTable,
  listItem,
  project as projectTable,
  resource as resourceTable,
  task as taskTable,
  taskSession,
  user as userTable,
  apiKey,
} from "@actionamp/domain/db";
import { createDb, mintId } from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { uniquePermalink } from "@actionamp/domain/shared/permalinks";
import { databaseUrl, isLocalDatabaseUrl } from "./db.js";
import { generatePat, hashToken } from "./auth/pat.js";

export const PRO_EMAIL = "cli-pro@local.test";
export const FREE_EMAIL = "cli-free@local.test";
export const ADMIN_EMAIL = "cli-admin@local.test";
export const BARE_EMAIL = "cli-bare@local.test";
const FIXTURE_KEY_LABEL = "cli-conformance";

export type CliFixtures = {
  pro: {
    userId: string;
    authId: string;
    email: string;
    token: string;
    lensMeId: string;
    lensWorkId: string;
    goalId: string;
    projectId: string;
    listProjectId: string;
    secondProjectId: string;
    thirdProjectId: string;
    taskId: string;
    doneTaskId: string;
    wontDoTaskId: string;
    inboxItemId: string;
    archivedInboxItemId: string;
    attachmentId: string;
    listItemId: string;
    resourceId: string;
  };
  free: {
    userId: string;
    authId: string;
    email: string;
    token: string;
    lensMeId: string;
    lensWorkId: string;
    workProjectId: string;
  };
  admin: {
    userId: string;
    authId: string;
    email: string;
    token: string;
    feedbackId: string;
    feedbackShortId: string;
  };
  bare: { userId: string; email: string; token: string };
};

/** The 1×1 PNG (67 bytes) the PRO fixture's inbox attachment carries — a real
 *  decodable image so the download route serves byte-identical content. */
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Find-or-create an account with its email AuthIdentity (the PAT lookup's
 *  email source). Returns the userId + Auth id (the session-issuance key). */
async function ensureUser(
  db: DomainDb,
  email: string,
  fullName: string,
  opts: { plan: "FREE" | "PRO"; isAdmin?: boolean },
): Promise<{ userId: string; authId: string }> {
  const existing = await db
    .select({ userId: auth.userId, authId: auth.id })
    .from(authIdentity)
    .innerJoin(auth, eq(authIdentity.authId, auth.id))
    .where(
      and(
        eq(authIdentity.providerName, "email"),
        eq(authIdentity.providerUserId, email),
      ),
    )
    .limit(1);
  if (existing[0]?.userId) {
    // Plan/isAdmin are pinned so a downgrade of the fixture elsewhere can't
    // flip the conformance expectations. A PRO plan is only ACTIVE while
    // planRenewsAt is in the future — the renewal is pinned out a year so the
    // fixture stays entitled.
    const planRenewsAt =
      opts.plan === "PRO" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null;
    await db
      .update(userTable)
      .set({ plan: opts.plan, isAdmin: opts.isAdmin ?? false, planRenewsAt })
      .where(eq(userTable.id, existing[0].userId));
    return { userId: existing[0].userId, authId: existing[0].authId };
  }

  const userId = mintId();
  const authId = mintId();
  await db.insert(userTable).values({
    id: userId,
    firstName: fullName.split(" ")[0],
    fullName,
    plan: opts.plan,
    isAdmin: opts.isAdmin ?? false,
    planRenewsAt:
      opts.plan === "PRO" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
  });
  await db.insert(auth).values({ id: authId, userId });
  await db.insert(authIdentity).values({
    providerName: "email",
    providerUserId: email,
    providerData: JSON.stringify({ hashedPassword: null, isEmailVerified: true }),
    authId,
  });
  return { userId, authId };
}

async function ensureLens(
  db: DomainDb,
  userId: string,
  name: string,
  opts: { isDefault?: boolean; isIncluded: boolean; color?: string; purpose?: string },
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
    isDefault: opts.isDefault ?? false,
    isIncluded: opts.isIncluded,
    color: opts.color ?? null,
    purpose: opts.purpose ?? null,
  });
  return id;
}

async function ensureGoal(
  db: DomainDb,
  userId: string,
  lensId: string,
  name: string,
  description: string | null,
): Promise<string> {
  const existing = await db
    .select({ id: goalTable.id })
    .from(goalTable)
    .where(and(eq(goalTable.userId, userId), eq(goalTable.name, name)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const id = mintId();
  const permalink = await uniquePermalink(name, async (candidate) => {
    const hit = await db
      .select({ id: goalTable.id })
      .from(goalTable)
      .where(and(eq(goalTable.userId, userId), eq(goalTable.permalink, candidate)))
      .limit(1);
    return hit.length > 0;
  });
  await db.insert(goalTable).values({
    id,
    name,
    description,
    userId,
    lensId,
    permalink,
  });
  return id;
}

async function ensureProject(
  db: DomainDb,
  userId: string,
  lensId: string,
  name: string,
  opts: {
    goalId?: string;
    description?: string | null;
    type?: "STANDARD" | "SIMPLE_LIST";
    isDone?: boolean;
  } = {},
): Promise<string> {
  const existing = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(and(eq(projectTable.userId, userId), eq(projectTable.name, name)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const id = mintId();
  const permalink = await uniquePermalink(name, async (candidate) => {
    const hit = await db
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(and(eq(projectTable.userId, userId), eq(projectTable.permalink, candidate)))
      .limit(1);
    return hit.length > 0;
  });
  await db.insert(projectTable).values({
    id,
    name,
    description: opts.description ?? null,
    userId,
    lensId,
    goalId: opts.goalId ?? null,
    permalink,
    type: opts.type ?? "STANDARD",
    isDone: opts.isDone ?? false,
  });
  return id;
}

async function ensureTask(
  db: DomainDb,
  userId: string,
  lensId: string,
  description: string,
  opts: {
    projectId?: string | null;
    goalId?: string | null;
    status?: "TODAY" | "UPCOMING" | "SOMEDAY" | "WONT_DO";
    priority?: "LOW" | "NORMAL" | "IMPORTANT";
    size?: "S" | "M" | "L" | "XL";
    isDone?: boolean;
    completedAt?: Date;
    outcome?: string | null;
    order?: number;
    updatedAt?: Date;
  } = {},
): Promise<string> {
  const existing = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(
      and(eq(taskTable.userId, userId), eq(taskTable.description, description)),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  const id = mintId();
  const permalink = await uniquePermalink(description, async (candidate) => {
    const hit = await db
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(and(eq(taskTable.userId, userId), eq(taskTable.permalink, candidate)))
      .limit(1);
    return hit.length > 0;
  });
  await db.insert(taskTable).values({
    id,
    description,
    userId,
    lensId,
    projectId: opts.projectId ?? null,
    goalId: opts.goalId ?? null,
    status: opts.status ?? "UPCOMING",
    priority: opts.priority ?? "NORMAL",
    size: opts.size ?? "M",
    isDone: opts.isDone ?? false,
    completedAt: opts.completedAt ?? null,
    outcome: opts.outcome ?? null,
    order: opts.order ?? 0,
    permalink,
    updatedAt: opts.updatedAt ?? new Date(),
  });
  return id;
}

async function ensureInboxItem(
  db: DomainDb,
  userId: string,
  text: string,
  opts: { status?: "UNPROCESSED" | "ARCHIVED"; archivedAt?: Date } = {},
): Promise<string> {
  const existing = await db
    .select({ id: inboxItem.id })
    .from(inboxItem)
    .where(and(eq(inboxItem.userId, userId), eq(inboxItem.text, text)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const id = mintId();
  await db.insert(inboxItem).values({
    id,
    text,
    userId,
    status: opts.status ?? "UNPROCESSED",
    archivedAt: opts.archivedAt ?? null,
  });
  return id;
}

/**
 * Seed everything. Returns the fixture ids + fresh PAT plaintexts.
 */
export async function seedCliFixtures(db: DomainDb): Promise<CliFixtures> {
  // ── Accounts ────────────────────────────────────────────────────────────
  const pro = await ensureUser(db, PRO_EMAIL, "Pro Fixture", { plan: "PRO" });
  const free = await ensureUser(db, FREE_EMAIL, "Free Fixture", { plan: "FREE" });
  const admin = await ensureUser(db, ADMIN_EMAIL, "Admin Fixture", {
    plan: "PRO",
    isAdmin: true,
  });
  const bare = await ensureUser(db, BARE_EMAIL, "Bare Fixture", { plan: "PRO" });
  const proUserId = pro.userId;
  const freeUserId = free.userId;
  const adminUserId = admin.userId;

  // ── PRO data ────────────────────────────────────────────────────────────
  const lensMeId = await ensureLens(db, proUserId, "Me", {
    isDefault: true,
    isIncluded: true,
    color: "teal",
  });
  const lensWorkId = await ensureLens(db, proUserId, "Work", {
    isIncluded: false,
    color: "amber",
    purpose: "The day job.",
  });
  const goalId = await ensureGoal(
    db,
    proUserId,
    lensWorkId,
    "Ship the platform switch",
    "Finish the migration with parity.",
  );
  const projectId = await ensureProject(db, proUserId, lensWorkId, "CLI conformance", {
    goalId,
    description: "Fixture project for the CLI surface.",
  });
  const listProjectId = await ensureProject(
    db,
    proUserId,
    lensMeId,
    "Groceries",
    { type: "SIMPLE_LIST" },
  );
  const secondProjectId = await ensureProject(
    db,
    proUserId,
    lensWorkId,
    "CLI conformance 2",
  );
  const thirdProjectId = await ensureProject(
    db,
    proUserId,
    lensWorkId,
    "CLI conformance 3",
  );

  const taskId = await ensureTask(db, proUserId, lensWorkId, "Conformance: verify the CLI routes", {
    projectId,
    goalId,
    status: "TODAY",
    priority: "IMPORTANT",
    size: "L",
    order: 0,
  });
  const doneTaskId = await ensureTask(db, proUserId, lensWorkId, "Conformance: completed task", {
    projectId,
    status: "TODAY",
    isDone: true,
    completedAt: new Date(),
    outcome: "Verified.",
    order: 1,
  });
  const wontDoTaskId = await ensureTask(db, proUserId, lensMeId, "Conformance: declined task", {
    status: "WONT_DO",
    updatedAt: new Date(),
  });
  ensureTask(db, proUserId, lensWorkId, "Conformance: someday task", {
    status: "SOMEDAY",
  });

  const inboxItemId = await ensureInboxItem(db, proUserId, "Conformance: raw capture #cli");
  const archivedInboxItemId = await ensureInboxItem(
    db,
    proUserId,
    "Conformance: archived capture",
    { status: "ARCHIVED", archivedAt: new Date() },
  );

  // A DEDICATED attachment carrier — no test triages this item, so the
  // attachment row survives the whole suite (triage deletes its source item,
  // which cascades to the attachment).
  const attachmentCarrierId = await ensureInboxItem(
    db,
    proUserId,
    "Conformance: attachment carrier",
  );
  const pngBytes = Uint8Array.from(atob(PNG_1PX_BASE64), (ch) => ch.charCodeAt(0));
  const existingAttachment = await db
    .select({ id: inboxAttachment.id })
    .from(inboxAttachment)
    .where(eq(inboxAttachment.inboxItemId, attachmentCarrierId))
    .limit(1);
  let attachmentId = existingAttachment[0]?.id ?? null;
  if (!attachmentId) {
    attachmentId = mintId();
    await db.insert(inboxAttachment).values({
      id: attachmentId,
      inboxItemId: attachmentCarrierId,
      filename: "conformance.png",
      mimeType: "image/png",
      size: pngBytes.byteLength,
      data: pngBytes,
    });
  }

  // One list item on the Simple list + one resource on the standard project.
  const existingItem = await db
    .select({ id: listItem.id })
    .from(listItem)
    .where(eq(listItem.projectId, listProjectId))
    .limit(1);
  let listItemId = existingItem[0]?.id ?? null;
  if (!listItemId) {
    listItemId = mintId();
    await db.insert(listItem).values({
      id: listItemId,
      text: "Oat milk",
      userId: proUserId,
      projectId: listProjectId,
      order: 0,
      updatedAt: new Date(),
    });
  }
  const existingResource = await db
    .select({ id: resourceTable.id })
    .from(resourceTable)
    .where(eq(resourceTable.projectId, projectId))
    .limit(1);
  let resourceId = existingResource[0]?.id ?? null;
  if (!resourceId) {
    resourceId = mintId();
    await db.insert(resourceTable).values({
      id: resourceId,
      title: "Route table",
      url: "https://example.com/routes",
      notes: "The P0 conformance tables.",
      userId: proUserId,
      projectId,
    });
  }

  // A closed focus session (review evidence: focusMinutes).
  const existingSession = await db
    .select({ id: taskSession.id })
    .from(taskSession)
    .where(eq(taskSession.taskId, taskId))
    .limit(1);
  if (!existingSession[0]) {
    const now = Date.now();
    await db.insert(taskSession).values({
      id: mintId(),
      taskId,
      userId: proUserId,
      startedAt: new Date(now - 30 * 60 * 1000),
      endedAt: new Date(now - 5 * 60 * 1000),
      plannedMinutes: 25,
      completed: false,
    });
  }

  // ── FREE data — cap-filling (3 projects, 1 goal) so the 402 gates fire ──
  const freeLensMeId = await ensureLens(db, freeUserId, "Me", {
    isDefault: true,
    isIncluded: true,
    color: "teal",
  });
  const freeLensWorkId = await ensureLens(db, freeUserId, "Work", {
    isIncluded: false,
  });
  // A project on the gated Work lens (seeded directly — the API would 402 it)
  // so the add-task RESOLVED-lens test can reach the 402.
  const freeWorkProjectId = await ensureProject(
    db,
    freeUserId,
    freeLensWorkId,
    "Free fixture work project",
  );
  await ensureGoal(db, freeUserId, freeLensMeId, "Free fixture goal", null);
  await ensureProject(db, freeUserId, freeLensMeId, "Free fixture project 1");
  await ensureProject(db, freeUserId, freeLensMeId, "Free fixture project 2");
  await ensureProject(db, freeUserId, freeLensMeId, "Free fixture project 3");
  await ensureTask(db, freeUserId, freeLensMeId, "Free fixture task", {
    status: "TODAY",
  });
  void freeLensWorkId;

  // ── ADMIN data — one feedback row + funnel events ────────────────────────
  // Find a LIVE (non-deleted) row: the conformance suite soft-deletes the row
  // it uses, so a re-run must mint a fresh one (shortIds are UNIQUE, deleted
  // rows keep theirs).
  const existingFeedback = await db
    .select({ id: feedback.id, shortId: feedback.shortId })
    .from(feedback)
    .where(
      and(
        eq(feedback.userId, adminUserId),
        isNull(feedback.deletedAt),
        like(feedback.shortId, "T8ST-%"),
      ),
    )
    .limit(1);
  let feedbackId = existingFeedback[0]?.id ?? null;
  let feedbackShortId = existingFeedback[0]?.shortId ?? null;
  if (!feedbackId) {
    feedbackId = mintId();
    // "T8ST" prefix has no Crockford-ambiguous chars (O/I/L/U) so the
    // conformance suite can exercise the case-insensitive prefix lookup.
    feedbackShortId = `T8ST-${Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[OILU]/g, "X")}`;
    const now = new Date();
    await db.insert(feedback).values({
      id: feedbackId,
      shortId: feedbackShortId,
      message: "Conformance fixture feedback.",
      userId: adminUserId,
      userName: "Admin Fixture",
      userEmail: ADMIN_EMAIL,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    });
  }
  const existingSessionRow = await db
    .select({ id: analyticsSession.id })
    .from(analyticsSession)
    .where(eq(analyticsSession.visitorId, "cli-conformance-visitor"))
    .limit(1);
  if (!existingSessionRow[0]) {
    const now = new Date();
    const sessionId = mintId();
    await db.insert(analyticsSession).values({
      id: sessionId,
      visitorId: "cli-conformance-visitor",
      userId: adminUserId,
      referrerHost: "example.com",
      utmSource: "conformance",
      utmCampaign: "s18",
      deviceClass: "desktop",
      firstSeenAt: now,
      lastSeenAt: now,
    });
    await db.insert(analyticsEvent).values([
      {
        id: mintId(),
        name: "LANDING_VIEW",
        sessionId,
        occurredAt: now,
        userId: adminUserId,
      },
      {
        id: mintId(),
        name: "APP_OPENED",
        sessionId,
        occurredAt: now,
        userId: adminUserId,
      },
    ]);
  }

  // ── PATs — fresh each run (only hashes live in the DB) ──────────────────
  const previousKeys = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(
      and(
        eq(apiKey.label, FIXTURE_KEY_LABEL),
        inArray(apiKey.userId, [proUserId, freeUserId, adminUserId, bare.userId]),
      ),
    );
  if (previousKeys.length > 0) {
    await db.delete(apiKey).where(
      inArray(
        apiKey.id,
        previousKeys.map((k) => k.id),
      ),
    );
  }
  const mint = async (userId: string): Promise<string> => {
    const plaintext = generatePat();
    await db.insert(apiKey).values({
      id: mintId(),
      hashedToken: hashToken(plaintext),
      label: FIXTURE_KEY_LABEL,
      userId,
    });
    return plaintext;
  };
  const [proToken, freeToken, adminToken, bareToken] = [
    await mint(proUserId),
    await mint(freeUserId),
    await mint(adminUserId),
    await mint(bare.userId),
  ];

  return {
    pro: {
      userId: proUserId,
      authId: pro.authId,
      email: PRO_EMAIL,
      token: proToken,
      lensMeId,
      lensWorkId,
      goalId,
      projectId,
      listProjectId,
      secondProjectId,
      thirdProjectId,
      taskId,
      doneTaskId,
      wontDoTaskId,
      inboxItemId,
      archivedInboxItemId,
      attachmentId,
      listItemId,
      resourceId,
    },
    free: {
      userId: freeUserId,
      authId: free.authId,
      email: FREE_EMAIL,
      token: freeToken,
      lensMeId: freeLensMeId,
      lensWorkId: freeLensWorkId,
      workProjectId: freeWorkProjectId,
    },
    admin: {
      userId: adminUserId,
      authId: admin.authId,
      email: ADMIN_EMAIL,
      token: adminToken,
      feedbackId,
      feedbackShortId,
    },
    bare: { userId: bare.userId, email: BARE_EMAIL, token: bareToken },
  };
}

// ── Direct run ─────────────────────────────────────────────────────────────
const url = databaseUrl();
if (!isLocalDatabaseUrl(url)) {
  console.error(
    `Refusing to seed: DATABASE_URL host is not localhost (${url.replace(/\/\/[^@/]*@/, "//<redacted>@")}). ` +
      "The seed writes rows and only ever runs against a local dev database.",
  );
  process.exit(1);
}

if (import.meta.main) {
  const db = createDb(url);
  try {
    const fx = await seedCliFixtures(db);
    console.log(
      JSON.stringify(
        {
          event: "seeded-cli-fixtures",
          database: new URL(url).pathname.replace(/^\//, ""),
          pro: { email: fx.pro.email, token: fx.pro.token },
          free: { email: fx.free.email, token: fx.free.token },
          admin: { email: fx.admin.email, token: fx.admin.token },
          bare: { email: fx.bare.email, token: fx.bare.token },
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$client.end();
  }
}
