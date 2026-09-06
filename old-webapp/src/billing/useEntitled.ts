import { useAuth } from "wasp/client/auth";
import { resolveEffectiveAccess } from "./entitlements";
import type { EntitlementMessage } from "./entitlement-types";

/**
 * Client-side entitlement read — the mirror of the server `isEntitled` check.
 *
 * Account-access fields live on the auth user (the User entity spreads into
 * AuthUserData), so no extra query is needed. Returns true while the user is
 * entitled to paid features. Use this to decide whether to show cap UI, the
 * Work-lens gate, etc.
 *
 * The client gate is the friendly surface; the server guard
 * (`assertLensAllowed` / `assertUnderCap`) is the non-negotiable boundary.
 */
export function useEntitled(): boolean {
  const { data: user } = useAuth();
  return resolveEffectiveAccess(user).isEntitled;
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
/** The shapes a Wasp 402 HttpError can take when it reaches a client catch
 *  block (Wasp propagates the data object under `.data` and, for some shapes,
 *  the response body). The server guard always sends string fields. */
interface ThrownEntitlementError {
  data?: { feature?: string; reason?: string };
  response?: { data?: { feature?: string; reason?: string } };
  message?: { data?: { feature?: string; reason?: string } };
  feature?: string;
  reason?: string;
}

/** Coerce a possible message field to display text; null when absent/empty. */
function textOf(value: string | undefined): string | null {
  return value ? value : null;
}

export function extractEntitlementMessage(cause: unknown): EntitlementMessage {
  // SAFETY: thrown values are opaque; we read only the optional 402 fields
  // and every miss falls through to the calm default below.
  const e = cause as ThrownEntitlementError;
  const data = e?.data ?? e?.response?.data ?? e?.message?.data;
  return {
    feature: textOf(data?.feature) ?? textOf(e?.feature) ?? "That",
    reason:
      textOf(data?.reason) ?? textOf(e?.reason) ?? "This is a Pro feature.",
  };
}
