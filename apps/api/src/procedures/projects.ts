/**
 * The projects procedures (S5) — thin wrappers over the domain cores.
 *
 * Layering (mirrors procedures/tasks.ts): resolve the acting user
 * (`requireUser`), run the entitlement guards at the webapp's exact placement
 * (list/create/move guarded; detail reads open), call a domain core from
 * @actionamp/domain with `context.entities`, map the row to the contract DTO.
 *
 * Error translation: the domain throws `HttpError` with `statusCode` (the
 * webapp op-layer's error surface); this layer maps those onto the contract's
 * DECLARED oRPC errors — PAYMENT_REQUIRED (402, data `{feature, reason}`),
 * NOT_FOUND (404), CONFLICT (409), BAD_REQUEST (400) — so clients can branch
 * on `err.code` with byte-exact messages.
 *
 * NOTE — fragment implements FRAGMENT: this file implements
 * `projectsContract` directly (not the composed `contractRouter`) so parallel
 * slices never edit shared composition. The one-line composition for
 * apps/api/src/router.ts lives in docs/plans/slices/s5-s6-wiring.md.
 */
import { implement, ORPCError } from "@orpc/server";
import { projectsContract } from "@actionamp/contract";
import {
  createProjectCore,
  createTaskCore,
  deleteProjectCore,
  getProjectData,
  getProjectsData,
  archiveProjectCore,
  moveProjectCore,
  setProjectDoneCore,
  updateProjectCore,
  updateTaskParentCore,
  assertLensAllowed,
  assertStandardProject,
  assertUnderCap,
  HttpError,
  type GuardUser,
} from "@actionamp/domain/projects";
import { FREE_LIMITS } from "@actionamp/domain/billing";
import type { ProjectDetailResult, ProjectSummaryRow } from "@actionamp/domain/projects";
import { startTaskCore, updateTaskStatusCore } from "@actionamp/domain/tasks";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(projectsContract).$context<ApiContext>();

// ----------------------------------------------------------------
// Error mapping + guard shims
// ----------------------------------------------------------------

/** Re-throw a domain HttpError as the contract's DECLARED oRPC error. */
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

/** The guards read `plan`/`planRenewsAt`/`isAdmin`/`manualAccessGrant`. */
function asGuardUser(user: ApiContext["user"]): GuardUser {
  return user as unknown as GuardUser;
}

/** Lens-scope shim matching webapp's assertLensAllowed(context, lensId). */
function lensGuard(context: ApiContext, user: GuardUser) {
  return (lensId: string) => assertLensAllowed(context.entities, user, lensId);
}

/** The user's primary lens (name "Me" first, then oldest) — the fallback
 *  when the caller passes no lensId (webapp always had an active lens; the
 *  picker is a later slice). Mirrors the tasks.list resolution. */
async function primaryLensId(context: ApiContext, userId: string): Promise<string | null> {
  const lenses = await context.entities.Lens.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return lenses[0]?.id ?? null;
}

// ----------------------------------------------------------------
// Row → DTO mappers (presentation slices, not business logic)
// ----------------------------------------------------------------

type Iso = string | null;

function toIso(d: Date | null | undefined): Iso {
  return d ? d.toISOString() : null;
}

function toProjectSummaryDto(row: ProjectSummaryRow) {
  return {
    id: row.id,
    permalink: row.permalink,
    name: row.name,
    description: row.description,
    dueDate: toIso(row.dueDate),
    isDone: row.isDone,
    type: row.type,
    completedAt: toIso(row.completedAt),
    archivedAt: toIso(row.archivedAt),
    goal: row.goal,
    openCount: row.openCount,
    doneCount: row.doneCount,
    openItems: row.openItems,
    checkedItems: row.checkedItems,
    nextAction: row.nextAction,
    resources: row.resources.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

function toProjectDetailDto(row: NonNullable<ProjectDetailResult>) {
  return {
    id: row.id,
    permalink: row.permalink,
    name: row.name,
    description: row.description,
    dueDate: toIso(row.dueDate),
    isDone: row.isDone,
    type: row.type,
    completedAt: null,
    archivedAt: toIso(row.archivedAt),
    goal: row.goal,
    openCount: 0,
    doneCount: 0,
    openItems: 0,
    checkedItems: 0,
    nextAction: null,
    order: row.order,
    lensId: row.lensId,
    tasks: row.tasks.map((t) => ({
      id: t.id,
      permalink: t.permalink,
      description: t.description,
      content: t.content,
      isDone: t.isDone,
      priority: t.priority,
      size: t.size,
      status: t.status,
      scheduledDate: toIso(t.scheduledDate),
      snoozedUntil: toIso(t.snoozedUntil),
      completedAt: toIso(t.completedAt),
      attachments: t.attachments,
    })),
    resources: row.resources.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    })),
    attachments: row.attachments,
  };
}

// ----------------------------------------------------------------
// Procedures
// ----------------------------------------------------------------

const list = ORPC.list.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const userId = user.id;
    const lensId = input.lensId ?? (await primaryLensId(context, userId));
    if (!lensId) return [];
    // Entitlement: FREE users may only read the Me lens.
    await assertLensAllowed(context.entities, asGuardUser(user), lensId);
    const rows = await getProjectsData(context.entities, {
      userId,
      lensId,
      includeCompleted: input.includeCompleted,
      includeArchived: input.includeArchived,
    });
    return rows.map(toProjectSummaryDto);
  }),
);

const create = ORPC.create.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const userId = user.id;
    const lensId = input.lensId ?? (await primaryLensId(context, userId));
    if (!lensId) {
      throw new ORPCError("BAD_REQUEST", { message: "No Lens found for this account." });
    }
    // Entitlement: FREE users capped at FREE_LIMITS.projects per lens, and
    // the Work lens is locked. Count non-done so finishing frees a slot.
    await assertLensAllowed(context.entities, asGuardUser(user), lensId);
    const projectCount = await context.entities.Project.count({
      where: { userId, lensId, isDone: false },
    });
    assertUnderCap(asGuardUser(user), projectCount, FREE_LIMITS.projects, {
      feature: "a 4th project",
      reason: "organize more than 3 projects with Pro",
    });
    const row = await createProjectCore(context.entities, {
      userId,
      name: input.name,
      lensId,
      goalId: input.goalId,
      description: input.description,
      type: input.type,
    });
    return { id: row.id, permalink: row.permalink, name: row.name };
  }),
);

const detail = ORPC.detail.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    // No lens entitlement guard on detail reads (no-data-loss invariant).
    const row = await getProjectData(context.entities, {
      userId: user.id,
      id: input.id,
    });
    return row ? toProjectDetailDto(row) : null;
  }),
);

const createTask = ORPC.createTask.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    // A checklist project takes list items only — tasks need a STANDARD
    // project (webapp placement: guard the projectId BEFORE the core).
    if (input.projectId) {
      await assertStandardProject(context.entities, asGuardUser(user), input.projectId);
    }
    const fallbackLens = input.lensId ?? (await primaryLensId(context, user.id)) ?? "";
    return await createTaskCore(context.entities, {
      userId: user.id,
      description: input.description,
      // Fallback only — the core resolves a project/goal parent's lens first.
      lensId: fallbackLens,
      projectId: input.projectId,
      goalId: input.goalId,
      assertLens: async (resolvedLensId) => {
        await assertLensAllowed(context.entities, asGuardUser(user), resolvedLensId);
      },
    });
  }),
);

const setDone = ORPC.setDone.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await setProjectDoneCore(context.entities, {
      userId: user.id,
      id: input.id,
      isDone: input.isDone,
      assertLens: lensGuard(context, asGuardUser(user)),
    });
  }),
);

const archive = ORPC.archive.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await archiveProjectCore(context.entities, {
      userId: user.id,
      id: input.id,
      assertLens: lensGuard(context, asGuardUser(user)),
    });
  }),
);

const move = ORPC.move.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await moveProjectCore(context.entities, {
      userId: user.id,
      id: input.id,
      targetLensId: input.targetLensId,
      assertLens: lensGuard(context, asGuardUser(user)),
    });
  }),
);

const update = ORPC.update.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await updateProjectCore(context.entities, {
      userId: user.id,
      id: input.id,
      name: input.name,
      description: input.description,
      goalId: input.goalId,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate === null ? null : new Date(input.dueDate),
      type: input.type,
    });
  }),
);

const remove = ORPC.delete.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await deleteProjectCore(context.entities, {
      userId: user.id,
      id: input.id,
      taskDisposition: input.taskDisposition,
      targetProjectId: input.targetProjectId,
    });
  }),
);

const updateTask = ORPC.updateTask.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await updateTaskParentCore(context.entities, {
      userId: user.id,
      id: input.id,
      projectId: input.projectId,
      goalId: input.goalId,
    });
  }),
);

/**
 * Move-picker feed (temporary stand-in for the lenses contract — see
 * s5-s6-wiring.md): the OTHER lenses a project could move to.
 */
const moveTargets = ORPC.moveTargets.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const project = await context.entities.Project.findFirst({
      where: { id: input.projectId, userId: user.id },
      select: { lensId: true },
    });
    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Project not found." });
    }
    const lenses = await context.entities.Lens.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return lenses
      .filter((lens) => lens.id !== project.lensId)
      .map((lens) => ({ id: lens.id, name: lens.name, color: lens.color }));
  }),
);

/**
 * Horizon/status write (temporary stand-in for the tasks-mutations
 * namespace — the domain core is already ported; see s5-s6-wiring.md).
 */
const setTaskStatus = ORPC.setTaskStatus.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const row = await updateTaskStatusCore(context.entities, {
      userId: user.id,
      id: input.id,
      status: input.status,
    });
    return { id: row.id };
  }),
);

const startTask = ORPC.startTask.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const row = await startTaskCore(context.entities, {
      userId: user.id,
      id: input.id,
      // The webapp op reads user.focusSessionMinutes (25 default); the acting
      // user doesn't carry it yet, so the default applies (S11 refines).
      focusSessionMinutes: 25,
    });
    return { id: row.id, startedAt: row.startedAt ? row.startedAt.toISOString() : null };
  }),
);

/** The implemented projects fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s5-s6-wiring.md). */
export const projectsProcedures = {
  list,
  create,
  detail,
  createTask,
  setDone,
  archive,
  move,
  update,
  delete: remove,
  updateTask,
  moveTargets,
  setTaskStatus,
  startTask,
};
