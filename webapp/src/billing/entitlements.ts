import { FREE_LIMITS, PRO_LIMITS, isPlanActive } from "./config";
import type { LensKind } from "@prisma/client";
export type { EntitlementMessage } from "./entitlement-types";
import type { EntitlementMessage } from "./entitlement-types";

/**
 * Entitlement enforcement — the billing boundary (pure logic, no `wasp/server`).
 *
 * Three decisions, all server-side (the client gate is the friendly surface; this
 * is the non-negotiable boundary since lens state is bypassable React +
 * localStorage):
 *
 * 1. **Cap decision** (`capViolation`) — FREE users can create up to
 *    `FREE_LIMITS.projects`/`goals` per lens. Counted on non-done entities so
 *    finishing work always frees a slot. Pro is unlimited on these counts.
 * 2. **Lens-scope decision** (`lensViolation`) — FREE users may only read the
 *    PERSONAL lens. Branches on `LensKind` (NOT the lens name), so renaming
 *    the seeded "Work" lens → "Studio" cannot escape FREE gating: the kind is
 *    the stable handle, the name is just a label.
 * 3. **Lens-config decision** (`lensConfigViolation`) — creating/editing any
 *    lens is Pro-only. FREE sees the seeded two (Me usable, Work locked) and
 *    can configure nothing. Pro is capped at `PRO_LIMITS.lenses` (soft cap).
 *
 * This module is PURE: it returns the violation (or null) and never imports
 * `wasp/server`. The companion `entitlementHttp.ts` turns a violation into a
 * thrown `HttpError(402)` for the server ops. Splitting them keeps the logic
 * unit-testable (Wasp's detectServerImports plugin blocks `wasp/server` under
 * `src/` in the client build Vitest uses, so a static import there would break
 * the whole op test suite).
 *
 * `isPlanActive` (not `isPaidPlan`) is the check: a PRO user whose
 * `planRenewsAt` has passed is treated as FREE. FOUNDER never expires.
 *
 * See `docs/specs/entitlement-enforcement.md` (every limit is a paywall moment)
 * and `docs/specs/custom-lenses.md` (the LensKind rename-safety fix).
 */

/** The subset of a user the entitlement decisions read. Both fields optional
 * (Wasp's AuthUser types them as `Plan` with a FREE default; we accept absent).
 * `isAdmin` is the staff/dev bypass — true short-circuits every gate. */
interface EntitlementUser {
  plan?: string | null;
  planRenewsAt?: Date | null;
  isAdmin?: boolean | null;
}

/**
 * Is this user entitled to paid features right now?
 * Server mirror of the client `useAuth`-based check — same `isPlanActive`.
 * Admins (isAdmin=true) are always entitled — the staff/dev bypass.
 */
export function isEntitled(
  plan: string | undefined | null,
  planRenewsAt: Date | null,
  isAdmin?: boolean | null,
): boolean {
  if (isAdmin) return true; // staff/dev bypass — no Stripe checkout needed
  return isPlanActive(plan as never, planRenewsAt);
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
  if (isEntitled(user?.plan, user?.planRenewsAt ?? null, user?.isAdmin)) return null; // paid → unlimited
  if (currentCount >= cap) return msg;
  return null;
}

/** The subset of a Lens the lens-scope decision reads. */
export interface EntitlementLens {
  name: string;
  kind: LensKind;
}

/**
 * Returns the lens-violation message if a FREE user is reading a non-PERSONAL
 * lens, else null. Paid users may read any lens.
 *
 * Branches on `LensKind`, NOT the lens name — this is the rename-safety fix.
 * The seeded "Work"/"Me" names are user-editable on Pro, so keying on the name
 * string would let a rename break FREE gating. `kind` is the stable handle:
 * `PERSONAL` is allowed for FREE; `WORK` and `CUSTOM` are restricted.
 */
export function lensViolation(
  user: EntitlementUser | null,
  lens: EntitlementLens | null,
  msg?: EntitlementMessage,
): EntitlementMessage | null {
  if (isEntitled(user?.plan, user?.planRenewsAt ?? null, user?.isAdmin)) return null; // paid → all lenses
  if (lens && lens.kind !== "PERSONAL") {
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
  if (isEntitled(user?.plan, user?.planRenewsAt ?? null, user?.isAdmin)) return null; // paid → may configure
  return msg ?? CUSTOM_LENSES_MESSAGE;
}

/**
 * Resolve a lensId → `{ name, kind }`, tenancy-safe (scoped to the user).
 * Returns null for an unknown/missing lens. Used by lens-scoped reads to feed
 * `lensViolation` — they receive a lensId, but the decision keys on kind.
 *
 * `findFirst` (not `findUnique`): the Lens unique is on `[userId, name]`, so
 * there's no compound `id+userId` index; `findFirst` on both filters is the
 * tenancy-safe lookup. One read per request.
 *
 * The entities param is typed loosely (the Prisma delegate's findFirst returns
 * the full Lens model type, and matching it exactly across Wasp's generated
 * generics isn't worth it for this one-shot helper). We read `.name` + `.kind`.
 */
export async function resolveLens(
  // Broadly typed: callers pass Wasp's Prisma delegate (per-op entity set) or a
  // test mock; we only read Lens.findFirst(). Matching the exact generic
  // delegate across ops isn't worth it for this one-shot helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: { Lens: { findFirst: (a: any) => Promise<any> } } | Record<string, unknown>,
  userId: string,
  lensId: string | undefined | null,
): Promise<EntitlementLens | null> {
  if (!lensId) return null;
  const lens = await (entities as { Lens: { findFirst: (a: unknown) => Promise<EntitlementLens | null> } })
    .Lens.findFirst({ where: { id: lensId, userId }, select: { name: true, kind: true } });
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: { Lens: { findMany: (a: any) => Promise<any> } } | Record<string, unknown>,
  user: EntitlementUser | null,
  userId: string,
): Promise<{ id: string; name: string; color: string | null; kind: LensKind }[]> {
  const where = isEntitled(user?.plan, user?.planRenewsAt ?? null, user?.isAdmin)
    ? { userId }
    : { userId, kind: "PERSONAL" as const };
  return await (entities as {
    Lens: { findMany: (a: unknown) => Promise<{ id: string; name: string; color: string | null; kind: LensKind }[]> };
  }).Lens.findMany({
    where,
    select: { id: true, name: true, color: true, kind: true },
  });
}

/** Default ProGate copy for the Work-lens gate (shared by client + server). */
export const WORK_LENS_MESSAGE: EntitlementMessage = {
  feature: "the Work lens",
  reason: "bring your work life into ActionAmp",
};

/** Default ProGate copy for the custom-lenses gate (lens configuration). */
export const CUSTOM_LENSES_MESSAGE: EntitlementMessage = {
  feature: "Custom lenses",
  reason: "add more life contexts — a Studio, a side project, a board role — with Pro",
};
