/**
 * The tasks procedures (F8b) — thin wrappers over the domain cores.
 *
 * Layering: resolve the acting user (`requireUser`), call a domain core from
 * @actionamp/domain with `context.entities`, map the row to the contract DTO.
 * No SQL and no business logic lives here; validation already happened in the
 * contract (zod on `oc.input` → 4xx before any handler runs).
 *
 * Composed into the mounted router by src/router.ts (the one composition
 * point) — parallel slice work delivers fragments, never edits composition.
 */
import { implement } from "@orpc/server";
import { contractRouter } from "@actionamp/contract";
import type { TaskDetailFullRow, TaskListRow } from "@actionamp/domain/db";
import { getTaskData, getTasksData } from "@actionamp/domain/tasks";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(contractRouter).$context<ApiContext>();

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
const tasksList = ORPC.tasks.list.handler(async ({ context }) => {
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
const tasksDetail = ORPC.tasks.detail.handler(async ({ context, input }) => {
  const userId = requireUser(context).id;
  const row = await getTaskData(context.entities, {
    userId,
    id: input.id,
  });
  return row ? toTaskDetailDto(row) : null;
});

/** The implemented tasks fragment — composed by src/router.ts. */
export const tasksProcedures = {
  list: tasksList,
  detail: tasksDetail,
};
