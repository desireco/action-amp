/**
 * The lenses procedures (S7/S11) — thin wrappers over the domain cores.
 *
 * Layering (mirrors procedures/projects.ts): resolve the acting user
 * (`requireUser`), run the entitlement guards at the webapp's exact placement
 * (the Pro config gate BEFORE the cap count, both before any write), call a
 * domain core from @actionamp/domain/lenses, return its row as-is (the
 * contract DTO is the core's output shape).
 *
 * Error translation: the domain throws `HttpError` with `statusCode`; this
 * layer maps those onto the contract's DECLARED oRPC errors — 402
 * PAYMENT_REQUIRED (data `{feature, reason}`), 404, 409, 400 — so clients can
 * branch on the message with byte-exact webapp strings ("You already have a
 * lens named …", "…can't be deleted — it's one of your defaults.", "This lens
 * still has content…", the reassign-collision guidance).
 *
 * NOTE — fragment implements FRAGMENT: this file implements `lensesContract`
 * directly (not the composed `contractRouter`) so parallel slices never edit
 * shared composition. The one-line composition for api/src/router.ts
 * lives in docs/plans/slices/s7-s11-wiring.md.
 */
import { implement, ORPCError } from "@orpc/server";
import { lensesContract } from "@actionamp/contract";
import {
  getLensesCore,
  createLensCore,
  updateLensCore,
  deleteLensCore,
  createLensTxRunner,
  assertLensConfigAllowed,
  assertLensesUnderCap,
  type LensGuardUser,
} from "@actionamp/domain/lenses";
import { HttpError } from "@actionamp/domain/projects";
import { PRO_LIMITS } from "@actionamp/domain/billing";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(lensesContract).$context<ApiContext>();

// ----------------------------------------------------------------
// Error mapping + guard shims (procedures/projects.ts pattern)
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
function asGuardUser(user: ApiContext["user"]): LensGuardUser {
  return user as unknown as LensGuardUser;
}

// ----------------------------------------------------------------
// Procedures
// ----------------------------------------------------------------

const list = ORPC.list.handler(async ({ context }) =>
  guard(async () => {
    const user = requireUser(context);
    // No entitlement gate: listing every owned lens is always allowed
    // (gating fires on configuration, not reads).
    return await getLensesCore(context.entities, { userId: user.id });
  }),
);

const create = ORPC.create.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const guardUser = asGuardUser(user);
    // Entitlement: lens configuration is Pro-only. Cap check uses Pro because
    // FREE never reaches here (the config gate above throws first). The cap
    // counts ALL owned lenses (webapp placement + predicate).
    assertLensConfigAllowed(guardUser);
    const lensCount = await context.entities.Lens.count({
      where: { userId: user.id },
    });
    // The Pro soft cap binds whoever passes the config gate (webapp
    // placement: config gate → count → cap, before the create).
    assertLensesUnderCap(lensCount, PRO_LIMITS.lenses, {
      feature: `a ${PRO_LIMITS.lenses + 1}th lens`,
      reason: "more life contexts unlock with Pro",
    });
    return await createLensCore(context.entities, {
      userId: user.id,
      name: input.name,
      color: input.color,
      purpose: input.purpose,
    });
  }),
);

const update = ORPC.update.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertLensConfigAllowed(asGuardUser(user));
    return await updateLensCore(context.entities, {
      userId: user.id,
      id: input.id,
      name: input.name,
      purpose: input.purpose,
      color: input.color,
    });
  }),
);

const remove = ORPC.delete.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    assertLensConfigAllowed(asGuardUser(user));
    return await deleteLensCore(
      context.entities,
      {
        userId: user.id,
        id: input.id,
        mode: input.mode,
        targetLensId: input.targetLensId,
      },
      // The real transaction (drizzle db.transaction) — the reassign mode's
      // all-or-nothing move + delete.
      createLensTxRunner(context.db),
    );
  }),
);

/** The implemented lenses fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s7-s11-wiring.md). */
export const lensesProcedures = {
  list,
  create,
  update,
  delete: remove,
};
