/**
 * The auth contract — S10 (auth pages + issuance).
 *
 * Shapes mirror the webapp ops verbatim (s10-auth/README.md §2 is the parity
 * checklist): `auth/magicLogin.ts`'s requestMagicLogin + verifyMagicLogin and
 * `auth/cliMint.ts`'s mintCliToken.
 *
 *   - requestMagicLogin ALWAYS answers `{ sent: true }` — fresh, rate-limited,
 *     and unknown-account alike (no enumeration, no rate-limit leak).
 *   - verifyMagicLogin takes either the link path (`{ token }`) or the code
 *     path (`{ email, code }`) and answers `{ sessionId }` — the Wasp login
 *     response shape (auth-compatibility-notes.md §4). The `wasp_session`
 *     cookie stamp that ActionAmp layers on top of that response is a
 *     transport concern (see docs/plans/slices/s10-wiring.md §2): an oRPC
 *     procedure cannot Set-Cookie through the RPCHandler response path, so
 *     the LIVE login surface is the REST twin at POST /api/auth/* in
 *     apps/api/src/index.ts, which calls the SAME cores and stamps the
 *     cookie. These procedures remain the composed /rpc/auth/* surface.
 *   - mintCliToken is auth:true — the caller must be an authenticated user;
 *     FREE plans get the 402 upsell (feature "CLI and API access").
 *   - `me` is the session read the auth pages need (the webapp used Wasp's
 *     useAuth): null when unauthenticated, else the profile fields + the
 *     `entitled` flag the CLI consent page gates on. Supersedes the account
 *     fields note in prefs.ts (wiring note §5).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

import { ProGateErrorMap } from "./projects.js";

export const requestMagicLogin = oc
  .input(z.object({ email: z.string(), returnTo: z.string().optional() }))
  .output(z.object({ sent: z.literal(true) }));

export const verifyMagicLogin = oc
  .input(
    z.object({
      email: z.string().optional(),
      code: z.string().optional(),
      token: z.string().optional(),
    }),
  )
  .output(z.object({ sessionId: z.string() }));

/** PAT mint for the CLI OAuth consent page. Plaintext shown exactly once.
 *  402 when a FREE user mints (the CLI keys its upsell off the declared code). */
export const mintCliToken = oc
  .errors(ProGateErrorMap)
  .input(z.object({ label: z.string().optional() }))
  .output(z.object({ token: z.string(), label: z.string() }));

/** The authenticated session read (null when signed out). */
export const me = oc.output(
  z.object({
    user: z
      .object({
        id: z.string(),
        email: z.string(),
        fullName: z.string(),
        firstName: z.string(),
        preferredName: z.string().nullable(),
        plan: z.string(),
        entitled: z.boolean(),
        isAdmin: z.boolean(),
        hasSeenOnboarding: z.boolean(),
      })
      .nullable(),
  }),
);

/**
 * The auth namespace — paths: POST /rpc/auth/{requestMagicLogin,
 * verifyMagicLogin,mintCliToken,me}. Composed into the tree by
 * src/router.ts (the composition line lives in
 * docs/plans/slices/s10-wiring.md §1).
 */
export const authContract = {
  requestMagicLogin,
  verifyMagicLogin,
  mintCliToken,
  me,
};
