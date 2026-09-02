/**
 * The search procedures (S9) — thin wrappers over the domain op layer.
 *
 * Layering (mirrors procedures/projects.ts): resolve the acting user
 * (`requireUser`), then call `searchSite` / `getCommandPaletteIndex` from
 * @actionamp/domain/search, which own the webapp sequence — entitlement 402
 * ("Command palette and search is a Pro feature." + `{ feature, reason }`)
 * BEFORE query validation (400) and BEFORE any entity read — and finally the
 * pure core. `entitlement` is the parity bridge for the webapp shell's
 * `entitled` flag (see the contract fragment's header note).
 *
 * NOTE — fragment implements FRAGMENT: this file implements `searchContract`
 * directly (not the composed `contractRouter`) so parallel slices never edit
 * shared composition. The one-line composition for api/src/router.ts
 * lives in docs/plans/slices/s9-wiring.md.
 */
import { implement, ORPCError } from "@orpc/server";
import { searchContract } from "@actionamp/contract";
import {
  getCommandPaletteIndex,
  searchSite,
} from "@actionamp/domain/search";
import { HttpError } from "@actionamp/domain/projects";
import { sitewideSearchViolation } from "@actionamp/domain/billing";
import type { ApiContext } from "../context.js";
import { requireUser } from "../context.js";

const ORPC = implement(searchContract).$context<ApiContext>();

/** Re-throw a domain HttpError as the contract's DECLARED oRPC error. */
function toOrpcError(err: unknown): never {
  if (err instanceof HttpError) {
    if (err.statusCode === 402) {
      // PAYMENT_REQUIRED is not an oRPC built-in: without an explicit status
      // it answers 500 on the wire even when declared in the contract.
      throw new ORPCError("PAYMENT_REQUIRED", {
        status: 402 as const,
        message: err.message,
        data: err.data as Record<string, string> | undefined,
      });
    }
    if (err.statusCode === 404) {
      throw new ORPCError("NOT_FOUND", { message: err.message });
    }
    throw new ORPCError("BAD_REQUEST", { message: err.message });
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

const site = ORPC.site.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    return await searchSite(context.entities, user, { query: input.query });
  }),
);

const index = ORPC.index.handler(async ({ context }) =>
  guard(async () => {
    const user = requireUser(context);
    const { items } = await getCommandPaletteIndex(context.entities, user);
    // Temporal parity: Date in the domain rows, ISO strings on the wire.
    return {
      items: items.map((item) => ({
        ...item,
        occurredAt:
          item.occurredAt === undefined
            ? undefined
            : item.occurredAt
              ? item.occurredAt.toISOString()
              : null,
      })),
    };
  }),
);

/** The palette's calm gate: FREE clients render the ProGate without firing
 *  the search queries (webapp's `entitled` shell flag). */
const entitlement = ORPC.entitlement.handler(async ({ context }) => {
  const user = requireUser(context);
  return { entitled: sitewideSearchViolation(user) === null };
});

/** The implemented search fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s9-wiring.md). */
export const searchProcedures = {
  site,
  index,
  entitlement,
};
