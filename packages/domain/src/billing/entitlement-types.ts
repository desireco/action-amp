/**
 * Ported from webapp/src/billing/entitlement-types.ts (F4b) — unchanged.
 *
 * Shared entitlement types — importable from BOTH the API layer and clients.
 *
 * This file has NO server/runtime import. It exists so client code (the
 * `<ProGate>` message state, the `useEntitled` hook) can reference the
 * `EntitlementMessage` shape without dragging the server module into the
 * client bundle.
 */

/** The feature+reason pair the client renders through <ProGate>. */
export interface EntitlementMessage {
  /** What they tried, in the "a 4th project" / "the Work lens" shape. */
  feature: string;
  /** One calm sentence on what Pro unlocks. */
  reason: string;
}
