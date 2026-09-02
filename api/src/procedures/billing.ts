/**
 * The billing procedures (S16) — thin wrappers implementing `billingContract`
 * over the domain cores + procedures/billingCore.ts (the publicCore
 * precedent: the testable slice lives in billingCore.ts).
 *
 * Ported from webapp/src/billing/operations.ts's three session-auth ops (the
 * parity checklist is packages/contract/src/s16-billing/README.md §1):
 * `createCheckoutSession`, `createCustomerPortalSession`, `getBillingStatus`.
 * The public Founding-100 status count is NOT here — S15's
 * `public.getFounding100Status` (+ the REST twin) owns it.
 *
 * Error translation (procedures/lenses.ts pattern): the domain's HttpError(409)
 * maps onto the contract's DECLARED CONFLICT error — the founder-cap body is
 * the webapp string verbatim, "All public Founding memberships have been
 * claimed." Stripe-side failures stay plain errors → INTERNAL, matching the
 * webapp's untyped throws.
 *
 * NOTE — fragment implements FRAGMENT: this file implements `billingContract`
 * directly; the `billing:` composition line for src/router.ts is marked in
 * docs/plans/slices/s16-wiring.md §1.
 */
import { implement, ORPCError } from "@orpc/server";
import { billingContract } from "@actionamp/contract";
import { HttpError } from "@actionamp/domain/projects";
import {
  billingStripeOps,
  createCheckoutSessionCore,
  createCustomerPortalSessionCore,
  getBillingStatusWire,
} from "./billingCore.js";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(billingContract).$context<ApiContext>();

/** Re-throw a domain HttpError as the contract's DECLARED oRPC error. */
function toOrpcError(err: unknown): never {
  if (err instanceof HttpError) {
    const code =
      err.statusCode === 409
        ? "CONFLICT"
        : err.statusCode === 402
          ? "PAYMENT_REQUIRED"
          : err.statusCode === 404
            ? "NOT_FOUND"
            : "BAD_REQUEST";
    throw new ORPCError(code, {
      ...(err.statusCode === 402 ? { status: 402 as const } : {}),
      message: err.message,
      data: err.data as Record<string, string> | undefined,
    });
  }
  throw err;
}

const createCheckoutSession = ORPC.createCheckoutSession.handler(
  async ({ context, input }) => {
    const user = requireUser(context);
    try {
      return await createCheckoutSessionCore(
        {
          db: context.db,
          entities: context.entities,
          stripeOps: billingStripeOps,
          webClientUrl: process.env.WASP_WEB_CLIENT_URL,
        },
        input,
        user,
      );
    } catch (err) {
      toOrpcError(err);
    }
  },
);

const createCustomerPortalSession = ORPC.createCustomerPortalSession.handler(
  async ({ context }) => {
    const user = requireUser(context);
    try {
      return await createCustomerPortalSessionCore(
        {
          db: context.db,
          entities: context.entities,
          stripeOps: billingStripeOps,
          webClientUrl: process.env.WASP_WEB_CLIENT_URL,
        },
        user,
      );
    } catch (err) {
      toOrpcError(err);
    }
  },
);

const getBillingStatus = ORPC.getBillingStatus.handler(async ({ context }) => {
  const user = requireUser(context);
  return await getBillingStatusWire(context.entities, {
    id: user.id,
    plan: user.plan as "FREE" | "PRO" | "FOUNDER",
    planRenewsAt: user.planRenewsAt,
  });
});

/** The implemented billing fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s16-wiring.md §1). */
export const billingProcedures = {
  createCheckoutSession,
  createCustomerPortalSession,
  getBillingStatus,
};
