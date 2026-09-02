/**
 * Request-level auth resolution — the logic the /rpc/* wrapper runs before
 * oRPC's handler (F10a/F10b/F10c wiring).
 *
 * Transport precedence (compat notes §1.2, matching webapp's
 * attachSessionFromCookie "header wins" rule):
 *
 *  1. `Authorization` header present → Bearer path. NO cookie semantics, NO
 *     CSRF requirement (a cross-site fetch cannot set this header without a
 *     CORS preflight our allowlist never grants).
 *       - Token looks like a PAT (`aa_…`) → F10b PAT resolution (may reject
 *         401/402 with the exact webapp patMiddleware bodies).
 *       - Anything else → F10a session lookup by exact string (the legacy SPA
 *         path sends the raw session id as Bearer). No format assumption.
 *  2. No header → `wasp_session` cookie path (session-only; a cookie must
 *     never satisfy a PAT route and a PAT is never accepted from a cookie).
 *
 * CSRF stance (F10c): a cookie-authed MUTATING request (POST today; PUT/
 * PATCH/DELETE covered for when they exist) must carry a custom header —
 * `x-requested-with` (any non-empty value; `x-actionamp-api` also accepted).
 * Rationale: SameSite=Lax already blocks cross-site POSTs from attaching the
 * cookie in modern browsers, and cross-site JS cannot set custom headers
 * without a CORS preflight — the header is defense-in-depth that costs same-
 * origin clients (the Svelte app, Playwright) one default header. GETs are
 * exempt: navigation/<img> loads cannot set headers and must stay
 * side-effect-free (the <img> cookie-auth reads rely on this). Bearer requests
 * are exempt — both CLIs authenticate purely via the header.
 *
 * Session failure (bad/expired token) does NOT reject here: the user is
 * simply null and handlers throw the typed oRPC UNAUTHORIZED (the F8b 401
 * contract). PAT failures DO reject at this layer with the webapp's exact
 * bodies — that is patMiddleware's placement, and the CLIs key off those
 * shapes (cli/src/api.ts:57-76).
 */
import type { ActingUser } from "../actingUser.js";
import { readBearerToken, TOKEN_PREFIX } from "./pat.js";
import type {
  PatLookupPort,
  PatResolution,
} from "./pat.js";
import { readSessionCookie } from "./session.js";
import type {
  SessionAuthPort,
  SessionUser,
} from "./session.js";
import { validateSessionCore } from "./session.js";
import { resolvePatCore } from "./pat.js";

/** The request facts the resolver needs (Hono header reads in index.ts). */
export interface AuthRequestInput {
  method: string;
  authorization?: string;
  cookie?: string;
  requestedWith?: string;
  actionAmpApi?: string;
}

export type AuthPorts = {
  sessionPort: SessionAuthPort;
  patPort: PatLookupPort;
};

export type AuthResolution =
  | { kind: "authenticated"; via: "session" | "pat"; user: ActingUser }
  | { kind: "unauthenticated"; via: "none" | "session" }
  | { kind: "reject"; status: 401 | 402 | 403; body: Record<string, unknown> };

/** Methods whose side effects CSRF protection guards (POST is the only /rpc verb today). */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function hasCsrfHeader(input: AuthRequestInput): boolean {
  return (
    (input.requestedWith !== undefined && input.requestedWith.trim() !== "") ||
    (input.actionAmpApi !== undefined && input.actionAmpApi.trim() !== "")
  );
}

/**
 * Resolve one request to an acting user / rejection. Pure orchestration over
 * the two auth ports — no framework types, fully unit-mockable.
 */
export async function resolveActingUser(
  ports: AuthPorts,
  input: AuthRequestInput,
): Promise<AuthResolution> {
  const bearer = readBearerToken(input.authorization);

  if (input.authorization !== undefined && input.authorization !== "") {
    // Bearer path — cookies are never consulted here. Namespace routing on
    // the `aa_` prefix (not the strict shape): a malformed PAT body must
    // still yield patMiddleware's "Missing or malformed bearer token." — and
    // `aa_` can never collide with a session token, whose base32 alphabet
    // has no underscore. The session namespace is shape-agnostic by design
    // (exact-string lookup; a 64-hex seeded outlier validates fine).
    if (bearer && bearer.startsWith(TOKEN_PREFIX)) {
      const pat: PatResolution = await resolvePatCore(ports.patPort, input.authorization);
      if (!pat.ok) {
        return { kind: "reject", status: pat.status, body: pat.body };
      }
      return { kind: "authenticated", via: "pat", user: pat.user };
    }
    const user: SessionUser | null = await validateSessionCore(ports.sessionPort, bearer);
    return user
      ? { kind: "authenticated", via: "session", user }
      : { kind: "unauthenticated", via: "session" };
  }

  const cookieToken = readSessionCookie(input.cookie);
  if (!cookieToken) {
    return { kind: "unauthenticated", via: "none" };
  }

  // Cookie-authed mutation without the custom header → CSRF reject (checked
  // before any DB work: nothing to forge when we would 401 anyway).
  if (MUTATING_METHODS.has(input.method.toUpperCase()) && !hasCsrfHeader(input)) {
    return {
      kind: "reject",
      status: 403,
      body: {
        error:
          "CSRF check failed: cookie-authenticated mutations require an x-requested-with header.",
      },
    };
  }

  const user = await validateSessionCore(ports.sessionPort, cookieToken);
  return user
    ? { kind: "authenticated", via: "session", user }
    : { kind: "unauthenticated", via: "session" };
}
