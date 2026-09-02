/**
 * The goals procedures (S6) — thin wrappers over the domain cores. Same
 * layering + error translation as procedures/projects.ts (which see): the
 * domain's `HttpError` maps onto the contract's DECLARED errors (402 →
 * PAYMENT_REQUIRED with `{feature, reason}` data, 404/409/400 likewise).
 *
 * Entitlement placement (webapp parity): list/create are lens-gated + the
 * create carries the FREE cap (1 goal per lens); setDone is lens-gated via
 * the core's injected callback but never cap-checked; detail reads are open.
 *
 * NOTE — fragment implements FRAGMENT (see procedures/projects.ts header):
 * the composition line for api/src/router.ts lives in
 * docs/plans/slices/s5-s6-wiring.md.
 */
import { implement, ORPCError } from "@orpc/server";
import { goalsContract } from "@actionamp/contract";
import { createGoalCore, getGoalData, getGoalsData, deleteGoalCore, reorderGoalProjectsCore, setGoalDoneCore, updateGoalCore, type GoalDetailRow, type GoalSummaryRow } from "@actionamp/domain/goals";
import { FREE_LIMITS } from "@actionamp/domain/billing";
import {
  assertLensAllowed,
  assertUnderCap,
  HttpError,
  type GuardUser,
} from "@actionamp/domain/projects";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(goalsContract).$context<ApiContext>();

// ----------------------------------------------------------------
// Error mapping + guard shims (kept byte-identical to projects.ts — the
// fragments stay independently composable)
// ----------------------------------------------------------------

function toOrpcError(err: unknown): never {
  if (err instanceof HttpError) {
    const code =
      err.statusCode === 402
        ? "PAYMENT_REQUIRED"
        : err.statusCode === 404
          ? "NOT_FOUND"
          : err.statusCode === 409
            ? "CONFLICT"
            : "BAD_REQUEST";
    throw new ORPCError(code, {
      // PAYMENT_REQUIRED is not an oRPC built-in: without an explicit status
      // it answers 500 on the wire even when declared in the contract.
      ...(err.statusCode === 402 ? { status: 402 as const } : {}),
      message: err.message,
      data: err.data as Record<string, string> | undefined,
    });
  }
  throw err;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    toOrpcError(err);
  }
}

function asGuardUser(user: ApiContext["user"]): GuardUser {
  return user as unknown as GuardUser;
}

async function primaryLensId(context: ApiContext, userId: string): Promise<string | null> {
  const lenses = await context.entities.Lens.findMany({
    where: { userId, isIncluded: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return lenses[0]?.id ?? null;
}

// ----------------------------------------------------------------
// Row → DTO mappers
// ----------------------------------------------------------------

function toGoalSummaryDto(row: GoalSummaryRow) {
  return {
    id: row.id,
    permalink: row.permalink,
    name: row.name,
    description: row.description,
    projectCount: row.projectCount,
    progress: row.progress,
    nextProject: row.nextProject,
  };
}

function toGoalDetailDto(row: GoalDetailRow) {
  return {
    id: row.id,
    permalink: row.permalink,
    name: row.name,
    description: row.description,
    isDone: row.isDone,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    lensId: row.lensId,
    projects: row.projects.map((p) => ({
      id: p.id,
      permalink: p.permalink,
      name: p.name,
      isDone: p.isDone,
      order: p.order,
      dueDate: p.dueDate ? p.dueDate.toISOString() : null,
      tasks: p.tasks,
    })),
  };
}

// ----------------------------------------------------------------
// Procedures
// ----------------------------------------------------------------

const list = ORPC.list.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const lensId = input.lensId ?? (await primaryLensId(context, user.id));
    if (!lensId) return [];
    // Entitlement: FREE users may only read the Me lens.
    await assertLensAllowed(context.entities, asGuardUser(user), lensId);
    const rows = await getGoalsData(context.entities, {
      userId: user.id,
      lensId,
    });
    return rows.map(toGoalSummaryDto);
  }),
);

const detail = ORPC.detail.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    // No lens entitlement guard on detail reads (no-data-loss invariant).
    const row = await getGoalData(context.entities, {
      userId: user.id,
      id: input.id,
    });
    return row ? toGoalDetailDto(row) : null;
  }),
);

const create = ORPC.create.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const lensId = input.lensId ?? (await primaryLensId(context, user.id));
    if (!lensId) {
      throw new ORPCError("BAD_REQUEST", { message: "No Lens found for this account." });
    }
    // Entitlement: FREE users capped at FREE_LIMITS.goals per lens + Me-only.
    await assertLensAllowed(context.entities, asGuardUser(user), lensId);
    const goalCount = await context.entities.Goal.count({
      where: { userId: user.id, lensId, isDone: false },
    });
    assertUnderCap(asGuardUser(user), goalCount, FREE_LIMITS.goals, {
      feature: "a 2nd goal",
      reason: "link work to more than one outcome with Pro",
    });
    return await createGoalCore(context.entities, {
      userId: user.id,
      name: input.name,
      lensId,
      description: input.description,
    });
  }),
);

const setDone = ORPC.setDone.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await setGoalDoneCore(context.entities, {
      userId: user.id,
      id: input.id,
      isDone: input.isDone,
      // Lens gate (no cap check — hygiene), webapp placement.
      assertLens: (lensId) =>
        assertLensAllowed(context.entities, asGuardUser(user), lensId),
    });
  }),
);

const update = ORPC.update.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await updateGoalCore(context.entities, {
      userId: user.id,
      id: input.id,
      name: input.name,
      description: input.description,
    });
  }),
);

const remove = ORPC.delete.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await deleteGoalCore(context.entities, {
      userId: user.id,
      id: input.id,
    });
  }),
);

const reorder = ORPC.reorder.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await reorderGoalProjectsCore(context.entities, {
      userId: user.id,
      goalId: input.goalId,
      orderedIds: input.orderedIds,
    });
  }),
);

/** The implemented goals fragment — composed by src/router.ts (one line). */
export const goalsProcedures = {
  list,
  detail,
  create,
  setDone,
  update,
  delete: remove,
  reorder,
};
