import type { Plan } from "@prisma/client";

/**
 * Billing constants — the single source of truth for the free-tier caps and
 * plan display. Both the server-side guards (when the domain entities exist)
 * and the client UI read from here.
 *
 * See docs/PRICING.md (the decisions) and docs/BILLING-INTEGRATION.md (the plan).
 */

/** Free-tier limits. Pro = unlimited. Enforced server-side, never on the client. */
export const FREE_LIMITS = {
  projects: 3,
  goals: 1,
  workLens: false, // free users can't use the Work Lens (personal/Me scope only)
} as const;

/** All paid-up plans — i.e. the user has full feature access right now. */
export function isPaidPlan(plan: Plan | undefined | null): plan is "PRO" | "FOUNDER" {
  return plan === "PRO" || plan === "FOUNDER";
}

/** Founder is the launch-priced Pro tier ($52/yr recurring). */
export function isFounder(plan: Plan | undefined | null): boolean {
  return plan === "FOUNDER";
}

/**
 * Is the user's plan currently active (entitled to paid features)?
 * - FREE → no
 * - PRO / FOUNDER → yes while planRenewsAt is in the future
 */
export function isPlanActive(plan: Plan | undefined | null, planRenewsAt: Date | null): boolean {
  if (!isPaidPlan(plan)) return false;
  if (!planRenewsAt) return false;
  return planRenewsAt.getTime() > Date.now();
}

/** Human-readable plan label for the UI. */
export const PLAN_LABEL: Record<Plan, string> = {
  FREE: "Free",
  PRO: "Pro",
  FOUNDER: "Founder",
};

/** Plan badge copy shown next to the plan label. */
export const PLAN_BADGE: Record<Plan, string> = {
  FREE: "Free plan",
  PRO: "Pro",
  FOUNDER: "Founder",
};
