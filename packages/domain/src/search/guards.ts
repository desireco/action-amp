// S9 — the sitewide-search entitlement guard, ported from
// webapp/src/billing/entitlementHttp.ts's `assertSitewideSearchAccess`
// (freed of `wasp/server` like its projects/goals siblings).
//
// Sitewide search + the palette index are WHOLE-ACCOUNT Pro capabilities:
// the decision is `sitewideSearchViolation` (resolveEffectiveAccess — active
// PRO / FOUNDER / admin / manualAccessGrant), and the thrown error carries the
// byte-exact `{ feature, reason }` the client's ProGate renders. The API layer
// catches the HttpError and rethrows it as the declared oRPC
// PAYMENT_REQUIRED (402, data `{ feature, reason }`).
import { sitewideSearchViolation } from "../billing/entitlements.js";
import { HttpError } from "../projects/httpError.js";
import type { GuardUser } from "../projects/guards.js";

/** Guard both search queries: 402 unless the account is entitled. Call after
 *  the auth check and BEFORE any entity read (tested: FREE users trigger no
 *  reads). */
export function assertSitewideSearchAccess(user: GuardUser | null): void {
  const violation = sitewideSearchViolation(user ?? null);
  if (violation) {
    // Webapp's HttpError(402) body: message + { feature, reason } data.
    throw new HttpError(402, `${violation.feature} is a Pro feature.`, {
      feature: violation.feature,
      reason: violation.reason,
    });
  }
}
