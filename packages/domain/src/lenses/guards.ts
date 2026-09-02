// S7/S11 — the server-side entitlement guard for the lens-configuration
// surface (create / rename / recolor / edit-purpose / delete). Ported from
// webapp/src/billing/entitlementHttp.ts's `assertLensConfigAllowed`, freed of
// `wasp/server`: the pure decision lives in ../billing/entitlements
// (`lensConfigViolation`) and this module turns a violation into a thrown
// `HttpError(402)` carrying the byte-exact `{ feature, reason }` message the
// UI's ProGate panel renders (the projects/guards.ts precedent).
//
// The Pro COUNT cap (soft cap 8 lenses) is a separate decision — the wrapper
// calls the existing `assertUnderCap` (../projects/guards.js) after this
// guard, exactly like the webapp op did (config gate first, then cap).
import {
  lensConfigViolation,
  type EntitlementMessage,
  type EntitlementUser,
} from "../billing/entitlements.js";
import { HttpError } from "../projects/httpError.js";

/** The subset of a user the guards read (the acting user from the API
 *  context satisfies this structurally). */
export type LensGuardUser = EntitlementUser & { id: string };

/** Guard a lens-configuration write: the whole surface is Pro-only. FREE
 *  gets the seeded two (Me usable, Work visible-but-locked) and can edit
 *  nothing. */
export function assertLensConfigAllowed(
  user: LensGuardUser | null,
  msg?: EntitlementMessage,
): void {
  const violation = lensConfigViolation(user ?? null, msg);
  if (violation) {
    // Webapp's HttpError(402) body: message + { feature, reason } data.
    throw new HttpError(402, `${violation.feature} is a Pro feature.`, {
      feature: violation.feature,
      reason: violation.reason,
    });
  }
}

/**
 * The Pro LENS soft cap: bind whoever passes the config gate (i.e. Pro —
 * FREE already 402'd above) at `PRO_LIMITS.lenses`. This deliberately
 * DIFFERS from the FREE caps' `capViolation` (paid → unlimited): the s11
 * notes' cap semantics are "a 9th lens is a Pro feature … more life contexts
 * unlock with Pro", and the webapp's generic `assertUnderCap` could never
 * fire it (capViolation short-circuits entitled users, so its lens-cap call
 * was dead code for the only users who reach it). The port makes the notes'
 * behavior real — see docs/plans/slices/s7-s11-wiring.md.
 */
export function assertLensesUnderCap(
  currentCount: number,
  cap: number,
  msg: EntitlementMessage,
): void {
  if (currentCount >= cap) {
    throw new HttpError(402, `${msg.feature} is a Pro feature.`, {
      feature: msg.feature,
      reason: msg.reason,
    });
  }
}
