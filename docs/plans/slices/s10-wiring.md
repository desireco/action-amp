# S10 wiring — Auth pages + issuance on the new stack

Slice: **S10 (auth pages + session issuance)**. Delivered as fragments plus
this note. Parity checklist:
`packages/contract/src/s10-auth/README.md` (the P0 notes). Issuance contract:
`docs/plans/auth-compatibility-notes.md` §4.

## 1. Composition lines (for the integrator)

The fragments are delivered uncomposed. The whole integration is:

**`packages/contract/src/router.ts`**

```ts
import { authContract } from "./auth.js";

export const contractRouter = {
  // …existing surfaces…
  auth: authContract,
};
```

**`apps/api/src/router.ts`**

```ts
import { authProcedures } from "./procedures/auth.js";

export const router = {
  // …existing surfaces…
  auth: authProcedures,
};
```

Additive exports in `packages/contract/src/index.ts` are already applied
(`authContract`), same as every prior slice.

Wire paths once composed: `POST /rpc/auth/{requestMagicLogin,verifyMagicLogin,
mintCliToken,me}`. Until then, and in parallel afterwards, the pages talk to
the REST twins (§2).

## 2. The REST-route decision (why /api/auth/* exists)

Wasp's `auth: false` maps cleanly onto the new /rpc wrapper — an anonymous
request simply resolves `user: null`, and a handler that doesn't call
`requireUser` IS auth:false (the resolution never rejects for missing
credentials; only PAT/CSRF checks reject at that layer). The procedures
fragment relies on exactly that.

What /rpc cannot express is the **login cookie stamp**. Wasp's login response
is `{ sessionId }` (compat notes §4); ActionAmp layers the `wasp_session`
cookie on top by parsing that body in `sessionCookieWriteMiddleware`. An oRPC
procedure returns plain data through the RPCHandler-built Response — there is
no hook to add a `Set-Cookie` header from inside a handler, and the wrapper
in `index.ts` is shared composition this slice must not own. Since the SPA's
session transport IS the httpOnly cookie (no localStorage `wasp:sessionId`
mirror — §3), the login flow must stamp.

Decision: `apps/api/src/index.ts` exposes four REST twins that call the SAME
cores (`src/auth/magic.ts`, `src/auth/issue.ts`) as the fragment:

| Route | Ported op | Notes |
|---|---|---|
| `POST /api/auth/request-magic-login` | `requestMagicLogin` | anonymous; always `{sent:true}` |
| `POST /api/auth/verify-magic-login` | `verifyMagicLogin` | `{sessionId}` + `Set-Cookie: wasp_session=…` |
| `GET /api/auth/me` | (new session read) | `{user: null}` or the full profile + `entitled` |
| `POST /api/auth/mint-cli-token` | `mintCliToken` | session/PAT-authed; FREE → exact 402 body |

Every route runs `resolveActingUser` first, so the transport rules stay
uniform with /rpc (Bearer-over-cookie precedence, the CSRF header requirement
on cookie-authed mutations, exact PAT error bodies). `me` and `mint` re-stamp
a fresh 30-day cookie on authed 2xx — the webapp's sliding-cookie parity
(`sessionCookie.ts` stampSessionCookie); stamping on every /rpc surface
remains a wrapper-level concern for the integrator (F10a's half-life renewal
covers the server side in the meantime).

When the `auth:` composition line lands, `/rpc/auth/*` behaves identically
except for the Set-Cookie — so the REST twins stay the browser surface even
after composition (documented here so nobody "unifies" them away and silently
breaks PWA-session survival). Error mapping on both surfaces is the webapp's
verbatim: REST `{error, status}`; oRPC BAD_REQUEST (400) / a custom
`SERVICE_UNAVAILABLE` code with explicit 503 status / `PAYMENT_REQUIRED` with
explicit 402 + `{feature, reason}` data.

## 3. Web surfaces (what the pages own)

- `src/routes/login/+page.svelte`, `src/routes/signup/+page.svelte` — thin
  wrappers (the LoginPage/SignupPage ports) around
  `src/lib/components/auth/PasswordlessAuthPage.svelte` (the
  PasswordlessAuthPage port: two-step email→code flow, `?magic=` auto-verify
  with param-stripping on failure, `?devEmail=` autologin + the Local dev
  panel behind `import.meta.env.DEV`, SplashScreen veil, exact copy/strings).
- `src/routes/cli/login/+page.svelte` — the CliLoginPage port (callback must
  be `http://localhost:<port>`, consent copy, FREE upsell line, mint +
  redirect with echoed state). Unauthenticated visitors bounce to
  `/login?returnTo=<this page+query>` — the Wasp authRequired bounce,
  hand-rolled.
- `src/lib/auth.ts` — the REST client (NEW file, additive; `lib/api.ts`
  untouched). Also hosts the `safeAuthReturnTo` client mirror.
- `src/lib/components/auth/AuthCard.svelte` + `src/lib/styles/auth.css` — the
  AuthLayout port (calm stage, brand mark, footer links, `aa-auth-*` classes),
  minus the Wasp-form override blocks (no Wasp forms to retheme).

Deviations (documented, not drift):

1. **No localStorage session.** The webapp kept `wasp:sessionId` + a Bearer
   header, with the cookie as fallback. The new SPA is cookie-only — the
   httpOnly cookie is the whole transport, the sessionCookieMirror layer is
   retired with it (same-origin deployment needs no Domain widening).
2. **Auth pages hide the shell switcher** via `:global(.shell-lens) { display:
   none }` scoped to the auth components — the root layout renders chrome the
   webapp's auth routes never had; a shared-layout change is out of this
   slice's file boundary.
3. **Signup analytics deferred** — the webapp fired `SIGNUP_COMPLETED` +
   StatCounter on signup verify; the new stack has no analytics module yet.
   (Wiring note for the analytics slice.)
4. **Porting lesson (Svelte ≠ JSX):** `pattern="[0-9]{6}"` in a Svelte string
   attribute interpolates `{6}` as an expression → the DOM got
   `pattern="[0-9]6"`, constraint validation silently blocked every submit
   (no submit event, no error anywhere). Always `pattern={"[0-9]{6}"}`. This
   cost a probe session to find — flagged here so the next ported form
   doesn't repeat it.

## 4. What the slice owns (files)

- `packages/contract/src/auth.ts` (+ additive `index.ts` export)
- `apps/api/src/auth/issue.ts` — issuance core: `generateSessionToken()`
  (from session.ts, Lucia's 25-byte lowercase-base32) stored VERBATIM as
  `Session.id`, `userId` = **Auth.id**, 30-day `expiresAt`, the
  `sessionCookieHeader` stamp, and the Lucia-scrypt `hashPassword` (`salt:key`
  hex, N=16384/r=16/p=1/dkLen=64) the verify flow writes for new users.
- `apps/api/src/auth/magic.ts` — the challenge lifecycle verbatim
  (constants `CODE_TTL_MS=10min`, `RESEND_INTERVAL_MS=60s`, `MAX_ATTEMPTS=5`;
  sha256(`id:code`) / sha256(token) at rest; atomic single-use consume; 5
  attempts; 1 active challenge/email/60s answered with byte-identical
  `{sent:true}`; supersede-older; email-failure deletes the challenge + 503;
  localhost fixed code `111111`, no send) + `returnTo.ts` + `loginActivity.ts`
  ports + the drizzle ports. One deliberate hardening beyond the webapp (found
  in cross-review): `resolveMagicEnv` adds `NODE_ENV !== "production"` to the
  localhost gate. The webapp keyed `isLocalhost()` on the hostname alone, so a
  prod deploy launched without `WASP_WEB_CLIENT_URL` would resolve the
  `http://localhost:4000` default and hand every email the universal `111111`
  code. Here that misconfig takes the prod path instead — random code + real
  send, which fails closed (challenge deleted, 503) when `RESEND_API_KEY` is
  missing. Dev/e2e (`NODE_ENV=development`) keep the fixed code.
- `apps/api/src/email.ts` — the Resend HTTPS seam (`RESEND_API_KEY`, from
  `ActionAmp <noreply@actionamp.com>`, subject "Your ActionAmp sign-in code");
  the react-email template is inlined as static HTML (same title/preview/CTA
  "Sign in to ActionAmp", 28px/700/0.16em code, muted expiry line, Dakic
  footer) — simplification noted for review.
- `apps/api/src/procedures/auth.ts` — the fragment (§1).
- `apps/api/src/auth/magic.test.ts`, `issue.test.ts` — 29 tests (EntitySpy
  pattern); `src/auth` now 67/67 (38 F10 baseline + 29).
- `apps/web` files (§3) + `apps/web/e2e/auth.spec.ts`.
- `apps/api/src/index.ts` — the four REST routes + imports (authorized by the
  slice brief's wiring note).

## 5. `me` (the session read)

The auth pages need the `useAuth()` replacement: a null-when-anonymous read
with the entitlement flag. Delivered as `auth.me` (contract + REST twin) —
this is the "S10's future `me` query" the prefs contract's getAccount comment
reserved; `prefs.getAccount` stays for the settings tab until S11 retires it.

## 6. e2e + run book

`apps/web/e2e/auth.spec.ts` — 11 tests: the `/welcome back.` identity guard,
the localhost fixed-code happy path through a REAL stamped cookie to a working
`/rpc/tasks/list`, wrong-code-stays, the 5-attempt lockout (even 111111 stops
working), the bogus-magic-link error + param strip, the byte-identical
rate-limit response, signup framing, `?devEmail=` autologin → `/do`, the `me`
read, and the mint gate (FREE 402 with the exact body; PRO mints an `aa_`
token that authenticates the Bearer path against `/rpc`, then revokes).
Expiry (10-min TTL) is pinned at the unit level — e2e cannot wait out the
TTL. A brand-new verify-created user has `hasSeenOnboarding=false`, so the
shell's onboarding gate intercepts to `/welcome` — the webapp App gate's
behavioral twin (the spec asserts `/do` or `/welcome`).

```
cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev NODE_ENV=development bun --hot src/index.ts
cd apps/web && bunx vite dev --port 5174
cd apps/web && bunx playwright test e2e/auth.spec.ts --workers=1
```

Verified live (2026-09-02, dev DB): request → code 111111 → verify →
`Session` row `id` 40 chars `[a-z2-7]`, `expiresAt` ≈ now+30d, `userId` =
Auth.id; `AuthIdentity.providerData` scrypt-format + `isEmailVerified:true`;
`LoginEvent` provider `magic`; `User.lastLoginAt` set; challenge consumed;
cookie `HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`; `/rpc/tasks/list`
answers the new cookie.

## 7. Deferred / for later slices

- **react-email fidelity** — the inlined HTML template matches copy and key
  styles; pixel-fidelity against the react-email render was not diffed.
- **Signup analytics** (§3.3) — needs the analytics module.
- **Global sliding cookie re-stamp on /rpc** — wrapper-level (integrator);
  S10 stamps on its own authed responses only.
- **Logout** — the `wasp_session` clear + ConfirmDialog live with S11's
  shell/logout surface; the new stack has no logout route yet.
- **Email verification / password-reset routes** — not ported (no UI exists
  in the webapp either; the provider enum + identity fields keep parity).
- **`/` RedirectToMarketing** — the root page is still the What Now screen
  (S1 wiring); the localhost-only `→ /login` redirect is a later shell slice.
