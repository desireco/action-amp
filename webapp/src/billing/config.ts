import type { Plan } from "@prisma/client";

/**
 * Billing constants — the single source of truth for the free-tier caps and
 * plan display. Both the server-side guards (when the domain entities exist)
 * and the client UI read from here.
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

/** All paid-up plans — i.e. the user has full feature access right now. */
export function isPaidPlan(plan: Plan | undefined | null): plan is "PRO" | "FOUNDER" {
  return plan === "PRO" || plan === "FOUNDER";
}

/**
 * Is the user's plan currently active (entitled to paid features)?
 * - FREE → no
 * - PRO → yes while planRenewsAt is in the future
 * - FOUNDER → always yes (lifetime; planRenewsAt is null)
 */
export function isPlanActive(plan: Plan | undefined | null, planRenewsAt: Date | null): boolean {
  if (!isPaidPlan(plan)) return false;
  if (plan === "FOUNDER") return true; // lifetime — never expires
  if (!planRenewsAt) return false;
  return planRenewsAt.getTime() > Date.now();
}

/** Human-readable plan label for the UI. */
export const PLAN_LABEL: Record<Plan, string> = {
  FREE: "Free",
  PRO: "Pro",
  FOUNDER: "Founding Member",
};

/**
 * The Founding 100 — a one-time $139 lifetime Pro tier, capped at exactly 100
 * spots. Enforcement lives in the checkout action (count current FOUNDER
 * users, reject if >= cap) once the CTA on /founding-100 is enabled.
 */
export const FOUNDING_100_CAP = 100;
