import type { Plan, UserWhereInput } from "../db/index.js";

/**
 * Ported from webapp/src/billing/config.ts (F4b) — the single source of truth
 * for the free-tier caps and plan display. Both the server-side guards (when
 * the domain entities exist) and the client UI read from here.
 *
 * Signatures unchanged; the two Prisma-client type references were
 * re-expressed over the seam: `Plan` is the schema enum union,
 * `FOUNDER_MEMBERSHIP_WHERE` satisfies the seam's `UserWhereInput` (no User
 * delegate exists yet — the shape is contract only until a billing core
 * ports).
 *
 * See docs/PRICING.md (the decisions) and docs/BILLING-INTEGRATION.md (the plan).
 */

/** Free-tier limits. Pro = unlimited on entity counts. Enforced server-side, never on the client. */
export const FREE_LIMITS = {
  projects: 3,
  goals: 1,
  workLens: false, // free users can't use the Work Lens (personal/Me scope only)
} as const;

/**
 * Pro-tier soft caps. Pro is "unlimited" on the everyday entity counts
 * (projects/goals/tasks) — these caps exist only for resources that have a
 * real configurability or abuse ceiling (currently: how many lenses a Pro
 * user can create). Enforced server-side via `assertUnderCap`.
 *
 * FREE is not a count for lenses — it's a hard set (the two seeded: Me usable,
 * Work visible-but-locked). See entitlements.ts `lensConfigViolation`.
 */
export const PRO_LIMITS = {
  lenses: 8, // soft cap — matches the existing soft-cap pattern (projects=3, goals=1)
} as const;

/** All paid-up plans — i.e. the user has full feature access right now.
 *  Accepts the plan as a plain string (the AuthUser and EntitlementUser types
 *  it more loosely than the schema's Plan enum; the literal comparison is the
 *  contract either way). */
export function isPaidPlan(
  plan: string | undefined | null,
): plan is "PRO" | "FOUNDER" {
  return plan === "PRO" || plan === "FOUNDER";
}

/**
 * Is the user's plan currently active (entitled to paid features)?
 * - FREE → no
 * - PRO → yes while planRenewsAt is in the future
 * - FOUNDER → always yes (lifetime; planRenewsAt is null)
 */
export function isPlanActive(
  plan: string | undefined | null,
  planRenewsAt: Date | null,
): boolean {
  if (!isPaidPlan(plan)) return false;
  if (plan === "FOUNDER") return true; // lifetime — never expires
  if (!planRenewsAt) return false;
  return planRenewsAt.getTime() > Date.now();
}

/** Human-readable plan label for the UI. */
export const PLAN_LABEL = {
  FREE: "Free",
  PRO: "Pro",
  FOUNDER: "Founding Member",
} as const satisfies Record<Plan, string>;

/**
 * The Founding 100 — a one-time $99 lifetime Pro tier, capped at exactly 100
 * spots. Two memberships are held back for launch partners, so public checkout
 * closes after 98 claims. The reserve is disclosed wherever availability is
 * shown and partner memberships are granted manually.
 */
export const FOUNDING_100_CAP = 100;
export const FOUNDING_100_LAUNCH_PARTNER_RESERVE = 2;
export const FOUNDING_100_PUBLIC_CAP =
  FOUNDING_100_CAP - FOUNDING_100_LAUNCH_PARTNER_RESERVE;

/** Billed and manual Founders claim Founding-100; Friends deliberately do not. */
export const FOUNDER_MEMBERSHIP_WHERE = {
  OR: [{ plan: "FOUNDER" }, { manualAccessGrant: "FOUNDER" }],
} satisfies UserWhereInput;

/**
 * The Founding 100 price, in cents. Charged inline via Stripe Checkout's
 * price_data (no Price object in the dashboard) because it's a one-off,
 * non-recurring, sells-out-at-100 tier — there's no reporting or subscription
 * benefit to a Price object here. Single source of truth for the amount; the
 * marketing copy ($139) and CTA label must stay in sync with this value.
 */
export const FOUNDING_100_PRICE_CENTS = 9900;
