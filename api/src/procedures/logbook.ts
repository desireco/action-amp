/**
 * The logbook procedures (S8) — thin wrapper over the domain core. Same
 * layering as procedures/goals.ts (which see): the domain's `HttpError` maps
 * onto the contract's DECLARED errors (402 → PAYMENT_REQUIRED with
 * `{ feature, reason }` data).
 *
 * Entitlement placement (P0 §5 port decision): the webapp's Wasp op had NO
 * assertLensAllowed guard — a FREE user reaching the Work-lens Logbook by
 * direct navigation read Work history (the known gap; the code comments said a
 * CLI route should add it, and the CLI route does gate). The port ADDS the
 * guard here — parity with the CLI route, closing the gap. The CLI-route
 * itself (explicit ?lensId gating, first-lens defaulting, the empty-shape
 * no-lenses answer) is S18's surface; this fragment only serves the web read.
 *
 * NOTE — fragment implements FRAGMENT (see procedures/goals.ts header): the
 * composition line for api/src/router.ts lives in
 * docs/plans/slices/s8-wiring.md.
 */
import { implement, ORPCError } from "@orpc/server";
import { logbookContract } from "@actionamp/contract";
import { getLogbookData, type LogbookData } from "@actionamp/domain/logbook";
import {
  assertLensAllowed,
  HttpError,
  type GuardUser,
} from "@actionamp/domain/projects";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(logbookContract).$context<ApiContext>();

// ----------------------------------------------------------------
// Error mapping + guard shims (kept byte-identical to goals.ts — the
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
// Row → DTO mappers (Dates → ISO strings; shapes mirror LogbookSchema 1:1)
// ----------------------------------------------------------------

function toLogbookDto(data: LogbookData) {
  return {
    tasks: data.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      completedAt: t.completedAt.toISOString(),
      size: t.size,
      outcome: t.outcome,
      project: t.project,
      kind: t.kind,
    })),
    wontDo: data.wontDo.map((t) => ({
      id: t.id,
      title: t.title,
      completedAt: t.completedAt.toISOString(),
      size: t.size,
      project: t.project,
      kind: t.kind,
    })),
    projects: data.projects.map((p) => ({
      id: p.id,
      title: p.title,
      completedAt: p.completedAt.toISOString(),
      goal: p.goal,
      kind: p.kind,
    })),
    goals: data.goals.map((g) => ({
      id: g.id,
      title: g.title,
      completedAt: g.completedAt.toISOString(),
      goal: g.goal,
      kind: g.kind,
    })),
    archived: data.archived.map((a) => ({
      id: a.id,
      title: a.title,
      archivedAt: a.archivedAt.toISOString(),
      kind: a.kind,
    })),
  };
}

/** The empty Logbook — no accessible lens. Unlike the CLI route's empty path
 *  (which omits `wontDo` — a bug noted in the P0 notes), all five keys ship. */
function emptyLogbook() {
  return { tasks: [], wontDo: [], projects: [], goals: [], archived: [] };
}

// ----------------------------------------------------------------
// Procedures
// ----------------------------------------------------------------

const data = ORPC.data.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const lensId = input.lensId ?? (await primaryLensId(context, user.id));
    if (!lensId) return emptyLogbook();
    // Entitlement: the FREE-lens read invariant (added vs the webapp op —
    // see the file header).
    await assertLensAllowed(context.entities, asGuardUser(user), lensId);
    const rows = await getLogbookData(context.entities, {
      userId: user.id,
      lensId,
    });
    return toLogbookDto(rows);
  }),
);

/** The implemented logbook fragment — composed by src/router.ts (one line). */
export const logbookProcedures = {
  data,
};
