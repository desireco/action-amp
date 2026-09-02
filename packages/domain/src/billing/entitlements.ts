import { isPlanActive } from "./config.js";
import type { LensFindFirstArgs, LensFindManyArgs } from "../db/index.js";
export type { EntitlementMessage } from "./entitlement-types.js";
import type { EntitlementMessage } from "./entitlement-types.js";

/**
 * Ported from webapp/src/billing/entitlements.ts (F4b) — SIGNATURES UNCHANGED.
 *
 * Entitlement enforcement — the billing boundary (pure logic, no server
 * framework import).
 *
 * Three decisions, all server-side (the client gate is the friendly surface; this
 * is the non-negotiable boundary since lens state is bypassable React +
 * localStorage):
 *
 * 1. **Cap decision** (`capViolation`) — FREE users can create up to
 *    `FREE_LIMITS.projects`/`goals` per lens. Counted on non-done entities so
 *    finishing work always frees a slot. Pro is unlimited on these counts.
 * 2. **Lens-scope decision** (`lensViolation`) — FREE users may only read the
 *    included lens (seeded "Me"). Branches on `isIncluded` (NOT the lens
 *    name), so renaming the seeded "Work" lens → "Studio" cannot escape FREE
 *    gating: the flag is the stable handle, the name is just a label.
 * 3. **Lens-config decision** (`lensConfigViolation`) — creating/editing any
 *    lens is Pro-only. FREE sees the seeded two (Me usable, Work locked) and
 *    can configure nothing. Pro is capped at `PRO_LIMITS.lenses` (soft cap).
 *
 * This module is PURE: it returns the violation (or null). The API layer (F8b)
 * turns a violation into an HTTP 402; splitting them keeps the logic
 * unit-testable.
 *
 * `isPlanActive` (not `isPaidPlan`) is the check: a PRO user whose
 * `planRenewsAt` has passed is treated as FREE. FOUNDER never expires.
 *
 * See `docs/specs/entitlement-enforcement.md` (every limit is a paywall moment)
 * and `docs/specs/custom-lenses.md` (the LensKind rename-safety fix).
 */

/** The subset of a user the entitlement decisions read. Both fields optional
 *  (the AuthUser types plan as `Plan` with a FREE default; we accept absent).
 *  `isAdmin` is the staff/dev bypass — true short-circuits every gate. */
export interface EntitlementUser {
  plan?: string | null;
  planRenewsAt?: Date | null;
  isAdmin?: boolean | null;
  manualAccessGrant?: "PRO" | "FOUNDER" | "FRIEND" | null;
}

export type EffectiveAccess = "FREE" | "PRO" | "FOUNDER" | "FRIEND" | "ADMIN";

export type EffectiveAccessSource = "none" | "stripe" | "manual" | "admin";

export interface EffectiveAccessResolution {
  access: EffectiveAccess;
  source: EffectiveAccessSource;
  isEntitled: boolean;
}

/**
 * Resolve product access without changing Stripe billing facts. Manual grants
 * take precedence over the billed plan; admins retain the strongest bypass.
 */
export function resolveEffectiveAccess(
  user: EntitlementUser | null | undefined,
): EffectiveAccessResolution {
  if (user?.isAdmin) {
    return { access: "ADMIN", source: "admin", isEntitled: true };
  }

  if (user?.manualAccessGrant) {
    return {
      access: user.manualAccessGrant,
      source: "manual",
      isEntitled: true,
    };
  }

  if (isPlanActive(user?.plan, user?.planRenewsAt ?? null)) {
    return {
      access: user?.plan === "FOUNDER" ? "FOUNDER" : "PRO",
      source: "stripe",
      isEntitled: true,
    };
  }

  return { access: "FREE", source: "none", isEntitled: false };
}

/** CLI access is a whole-account Pro capability, not a per-Lens exception. */
export const CLI_ACCESS_MESSAGE: EntitlementMessage = {
  feature: "CLI and API access",
  reason: "use ActionAmp from the terminal or with an agent",
};

/** Sitewide retrieval is a whole-account Pro capability. */
export const SITEWIDE_SEARCH_MESSAGE: EntitlementMessage = {
  feature: "Command palette and search",
  reason: "find and move through all your ActionAmp work from one place",
};

/**
 * Is this user entitled to paid features right now?
 * Server mirror of the client `useAuth`-based check — same `isPlanActive`.
 * Admins (isAdmin=true) are always entitled — the staff/dev bypass.
 */
export function isEntitled(
  plan: string | undefined | null,
  planRenewsAt: Date | null,
  isAdmin?: boolean | null,
  manualAccessGrant?: EntitlementUser["manualAccessGrant"],
): boolean {
  return resolveEffectiveAccess({
    plan,
    planRenewsAt,
    isAdmin,
    manualAccessGrant,
  }).isEntitled;
}

/** Return the Pro message unless this account can use the CLI/API surface. */
export function cliAccessViolation(
  user: EntitlementUser | null,
): EntitlementMessage | null {
  return resolveEffectiveAccess(user).isEntitled ? null : CLI_ACCESS_MESSAGE;
}

/** Return the Pro message unless this account can use sitewide search. */
export function sitewideSearchViolation(
  user: EntitlementUser | null,
): EntitlementMessage | null {
  return resolveEffectiveAccess(user).isEntitled
    ? null
    : SITEWIDE_SEARCH_MESSAGE;
}

/**
 * Returns the cap-violation message if a FREE user is at/over the cap, else null.
 * Paid users (active PRO / FOUNDER) are unlimited → always null.
 */
export function capViolation(
  user: EntitlementUser | null,
  currentCount: number,
  cap: number,
  msg: EntitlementMessage,
): EntitlementMessage | null {
  if (resolveEffectiveAccess(user).isEntitled) return null; // paid → unlimited
  if (currentCount >= cap) return msg;
  return null;
}

/** The subset of a Lens the lens-scope decision reads. */
export interface EntitlementLens {
  name: string;
  isIncluded?: boolean;
}

/**
 * Returns the lens-violation message if a FREE user is reading a lens that is
 * not included in the Free plan, else null. Paid users may read any lens.
 *
 * Branches on `isIncluded`, NOT the lens name — this is the rename-safety
 * fix. The seeded "Work"/"Me" names are user-editable on Pro, so keying on
 * the name string would let a rename break FREE gating. `isIncluded` is the
 * stable handle: the included lens (seeded "Me") is allowed for FREE; every
 * other lens is restricted.
 */
export function lensViolation(
  user: EntitlementUser | null,
  lens: EntitlementLens | null,
  msg?: EntitlementMessage,
): EntitlementMessage | null {
  if (resolveEffectiveAccess(user).isEntitled) return null; // paid → all lenses
  if (lens && !lens.isIncluded) {
    return msg ?? WORK_LENS_MESSAGE;
  }
  return null;
}

/**
 * Returns the lens-config-violation message if a non-Pro user attempts any lens
 * configuration (create / rename / recolor / edit-purpose / delete), else null.
 *
 * Lens configuration is Pro-only across the board — FREE gets the seeded two
 * (Me usable, Work visible-but-locked) and can edit nothing. Pro is subject to
 * `PRO_LIMITS.lenses` (a count cap, enforced separately via `assertUnderCap`).
 */
export function lensConfigViolation(
  user: EntitlementUser | null,
  msg?: EntitlementMessage,
): EntitlementMessage | null {
  if (resolveEffectiveAccess(user).isEntitled) return null; // paid → may configure
  return msg ?? CUSTOM_LENSES_MESSAGE;
}

/** The Lens row fields `resolveAccessibleLenses` returns. */
export interface AccessibleLensRow {
  id: string;
  name: string;
  color: string | null;
  isIncluded: boolean;
}

/**
 * The Lens delegate slices these resolvers call, typed with the seam's arg
 * types (named, not loose dictionaries): callers pass the seam `Entities`
 * (`createEntities(db).Lens`), or a test mock — all compatible with this
 * slice. `PromiseLike` matches thenable client objects; each resolver awaits
 * and narrows to the rows it selected.
 */
interface LensNameLookup {
  Lens: {
    findFirst(
      args: LensFindFirstArgs,
    ): PromiseLike<EntitlementLens | null>;
  };
}

export interface LensListLookup {
  Lens: {
    findMany(args: LensFindManyArgs): PromiseLike<AccessibleLensRow[]>;
  };
}

/**
 * Resolve a lensId → `{ name, isIncluded }`, tenancy-safe (scoped to the
 * user). Returns null for an unknown/missing lens. Used by lens-scoped reads
 * to feed `lensViolation` — they receive a lensId, but the decision keys on
 * isIncluded.
 *
 * `findFirst` (not `findUnique`): the Lens unique is on `[userId, name]`, so
 * there's no compound `id+userId` index; `findFirst` on both filters is the
 * tenancy-safe lookup. One read per request.
 */
export async function resolveLens(
  entities: LensNameLookup,
  userId: string,
  lensId: string | undefined | null,
): Promise<EntitlementLens | null> {
  if (!lensId) return null;
  const lens = await entities.Lens.findFirst({
    where: { id: lensId, userId },
    select: { name: true, isIncluded: true },
  });
  return lens ?? null;
}

/**
 * The lens ids a user is allowed to READ — the entitlement filter for global,
 * cross-lens views (Today per WORKFLOW.md §5.11). Mirrors `lensViolation`'s
 * rule: entitled users read every lens; non-entitled users read only their
 * `PERSONAL` lenses (the seeded "Me" + any other PERSONAL lens, though in
 * practice that's one). `WORK` and `CUSTOM` lenses are excluded for FREE.
 *
 * Used by global Today so a downgraded user no longer sees Today tasks from
 * now-inaccessible lenses — the set-filter replacement for the per-task
 * `assertLensAllowed` guard that lens-scoped reads use.
 *
 * Returns the full Lens rows (id + the fields a row pill needs) so the caller
 * doesn't need a second lookup; callers that only want ids map to `.id`.
 */
export async function resolveAccessibleLenses(
  entities: LensListLookup,
  user: EntitlementUser | null,
  userId: string,
): Promise<AccessibleLensRow[]> {
  const where = resolveEffectiveAccess(user).isEntitled
    ? { userId }
    : { userId, isIncluded: true };
  return entities.Lens.findMany({
    where,
    select: { id: true, name: true, color: true, isIncluded: true },
  });
}

/** Default ProGate copy for the Work-lens gate (shared by client + server). */
export const WORK_LENS_MESSAGE: EntitlementMessage = {
  feature: "another Lens",
  reason: "organize more areas of your life with Pro",
};

/** Default ProGate copy for the custom-lenses gate (lens configuration). */
export const CUSTOM_LENSES_MESSAGE: EntitlementMessage = {
  feature: "Custom lenses",
  reason:
    "add more life contexts — a Studio, a side project, a board role — with Pro",
};
