import { useAuth } from "wasp/client/auth";
import { isPlanActive } from "./config";
import type { EntitlementMessage } from "./entitlement-types";

/**
 * Client-side entitlement read — the mirror of the server `isEntitled` check.
 *
 * `plan` + `planRenewsAt` + `isAdmin` live on the auth user (the User entity
 * spreads into AuthUserData), so no extra query is needed. Returns true while
 * the user is entitled to paid features (active PRO, FOUNDER, or the admin
 * bypass). Use this to decide whether to show cap UI, the Work-lens gate, etc.
 *
 * The client gate is the friendly surface; the server guard
 * (`assertLensAllowed` / `assertUnderCap`) is the non-negotiable boundary.
 */
export function useEntitled(): boolean {
  const { data: user } = useAuth();
  if (user?.isAdmin) return true; // staff/dev bypass
  return isPlanActive(user?.plan, user?.planRenewsAt ?? null);
}

/**
 * Extract the entitlement message a server guard attached to a 402 HttpError.
 *
 * The guards throw `HttpError(402, ..., { feature, reason })`. Wasp propagates
 * the data object onto the thrown client-side error (under `.data` and, for
 * some shapes, the response body). This finds it across the shapes Wasp
 * produces, falling back to a generic message if the 402 somehow lacks one.
 *
 * Use in a catch block: `const msg = extractEntitlementMessage(err); setGate(msg);`
 */
export function extractEntitlementMessage(err: unknown): EntitlementMessage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any;
  const data = e?.data ?? e?.response?.data ?? e?.message?.data;
  if (data && typeof data.feature === "string" && typeof data.reason === "string") {
    return { feature: data.feature, reason: data.reason };
  }
  // Fallbacks per surface — caller usually passes a default, but a stray 402
  // still gets a calm message rather than a raw status.
  return {
    feature: e?.feature ?? "That",
    reason: e?.reason ?? "This is a Pro feature.",
  };
}
