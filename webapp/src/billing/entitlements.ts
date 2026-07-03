import { FREE_LIMITS, isPlanActive } from "./config";
export type { EntitlementMessage } from "./entitlement-types";
import type { EntitlementMessage } from "./entitlement-types";

/**
 * Entitlement enforcement — the billing boundary (pure logic, no `wasp/server`).
 *
 * Two decisions, both server-side (the client gate is the friendly surface; this
 * is the non-negotiable boundary since lens state is bypassable React +
 * localStorage):
 *
 * 1. **Cap decision** (`capViolation`) — FREE users can create up to
 *    `FREE_LIMITS.projects`/`goals` per lens. Counted on non-done entities so
 *    finishing work always frees a slot.
 * 2. **Lens decision** (`lensViolation`) — FREE users may only read the Me lens.
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
 * See `docs/specs/entitlement-enforcement.md` (every limit is a paywall moment).
 */

/** The subset of a user the entitlement decisions read. Both fields optional
 * (Wasp's AuthUser types them as `Plan` with a FREE default; we accept absent). */
interface EntitlementUser {
  plan?: string | null;
  planRenewsAt?: Date | null;
}

/**
 * Is this user entitled to paid features right now?
 * Server mirror of the client `useAuth`-based check — same `isPlanActive`.
 */
export function isEntitled(plan: string | undefined | null, planRenewsAt: Date | null): boolean {
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
  if (isEntitled(user?.plan, user?.planRenewsAt ?? null)) return null; // paid → unlimited
  if (currentCount >= cap) return msg;
  return null;
}

/**
 * Returns the lens-violation message if a FREE user is reading a non-Me lens,
 * else null. Paid users may read any lens. `lensName` is the lens's name
 * ("Work"/"Me"); anything not "Me" is restricted for FREE users (future
 * user-defined lenses inherit the Work rule until explicitly opened).
 */
export function lensViolation(
  user: EntitlementUser | null,
  lensName: string | null | undefined,
  msg?: EntitlementMessage,
): EntitlementMessage | null {
  if (isEntitled(user?.plan, user?.planRenewsAt ?? null)) return null; // paid → all lenses
  if (lensName && lensName !== "Me") {
    return msg ?? { feature: "the Work lens", reason: "bring your work life into ActionAmp" };
  }
  return null;
}

/**
 * Resolve a lensId → lens name, tenancy-safe (scoped to the user). Returns null
 * for an unknown/missing lens. Used by lens-scoped reads to feed `lensViolation`
 * — they receive a lensId, but the decision keys on the name.
 *
 * `findFirst` (not `findUnique`): the Lens unique is on `[userId, name]`, so
 * there's no compound `id+userId` index; `findFirst` on both filters is the
 * tenancy-safe lookup. One read per request.
 *
 * The entities param is typed loosely (the Prisma delegate's findFirst returns
 * the full Lens model type, and matching it exactly across Wasp's generated
 * generics isn't worth it for this one-shot helper). We only read `.name`.
 */
export async function resolveLensName(
  // Broadly typed: callers pass Wasp's Prisma delegate (per-op entity set) or a
  // test mock; we only read Lens.findFirst().name. Matching the exact generic
  // delegate across ops isn't worth it for this one-shot helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: { Lens: { findFirst: (a: any) => Promise<any> } } | Record<string, unknown>,
  userId: string,
  lensId: string | undefined | null,
): Promise<string | null> {
  if (!lensId) return null;
  const lens = await (entities as { Lens: { findFirst: (a: unknown) => Promise<{ name: string } | null> } })
    .Lens.findFirst({ where: { id: lensId, userId }, select: { name: true } });
  return lens?.name ?? null;
}

/** Default ProGate copy for the Work-lens gate (shared by client + server). */
export const WORK_LENS_MESSAGE: EntitlementMessage = {
  feature: "the Work lens",
  reason: "bring your work life into ActionAmp",
};
