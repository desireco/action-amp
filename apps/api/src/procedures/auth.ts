/**
 * The auth procedures (S10 — auth pages + issuance): thin wrappers
 * implementing `authContract` over the magic-login + issuance cores.
 *
 * The webapp ops these port (s10-auth/README.md §2 is the checklist):
 * `auth/magicLogin.ts`'s requestMagicLogin + verifyMagicLogin (both
 * `auth: false` — anonymous by design; passwordless sign-in IS sign-up) and
 * `auth/cliMint.ts`'s mintCliToken (`auth: true`, the CLI OAuth mint with
 * the FREE → 402 upsell). `me` is the session read the auth pages use in
 * place of Wasp's useAuth.
 *
 * TRANSPORT NOTE (docs/plans/slices/s10-wiring.md §2): these procedures are
 * the composed /rpc/auth/* surface. The LIVE login surface the Svelte pages
 * call is the REST twin in apps/api/src/index.ts (/api/auth/*), which runs
 * the SAME cores and can stamp the `wasp_session` cookie on the verify
 * response — an oRPC procedure cannot Set-Cookie through the RPCHandler
 * response path. The wrapper's user resolution never blocks these handlers:
 * an anonymous request simply resolves `user: null`, and the auth:false ops
 * don't call requireUser (the oRPC expression of Wasp's `auth: false`).
 *
 * Errors: the cores throw AuthHttpError(status, message); guard() maps it to
 * oRPC — 400 → BAD_REQUEST, 503 → a custom SERVICE_UNAVAILABLE code with an
 * explicit 503 status, matching the webapp's HttpError bodies verbatim.
 *
 * NOTE — fragment implements FRAGMENT: the `auth:` composition line for
 * apps/api/src/router.ts lives in docs/plans/slices/s10-wiring.md §1.
 */
import { implement, ORPCError } from "@orpc/server";
import { apiKey } from "@actionamp/domain/db";
import { cliAccessViolation, isEntitled } from "@actionamp/domain/billing";
import { authContract } from "@actionamp/contract";
import {
  AuthHttpError,
  drizzleMagicRequestPort,
  drizzleMagicVerifyPort,
  requestMagicLoginCore,
  resolveMagicEnv,
  verifyMagicLoginCore,
} from "../auth/magic.js";
import { drizzleSessionIssuePort } from "../auth/issue.js";
import { drizzleSessionAuthPort } from "../auth/session.js";
import { sendMagicLoginEmail } from "../email.js";
import { generatePat, hashToken } from "../auth/pat.js";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(authContract).$context<ApiContext>();

/** AuthHttpError → oRPC, webapp HttpError status + message parity. */
function mapAuthError(err: unknown): never {
  if (err instanceof AuthHttpError) {
    if (err.status === 503) {
      // No standard oRPC code carries 503 — a custom code with an explicit
      // status keeps the wire status (and message) identical to webapp's.
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        status: 503,
        message: err.message,
      });
    }
    if (err.status === 404) {
      throw new ORPCError("NOT_FOUND", { message: err.message });
    }
    if (err.status >= 500) {
      throw new ORPCError("INTERNAL", { message: err.message });
    }
    throw new ORPCError("BAD_REQUEST", { message: err.message });
  }
  throw (err instanceof Error ? err : new Error(String(err)));
}

const requestMagicLogin = ORPC.requestMagicLogin.handler(async ({ context, input }) => {
  try {
    // auth:false — no requireUser. Anonymous by design (passwordless).
    return await requestMagicLoginCore(
      drizzleMagicRequestPort(context.db, sendMagicLoginEmail),
      input,
      resolveMagicEnv(),
    );
  } catch (err) {
    mapAuthError(err);
  }
});

const verifyMagicLogin = ORPC.verifyMagicLogin.handler(async ({ context, input }) => {
  try {
    // auth:false — the code/link itself is the credential.
    return await verifyMagicLoginCore(
      drizzleMagicVerifyPort(context.db),
      input,
      resolveMagicEnv(),
      drizzleSessionIssuePort(context.db),
    );
  } catch (err) {
    mapAuthError(err);
  }
});

const mintCliToken = ORPC.mintCliToken.handler(async ({ context, input }) => {
  try {
    const acting = requireUser(context);
    // Entitlement gate BEFORE any mint (entitlementHttp.ts placement): the
    // 402 upsell with the exact feature/reason the CLI keys off.
    const violation = cliAccessViolation(acting);
    if (violation) {
      throw new ORPCError("PAYMENT_REQUIRED", {
        status: 402,
        message: `${violation.feature} is a Pro feature.`,
        data: { feature: violation.feature, reason: violation.reason },
      });
    }
    const label =
      typeof input?.label === "string" ? input.label.trim().slice(0, 80) : "CLI";
    const plaintext = generatePat();
    await context.db.insert(apiKey).values({
      id: crypto.randomUUID(),
      hashedToken: hashToken(plaintext),
      label,
      userId: acting.id,
    });
    // Plaintext returned exactly once. The /cli/login page redirects the
    // browser to the CLI's localhost callback with this token in the URL.
    return { token: plaintext, label };
  } catch (err) {
    if (err instanceof ORPCError) throw err;
    mapAuthError(err);
  }
});

const me = ORPC.me.handler(async ({ context }) => {
  // A session read — null (not 401) when anonymous: the login page calls it
  // to route signed-in visitors to returnTo.
  if (!context.user) return { user: null };
  // Re-hydrate the full shape (PAT callers resolve a narrower acting user).
  const hydrated = await drizzleSessionAuthPort(context.db).findUserWithEmail(
    context.user.id,
  );
  if (!hydrated) return { user: null };
  return {
    user: {
      id: hydrated.id,
      email: hydrated.email,
      fullName: hydrated.fullName,
      firstName: hydrated.firstName,
      preferredName: hydrated.preferredName ?? null,
      plan: hydrated.plan,
      entitled: isEntitled(
        hydrated.plan,
        hydrated.planRenewsAt,
        hydrated.isAdmin,
        hydrated.manualAccessGrant,
      ),
      isAdmin: hydrated.isAdmin,
      hasSeenOnboarding: hydrated.hasSeenOnboarding,
    },
  };
});

/** The implemented auth fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s10-wiring.md §1). */
export const authProcedures = {
  requestMagicLogin,
  verifyMagicLogin,
  mintCliToken,
  me,
};
