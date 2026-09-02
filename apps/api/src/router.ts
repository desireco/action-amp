/**
 * The implemented oRPC router (F8b) — apps/api's /rpc surface.
 *
 * Contract-first: `implement(contractRouter)` from @actionamp/contract makes
 * every handler compile against the zod-validated contract — input/output
 * shapes and the wire paths (`/rpc/tasks/*`) come from there, not from here.
 *
 * Layering (the F4b pattern-setter's rules, applied server-side):
 * - Handlers are thin wrappers: resolve the acting user (`requireUser` — the
 *   F10 auth wrapper in index.ts already validated the credential), call a
 *   domain core from @actionamp/domain with `context.entities`, map the row to
 *   the contract DTO. No SQL and no business logic lives here.
 * - Context: `{ db, entities, user }` — built per request in index.ts, which
 *   runs the F10 session/PAT resolution before the oRPC handler.
 * - Validation is already done by the contract (zod on `oc.input`) before any
 *   handler runs — violations surface as oRPC BAD_REQUEST (4xx).
 */
import { implement, ORPCError } from "@orpc/server";
import { contractRouter } from "@actionamp/contract";
import type { Entities, DomainDb } from "@actionamp/domain/db";
import type { TaskDetailFullRow, TaskListRow } from "@actionamp/domain/db";
import { getTaskData, getTasksData } from "@actionamp/domain/tasks";
import type { ActingUser } from "./actingUser.js";

/** Per-request context the handlers read. Built per request in index.ts. */
export interface ApiContext {
  /** Drizzle handle — infrastructure lookups only. */
  db: DomainDb;
  /** The Prisma-shaped seam every domain core speaks. */
  entities: Entities;
  /**
   * The authenticated user (F10) — resolved BEFORE the handler by index.ts's
   * /rpc wrapper (session cookie/Bearer → F10a, `aa_` Bearer → F10b). Null
   * when no valid credential rode the request; handlers must go through
   * `requireUser`, which turns null into the typed 401.
   */
  user: ActingUser | null;
}

const ORPC = implement(contractRouter).$context<ApiContext>();

// ----------------------------------------------------------------
// The F10 seam: user enforcement
// ----------------------------------------------------------------

/**
 * The acting user for a procedure. Throws the typed oRPC UNAUTHORIZED when
 * the wrapper resolved no valid credential — the same 401 contract F8b set
 * with the seed-user stub, now driven by real session/PAT auth.
 */
export function requireUser(context: ApiContext): ActingUser {
  if (!context.user) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Authentication required.",
    });
  }
  return context.user;
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
  const userId = requireUser(context).id;
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
  const userId = requireUser(context).id;
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
