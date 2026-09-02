/**
 * The implemented oRPC router (F8b) — apps/api's /rpc surface.
 *
 * Contract-first: `implement(contractRouter)` from @actionamp/contract makes
 * every handler compile against the zod-validated contract — input/output
 * shapes and the wire paths (`/rpc/tasks/*`) come from there, not from here.
 *
 * Layering (the F4b pattern-setter's rules, applied server-side):
 * - Handlers are thin wrappers: resolve the user (stubbed until F10), call a
 *   domain core from @actionamp/domain with `context.entities`, map the row to
 *   the contract DTO. No SQL and no business logic lives here.
 * - Context: `{ db, entities }`, built once in index.ts. F10 adds the real
 *   authenticated user to this context via middleware and replaces
 *   `resolveSeedUserId`.
 * - Validation is already done by the contract (zod on `oc.input`) before any
 *   handler runs — violations surface as oRPC BAD_REQUEST (4xx).
 */
import { implement, ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { contractRouter } from "@actionamp/contract";
import { auth, authIdentity } from "@actionamp/domain/db";
import type { Entities, DomainDb } from "@actionamp/domain/db";
import type { TaskDetailFullRow, TaskListRow } from "@actionamp/domain/db";
import { getTaskData, getTasksData } from "@actionamp/domain/tasks";
import { SEED_DEV_EMAIL } from "./db.js";

/** Per-request context the handlers read. Built once in index.ts. */
export interface ApiContext {
  /** Drizzle handle — infrastructure lookups only (the F10 user stub). */
  db: DomainDb;
  /** The Prisma-shaped seam every domain core speaks. */
  entities: Entities;
}

const ORPC = implement(contractRouter).$context<ApiContext>();

// ----------------------------------------------------------------
// The F10 seam: user resolution, stubbed
// ----------------------------------------------------------------

let cachedSeedUserId: string | null = null;

/**
 * The acting user for every procedure until real auth lands (F10).
 *
 * Order: `SEED_USER_ID` env → the seeded dev user (found once per process via
 * Wasp's email AuthIdentity). Throws UNAUTHORIZED when neither exists — the
 * client sees a typed 401 rather than silently reading another user's data.
 */
async function resolveSeedUserId({ db }: ApiContext): Promise<string> {
  const fromEnv = process.env.SEED_USER_ID;
  if (fromEnv) return fromEnv;
  if (cachedSeedUserId) return cachedSeedUserId;

  const rows = await db
    .select({ userId: auth.userId })
    .from(authIdentity)
    .innerJoin(auth, eq(authIdentity.authId, auth.id))
    .where(
      eq(authIdentity.providerUserId, SEED_DEV_EMAIL),
    )
    .limit(1);
  const userId = rows[0]?.userId;
  if (!userId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "No acting user — run `bun src/seed.ts` or set SEED_USER_ID.",
    });
  }
  cachedSeedUserId = userId;
  return userId;
}

// ----------------------------------------------------------------
// Row → DTO mappers (presentation slices, not business logic)
// ----------------------------------------------------------------

function toTaskDto(row: TaskListRow) {
  return {
    id: row.id,
    description: row.description,
    status: row.status,
    priority: row.priority,
    isDone: row.isDone,
    order: row.order,
  };
}

function toTaskDetailDto(row: TaskDetailFullRow) {
  return {
    id: row.id,
    description: row.description,
    status: row.status,
    priority: row.priority,
    isDone: row.isDone,
    order: row.order,
    permalink: row.permalink,
    content: row.content ?? null,
  };
}

// ----------------------------------------------------------------
// Procedures
// ----------------------------------------------------------------

/**
 * The work screen's list: every open task in the user's primary lens, in
 * manual order (getTasksData orders by order, then priority, then age — the
 * same shape the webapp lists page surfaces).
 */
export const tasksList = ORPC.tasks.list.handler(async ({ context }) => {
  const userId = await resolveSeedUserId(context);
  const primaryLens = await context.entities.Lens.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const lens = primaryLens[0];
  if (!lens) return [];

  const rows = await getTasksData(context.entities, {
    userId,
    lensId: lens.id,
    isDone: false,
  });
  return rows.map(toTaskDto);
});

/**
 * The detail-page lookup: by id or permalink (getTaskData matches either).
 * Unknown id → null per the contract.
 */
export const tasksDetail = ORPC.tasks.detail.handler(async ({ context, input }) => {
  const userId = await resolveSeedUserId(context);
  const row = await getTaskData(context.entities, {
    userId,
    id: input.id,
  });
  return row ? toTaskDetailDto(row) : null;
});

/** The implemented router — mount at /rpc (index.ts). */
export const router = {
  tasks: {
    list: tasksList,
    detail: tasksDetail,
  },
};
