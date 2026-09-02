/**
 * The auth client — S10. The login/signup/CLI-consent pages' REST calls to
 * the API's /api/auth/* surface (and the dev autologin route), kept out of
 * lib/api.ts (the oRPC client) because auth is cookie-stamped REST, not RPC.
 *
 * Every call rides same-origin cookies (the vite dev proxy forwards /api to
 * the Hono server) plus the `x-requested-with` header — the API's CSRF
 * stance for cookie-authed mutations (apps/api/src/auth/resolve.ts). Errors
 * throw with the server's `{ error }` message verbatim — the webapp's
 * HttpError strings reach the page untouched.
 *
 * Sessions live in the httpOnly `wasp_session` cookie the API stamps on
 * verify (S10 issuance); unlike the webapp there is no localStorage
 * `wasp:sessionId` mirror — the SPA sends no Bearer header, the cookie is
 * the whole transport (see docs/plans/slices/s10-wiring.md §3).
 */

/** The authenticated session read (null when signed out). */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  preferredName: string | null;
  plan: string;
  entitled: boolean;
  isAdmin: boolean;
  hasSeenOnboarding: boolean;
}

const AUTH_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  // Satisfies the API's CSRF requirement on cookie-authed POSTs.
  "x-requested-with": "actionamp",
};

/** Unwrap `{ error }` bodies into thrown Errors with the server's message. */
async function check<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string; feature?: string; reason?: string })
    | null;
  if (!res.ok) {
    const message =
      body && typeof body.error === "string" && body.error !== ""
        ? body.error
        : fallback;
    const err = new Error(message) as Error & {
      status?: number;
      feature?: string;
      reason?: string;
    };
    err.status = res.status;
    if (body?.feature) err.feature = body.feature;
    if (body?.reason) err.reason = body.reason;
    throw err;
  }
  return body as T;
}

/**
 * Step 1 of the passwordless flow. ALWAYS `{ sent: true }` — fresh,
 * rate-limited, and unknown-account alike (webapp parity: no enumeration,
 * no rate-limit leak).
 */
export async function requestMagicLogin(input: {
  email: string;
  returnTo?: string;
}): Promise<{ sent: true }> {
  const res = await fetch("/api/auth/request-magic-login", {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(input),
  });
  return check(res, "Could not send email. Try again.");
}

/**
 * Step 2 — `{ email, code }` (code path) or `{ token }` (magic-link path).
 * On success the API has stamped the `wasp_session` cookie; the response
 * carries the Wasp-format `{ sessionId }`.
 */
export async function verifyMagicLogin(
  input: { token: string } | { email: string; code: string },
): Promise<{ sessionId: string }> {
  const res = await fetch("/api/auth/verify-magic-login", {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(input),
  });
  return check(res, "Could not sign you in.");
}

/** The session read the pages use instead of Wasp's useAuth. */
export async function fetchAuthUser(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { headers: AUTH_HEADERS });
  const body = await check<{ user: AuthUser | null }>(res, "Could not load your session.");
  return body.user ?? null;
}

/** Mint a CLI PAT (the /cli/login consent flow). FREE plans throw a 402. */
export async function mintCliToken(input: {
  label: string;
}): Promise<{ token: string; label: string }> {
  const res = await fetch("/api/auth/mint-cli-token", {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(input),
  });
  return check(res, "Could not authorize. Try again.");
}

/**
 * Dev-only autologin (F10c): mints a real session + stamps the cookie.
 * The route 404s unless the API runs with NODE_ENV=development.
 */
export async function devAutologin(email: string): Promise<void> {
  const res = await fetch(`/api/dev/login?email=${encodeURIComponent(email)}`, {
    method: "POST",
    headers: AUTH_HEADERS,
  });
  await check(res, "Could not autologin.");
}

// --- returnTo.ts (client mirror) ------------------------------------------------

export const DEFAULT_AUTH_RETURN_TO = "/do";

const RETURN_TO_BASE = "https://actionamp.local";

/**
 * Accept only same-origin paths as post-auth destinations — the exact
 * webapp/src/auth/returnTo.ts logic (the origin comparison catches
 * protocol-relative and backslash-based URLs browsers can misread).
 */
export function safeAuthReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) {
    return DEFAULT_AUTH_RETURN_TO;
  }
  try {
    const url = new URL(value, RETURN_TO_BASE);
    if (url.origin !== RETURN_TO_BASE) return DEFAULT_AUTH_RETURN_TO;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AUTH_RETURN_TO;
  }
}
