import { HttpError } from "wasp/server";
import type { EntitlementMessage } from "./entitlement-types";
import {
  capViolation,
  lensViolation,
  lensConfigViolation,
  resolveLens,
  WORK_LENS_MESSAGE,
  CUSTOM_LENSES_MESSAGE,
} from "./entitlements";
import { FREE_LIMITS, PRO_LIMITS } from "./config";

/**
 * Server-only entitlement guards — convert a pure violation decision (from
 * `entitlements.ts`) into a thrown `HttpError(402)`.
 *
 * This file is the ONLY place under `src/` that imports `wasp/server` for
 * entitlement enforcement, and it has NO unit test — by design. Wasp's
 * `detectServerImports` Vite plugin blocks `wasp/server` under `src/` in the
 * client build that Vitest uses, so any static import here would break the op
 * test suite that transitively imports it. The pure decision logic lives in
 * `entitlements.ts` (unit-tested there); the HTTP behavior this file produces
 * (402 status + {feature, reason} body) is verified end-to-end.
 *
 * Why the real `HttpError` matters: Wasp's Express error handler only honors
 * `err.statusCode` when `err instanceof HttpError` — a plain error falls
 * through to a generic 500. So the guards must throw genuine HttpError
 * instances.
 */

/** Throw the violation as an HttpError(402), or do nothing if there's none. */
function throwIfViolation(violation: EntitlementMessage | null): void {
  if (violation) {
    throw new HttpError(402, `${violation.feature} is a Pro feature.`, {
      feature: violation.feature,
      reason: violation.reason,
    });
  }
}

/**
 * The context shape the guards read. `user` may be undefined (Wasp's context
 * types it as optional) — the auth check in each op runs first, so by the time
 * a guard is called the user is present; we accept undefined defensively and
 * treat its absence as "not entitled."
 */
interface GuardContext {
  user?: { id: string; plan?: string | null; planRenewsAt?: Date | null } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any;
}

/**
 * Guard a create against the FREE cap. Call after the auth check, before the
 * `.create`, passing the current non-done count for the lens.
 *
 *   await assertUnderCap(context, args.lensId, FREE_LIMITS.projects, {
 *     feature: "a 4th project", reason: "organize more than 3 projects with Pro" });
 */
export async function assertUnderCap(
  context: GuardContext,
  _lensId: string,
  currentCount: number,
  cap: number,
  msg: EntitlementMessage,
): Promise<void> {
  throwIfViolation(capViolation(context.user ?? null, currentCount, cap, msg));
}

/**
 * Guard a lens-scoped read against the FREE-lens rule. Resolves lensId →
 * `{ name, kind }` (tenancy-safe), then checks the lens violation on KIND
 * (not name — the rename-safety fix; a renamed Work lens still gates FREE).
 */
export async function assertLensAllowed(
  context: GuardContext,
  lensId: string,
  msg: EntitlementMessage = WORK_LENS_MESSAGE,
): Promise<void> {
  const lens = context.user
    ? await resolveLens(context.entities, context.user.id, lensId)
    : null;
  throwIfViolation(lensViolation(context.user ?? null, lens, msg));
}

/**
 * Guard a lens-CONFIGURATION op (create / rename / recolor / edit-purpose /
 * delete) — Pro-only across the board. FREE users get the seeded two and can
 * configure nothing. Call after the auth check, before any Lens write.
 */
export function assertLensConfigAllowed(
  context: GuardContext,
  msg: EntitlementMessage = CUSTOM_LENSES_MESSAGE,
): void {
  throwIfViolation(lensConfigViolation(context.user ?? null, msg));
}

export { FREE_LIMITS, PRO_LIMITS };
