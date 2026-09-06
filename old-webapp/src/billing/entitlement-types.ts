/**
 * Shared entitlement types — importable from BOTH client and server.
 *
 * This file has NO `wasp/server` import (unlike `entitlements.ts`, which holds
 * the guards + HttpError and is server-only). It exists so client code (the
 * `<ProGate>` message state, the `useEntitled` hook) can reference the
 * `EntitlementMessage` shape without dragging the server module into the client
 * bundle (Wasp's detectServerImports plugin flags `wasp/server` at resolve
 * time, even for type-only imports).
 */

/** The feature+reason pair the client renders through <ProGate>. */
export interface EntitlementMessage {
  /** What they tried, in the "a 4th project" / "the Work lens" shape. */
  feature: string;
  /** One calm sentence on what Pro unlocks. */
  reason: string;
}
