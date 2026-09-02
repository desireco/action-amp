# S10 — Auth pages + issuance (P0 parity notes)

> Pre-study header for the platform-switch port. Sources read: `webapp/src/auth/`
> (`magicLogin.ts`, `magicLoginEmail.tsx`, `devAutologin.ts`, `returnTo.ts`,
> `loginActivity.ts`, `hooks.ts`, `sessionCookie.ts`, `sessionCookieMirror.ts`,
> `sessionAuth.ts`, `serverMiddleware.ts`, `cliMint.ts`, `pat.ts`,
> `appearance.ts`, `email/PasswordlessAuthPage.tsx`, `email/LoginPage.tsx`,
> `email/SignupPage.tsx`, `email/EmailVerificationPage.tsx`,
> `email/userSignupFields.ts`, `CliLoginPage.tsx`), `webapp/e2e/login.spec.ts`,
> `webapp/e2e/auth-regression.spec.ts`, `webapp/e2e/helpers.ts`, the `auth:` +
> route blocks of `webapp/main.wasp.ts`, `webapp/schema.prisma`
> (`MagicLoginChallenge`, `LoginEvent`, `ApiKey`, `User`), `webapp/src/App.tsx`,
> `webapp/src/public/RedirectToMarketing.tsx`,
> `webapp/scripts/create-verified-user.mjs`, `docs/EMAIL-INTEGRATION.md`.
> This file is the checklist the port is verified against.
>
> Scope note: until S10 lands, the new API only VALIDATES existing Wasp
> sessions (goal F10). S10 adds ISSUANCE — Wasp-format sessions + passwordless
> email via Resend.

## 1. Routes / screens

| Route (`main.wasp.ts`) | Page | Auth | Purpose |
|---|---|---|---|
| `LoginRoute` → `/login` | `auth/email/LoginPage.tsx` → `PasswordlessAuthPage` (`mode: "login"`, `showDevAutologin`) | public | Passwordless email sign-in: request code → enter code, or follow magic link. |
| `SignupRoute` → `/signup` | `auth/email/SignupPage.tsx` → `PasswordlessAuthPage` (`mode: "signup"`) | public | Same server ops, creation-framed copy ("Start free."). |
| `CliLoginRoute` → `/cli/login` | `auth/CliLoginPage.tsx` | `authRequired: true` (Wasp bounces to `/login` and back, preserving `callback`/`state` query) | OAuth-style consent page for `actionamp login`; mints a PAT and redirects to the CLI's localhost callback. |
| `EmailVerificationRoute` → `/email-verification` | `auth/email/EmailVerificationPage.tsx` | public | Wasp `VerifyEmailForm` (wrapped in `AuthLayout`, themed via `aaAuthAppearance`). |
| `LandingRoute` → `/` | `public/RedirectToMarketing.tsx` | public | On `localhost`/`127.0.0.1`/`::1` → `window.location.replace("/login")`; else → `https://actionamp.com`. This is where the App gate's unauthenticated `/` navigation lands. |
| `/app/*` (legacy) | `app/LegacyAppRedirectPage.tsx` | — | 301-style client redirect to `/do/*` preserving path+query+hash. |

Wasp auth config (exact, `main.wasp.ts` `auth:` block):

- `userEntity: "User"`; methods: **email only**. Google social auth is
  commented out (code retained in `src/auth/google/`: `config.ts`,
  `GoogleButton.tsx`, `userSignupFields.ts` — flip back on to re-enable).
- `email.fromField`: `{ name: "ActionAmp", email: "noreply@actionamp.com" }`.
- `emailVerification.clientRoute: "EmailVerificationRoute"`.
- `passwordReset.clientRoute: "LoginRoute"` — required by Wasp config even
  though no reset UI exists; a stale provider reset link lands on the
  passwordless login, where it cannot change a password.
- `onAuthSucceededRedirectTo: "/do"`; `onAuthFailedRedirectTo: "/login"`
  (relative — stays on the app subdomain).
- `onAfterLogin` hook (`src/auth/hooks.ts`): records login activity for
  Wasp-built-in logins (see §3).
- `emailSender`: `{ provider: "Resend", defaultFrom: { name: "ActionAmp", email: "noreply@actionamp.com" } }`; `RESEND_API_KEY` env required.

Client gate (`App.tsx`, the root layout Wasp does NOT wrap): for any `/do*`
path — `status === "loading"` → `SplashScreen`; resolved-but-null user →
`<Navigate to="/login" replace />`; `user.hasSeenOnboarding === false` →
`<Navigate to="/welcome" replace />`. Non-`/do` pages render bare (no shell).
`syncSessionCookie()` runs on mount and whenever `status`/`user?.id` change.

## 2. Operations (→ oRPC endpoints / REST routes)

| Op | Kind / registration | Input | Output |
|---|---|---|---|
| `requestMagicLogin` (`auth/magicLogin.ts`) | action, `auth: false`, entities `[MagicLoginChallenge]` | `{ email: string, returnTo?: string }` | `{ sent: true }` (always this shape — fresh, rate-limited, and unknown-account alike) |
| `verifyMagicLogin` (`auth/magicLogin.ts`) | action, `auth: false`, entities `[MagicLoginChallenge, User, LoginEvent]` | `{ email?: string, code?: string, token?: string }` — `{token}` = link path; `{email, code}` = code path | `{ sessionId: string }` |
| `prepareDevAutologin` (`auth/devAutologin.ts`) | action, `auth: false` (dev-only, 404 outside `NODE_ENV === "development"`) | `{ email: string }` | `{ email: string, password: string }` |
| `mintCliToken` (`auth/cliMint.ts`) | action, `auth: true`, entities `[ApiKey]` | `{ label: string }` | `{ token: string, label: string }` |
| Wasp built-ins (no source; generated) | REST under `/auth/*` | — | `/auth/email/login` returns `{ sessionId }`; `/auth/logout` clears; `login()`/`logout()` from `wasp/client/auth` |

PAT session-cookie REST surface used by `/cli/login` indirectly (see S11 for
the Settings UI's `/api/pat/*` routes): none — the browser page deliberately
uses the Wasp action `mintCliToken` (through `/operations/*` where CORS +
credentials are configured globally; custom `api()` routes have an OPTIONS
preflight gap cross-origin).

`onAfterLogin` (server hook): `recordLoginActivitySafely({ User, LoginEvent },
user.id, boundedLoginProvider(providerId.providerName))` — updates
`User.lastLoginAt = now` and creates a `LoginEvent { userId, provider,
createdAt }`. Provider enum (`LoginProvider`): `"magic" | "email" | "google" |
"github" | "discord" | "slack" | "keycloak" | "microsoft" | "username" |
"other"` (unknown strings bounded to `"other"`). Login-activity failure never
fails the login.

## 3. Behaviors

### Passwordless magic login (the primary flow)

Constants in `magicLogin.ts` (exact): `CODE_TTL_MS = 10 * 60 * 1000`,
`RESEND_INTERVAL_MS = 60 * 1000`, `MAX_ATTEMPTS = 5`.

**Request (`requestMagicLogin`):**
- Email normalized: trim + lowercase; must match
  `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` else `HttpError(400, "Enter a valid email.")`.
- `returnTo` sanitized via `safeAuthReturnTo` (see §5).
- Rate limit: if an unconsumed, unexpired challenge for this email was created
  within the last 60 s → return `{ sent: true }` WITHOUT creating or sending
  (identical response = no account-existence or rate-limit leak).
- Otherwise: `updateMany` marks every prior unconsumed challenge for the email
  `consumensedAt: now` (a newer request supersedes older emails).
- Challenge row: `id = randomUUID()`, `codeHash = sha256(id + ":" + code)`,
  `tokenHash = sha256(token)` (both hex), `expiresAt = now + 10 min`,
  `attempts = 0`. Schema: `MagicLoginChallenge { id, email, codeHash, tokenHash
  @unique, expiresAt, consumedAt?, attempts @default(0), createdAt }` with
  `@@index([email, createdAt])` + `@@index([expiresAt])`.
- Code value: `isLocalhost()` (hostname of `WASP_WEB_CLIENT_URL` — default
  `http://localhost:4000` — is `localhost`, falling back to
  `NODE_ENV === "development"`) → fixed `"111111"`; else
  `String(randomInt(100000, 1000000))` (6 digits).
- Link token: `randomBytes(32).toString("base64url")`.
- Email send (SKIPPED entirely on localhost): subject
  `"Your ActionAmp sign-in code"`; text
  `"Your ActionAmp sign-in code is ${code}. It expires in 10 minutes. Or sign in directly: ${loginUrl}"`;
  HTML via react-email `MagicLoginEmail` → `TransactionalEmail` template (code
  rendered 28px/700/letter-spacing 0.16em, CTA button "Sign in to ActionAmp",
  muted "It expires in 10 minutes. Or use the button above to sign in
  directly."). `loginUrl = {WASP_WEB_CLIENT_URL}/login?magic=<token>&returnTo=<safeReturnTo>`.
- Delivery failure: log `console.error("Magic login email delivery failed",
  …)`, DELETE the just-created challenge, throw
  `HttpError(503, "Could not send email. Try again shortly.")`.

**Verify (`verifyMagicLogin`):**
- Token (link) path: `findFirst({ tokenHash: sha256(token), consumedAt: null,
  expiresAt: > now })`; no match → `HttpError(400, "That sign-in link is no
  longer valid. Request a new one.")`.
- Code path: normalize email; code must match `/^\d{6}$/` else
  `HttpError(400, "Enter the six-digit code.")`; `findFirst({ email,
  consumedAt: null, expiresAt: > now, attempts: < 5 }, orderBy createdAt desc)`.
  Hash mismatch (or no challenge) → increment `attempts` (when a challenge
  exists) and `HttpError(400, "That code is not valid. Try again or request a
  new one.")`.
- Atomic consume: `updateMany({ id, consumedAt: null } → consumedAt: now)`;
  `count !== 1` → `HttpError(400, "That sign-in link was already used.")`
  (prevents code+link racing from creating two sessions).
- Identity: `createProviderId("email", challenge.email)` → `findAuthIdentity`.
  If absent, CREATE the user: random password (`hashPassword(randomBytes(32)
  .toString("base64url"))` — users never type it), `isEmailVerified: true`,
  `emailVerificationSentAt: null`, `passwordResetSentAt: null`; display name
  from the email local part — split on `[._+-]+`, capitalize each token, joined
  (`fullName`), `firstName` = first token, fallbacks `"There"`.
- Session: `createSession(authId)` (Wasp/Lucia) → return `{ sessionId }`.
- Records login activity with provider `"magic"` (safely — never fails login).

**Client flow (`PasswordlessAuthPage.tsx`):**
- After verify: `setSessionId(sessionId)` (Wasp SDK: localStorage
  `wasp:sessionId` + `Authorization: Bearer` on API calls); signup mode fires
  analytics `SIGNUP_COMPLETED` + StatCounter `signup_complete`; then
  `window.location.assign(returnTo)` (hard navigation, NOT router).
- Magic link auto-verify: on mount, `?magic=<token>` present → status
  `"Signing you in..."` → `verifyMagicLogin({ token })`. On failure the
  `magic` param is stripped via `history.replaceState` and the error shows.
- Code form: `codeSent` two-step state. Step 1 title `"Welcome back."` (login)
  / `"Start free."` (signup); subtitle `"We’ll email a code. No password
  needed."` / `"We’ll email a code to create your account. No password
  needed."`. Step 2 title `"Enter your code."`, subtitle `"We sent a
  six-digit code and a sign-in link to ${email}. Enter the code here, or use
  the link to continue."`. Buttons: `"Email me a code"` (login) /
  `"Continue with email"` (signup), then `"Continue"`. Status strings:
  `"Sending your sign-in email..."`, `"Signing you in..."`, dev-only
  `"Local code: 111111"`, prod `"Check your email for a code or sign-in link."`.
- Code input: `type="text" inputMode="numeric" autoComplete="one-time-code"
  pattern="[0-9]{6}" maxLength={6}`, value filtered
  `.replace(/\D/g, "").slice(0, 6)`, autoFocus. Email input:
  `type="email" autoComplete="email"`.
- Already-authenticated visit → `<Navigate to={returnTo} replace />`;
  `SplashScreen` covers the form while `useAuth()` status is `"loading"`.
- Login footer: Terms (`https://actionamp.com/terms`) + Privacy
  (`https://actionamp.com/privacy`), "Proudly Built By Dakic"
  (`https://dakic.com`), `v{__APP_VERSION__}`. Signup footer: agreement line +
  `"Already have an account? Log in"` (→ `/login`).

### Session issuance + cookie (the Wasp-compat contract)

- `Session.id` stores the session token **verbatim** (no hashing); chain
  `Session.userId → Auth.id`, `Auth.userId → User.id` (documented in
  `sessionAuth.ts`; verified against Wasp 0.25 / Lucia).
- Server-side expiry: 30 days (Lucia `sessionExpiresIn`), with Lucia half-life
  renewal. F10a validation reads the cookie → `Session` lookup → `expiresAt`
  check.
- `wasp_session` cookie (server-stamped, `sessionCookie.ts`): `httpOnly`,
  `secure` in prod, `sameSite: "lax"`, `maxAge` 30 d, `path: "/"`. Written on
  `/auth/*login` 2xx by parsing `{ sessionId }` from the response body;
  CLEARED on `/auth/logout` (any status); re-stamped with a fresh 30-day
  maxAge on every other authenticated 2xx (sliding expiration).
- Read-side lift (`attachSessionFromCookie`, global middleware
  `sessionCookieAuth`): when no `Authorization` header and a `wasp_session`
  cookie exists → synthesize `Authorization: Bearer <cookie>`. Cookie parsing
  falls back to the raw `Cookie` header when no cookie-parser ran.
- Client mirror (`sessionCookieMirror.ts`, called from `App.tsx`):
  `document.cookie` write of `wasp_session=<token>; path=/; max-age=2592000;
  SameSite=Lax[; Domain=<shared suffix>]` — NOT httpOnly (client JS is the
  only writer browsers accept cross-origin); `Domain=` widened to the shared
  registrable suffix (last two labels, e.g. `actionamp.com`) only when client
  and API hosts share it (prod `app.`/`api.actionamp.com`); cleared
  (`max-age=0`, same Domain) when the SDK token is absent. Needed for
  header-less requests (`<img>` loads, PWA share POST).
- Global middleware (`serverMiddleware.ts globalMiddlewareConfigFn`):
  `express.json` limit raised to `32mb`; CORS replaced with a
  credentials-allowing variant (`origin` = `config.allowedCORSOrigins` +
  exactly `https://actionamp.com`; `credentials: true`); `sessionCookieAuth` +
  `sessionCookieWrite` + `requestTracking` registered.
- `/api/*` routes that authenticate by cookie use `auth: false` +
  `sessionRouteAuthMiddleware` (`sessionAuth.ts`) because Wasp composes its
  auth handler BEFORE the global stack there. 401 body: `{ error: "Not
  authenticated." }`; lookup failure → 500 `{ error: "Could not authenticate." }`.

### Dev autologin (agent/QA affordance — keep parity)

- Trigger: `/login?devEmail=<email>` while `import.meta.env.DEV` on the page
  AND `NODE_ENV === "development"` server-side (else `prepareDevAutologin`
  throws `HttpError(404, "Not found.")`).
- `prepareDevAutologin`: upserts the `email` AuthIdentity with password
  `DEV_AUTOLOGIN_PASSWORD` (env override; default
  `"ActionAmpDevAutologin123!"`), forces `isEmailVerified: true`, sets
  `hasSeenOnboarding: true` on the User (so the `/welcome` gate is skipped),
  derives name from the local part (same splitting rules, fallback `"Dev
  User"`). Returns credentials; the page then calls Wasp's `login(credentials)`
  and `window.location.assign(returnTo)`.
- Page also renders a "Local dev" panel (dev only, login mode only): button
  `"Autologin zeljko@dakic.com"` (`DEFAULT_DEV_EMAIL`) + hint "Use
  `/login?devEmail=name@example.com` for any local user."
- Status while running: `"Logging in ${email}..."`.

### CLI OAuth login page (`/cli/login`)

- Params `?callback=…&state=…` read client-side; `callback` must be
  `http://localhost:<port>` (protocol `http:` + hostname `localhost`) or the
  page refuses: heading "Authorize ActionAmp CLI" + `"This link is missing
  required parameters. Run actionamp login from your terminal to start
  again."` (never silently default; anti-exfiltration).
- Signed-in but session resolving → `"Waiting for sign-in…"`.
- Consent copy: `"An application on <strong>{label}</strong> is requesting
  access to your ActionAmp account."` where label =
  `"CLI on ${navigator.userAgentData?.platform ?? "this device"}"`; "Signed in
  as `<email>`" (`user.identities?.email?.id`); explains the PAT + revocation
  ("Settings → Access tokens").
- Entitlement: FREE → `"CLI and API access are included with Pro. Upgrade from
  Settings → Billing, then run this command again."` (`assertCliAccess` on
  `mintCliToken`).
- Confirm ("Authorize" / "Authorizing") → `mintCliToken({ label })` (label
  trimmed, sliced to 80, default `"CLI"`) → redirect
  `callback?token=<plaintext>&state=<echoed>`; then `"Authorized. You can
  close this tab."`. PAT format: `aa_<base64url(32 random bytes)>`, stored as
  SHA-256 hex in `ApiKey.hashedToken` (deterministic hash — looked up by
  re-hash, NOT argon2id).

## 4. Keyboard + UX flows

- No keyboard shortcuts on auth pages (the global chord set — ⌘K, ⌘\, /, ⌘L,
  Shift+I/N/T/G/P/R, ?, Esc — lives in the authenticated shell only). Flow is:
  email → Enter/button → code (autoFocus) → Enter/button → hard redirect.
- `autoComplete` parity matters for password managers: email → `"email"`,
  code → `"one-time-code"`.
- While submitting, inputs + submit are disabled; errors render inline under
  the form (`aa-auth-error`); statuses as calm prose (`aa-auth-status`).
- Logout (from the app shell sidebar footer "Log out" button) opens a
  ConfirmDialog (`title "Log out?"`) — see S11. Logout clears localStorage
  token (Wasp `logout()`) and the `wasp_session` cookie (server `isLogout`
  branch).

## 5. Edge cases

- **Expired code/link** (10 min): code path — challenge filtered out →
  `"That code is not valid. Try again or request a new one."`; link path →
  `"That sign-in link is no longer valid. Request a new one."` (and the
  `magic` param is stripped from the URL client-side).
- **Used code/link**: atomic `updateMany` consume; loser of a race gets
  `"That sign-in link was already used."`.
- **5 wrong codes**: `attempts` counter increments per mismatch; once
  `attempts >= 5` the challenge no longer matches the lookup → same
  "not valid" 400. Requesting a new code supersedes (marks consumed) all older
  challenges for the address.
- **Rate limit**: 1 active challenge per email per 60 s; response is
  byte-identical `{ sent: true }` (no enumeration; rapid re-test looks like
  "no email" — documented gotcha in EMAIL-INTEGRATION.md §6).
- **Unknown email**: still creates a challenge and (in prod) sends the email —
  passwordless sign-in IS sign-up. Verifying creates the User + email identity
  with a random unusable password and `isEmailVerified: true`. (Contrast:
  Wasp's own email-verification sender returns 200 and sends nothing for
  unknown addresses — separate flow.)
- **Email delivery failure**: challenge deleted (never leaves a usable
  credential), 503 `"Could not send email. Try again shortly."`.
- **returnTo safety** (`returnTo.ts`): only same-origin relative paths
  accepted. Must start with `/`; parsed against a sentinel origin
  (`https://actionamp.local`); origin mismatch (absolute, protocol-relative,
  backslash tricks) → `DEFAULT_AUTH_RETURN_TO = "/do"`; else
  `pathname + search + hash` returned.
- **Email change**: NOT supported anywhere (Settings shows a read-only email
  field — S11). No password change UI either (passwords are random filler);
  a Wasp `passwordReset` email, if ever triggered by a stale provider link,
  lands on `/login`.
- **Account deletion**: no user-facing flow exists (admin-only user deletion
  lives in S17's admin surface). Cascades exist at the schema level
  (`LoginEvent.onDelete: Cascade`, `ApiKey.onDelete: Cascade`).
- **Stale/garbage session token** (localStorage desync): App gate sends the
  user to `/login` (locally `/` first → RedirectToMarketing → `/login`);
  guarded by `auth-regression.spec.ts`.
- **Google OAuth**: disabled but plumbed (`src/auth/google/` retained);
  `LoginProvider` enum keeps `"google"`.

## 6. e2e assertions (port these specs)

`webapp/e2e/login.spec.ts` (client on **:4000** per `vite.config.ts`, not
Wasp's default :3000):
- `beforeEach`: `page.goto("/login")`; heading `/welcome back/i` visible — the
  app-identity guard with an explicit failure message about `wasp start`.
- "login with known credentials reaches /do": `createVerifiedUser()` (direct
  DB insert via `scripts/create-verified-user.mjs`, email pattern
  `e2e-<stamp>@test.actionamp.dev`, `TEST_PASS = "Testpass123!"`), fill
  `input[type="email"]` + `input[type="password"]`, click button `/log in/i`,
  `expect(page).toHaveURL(/\/do/)`.
- "wrong password stays on the auth flow": wrong password → NOT `/do` + inline
  error `/invalid|incorrect|wrong/i` within 10 s.
- **Staleness warning for the port**: these two tests target Wasp's password
  `LoginForm` (`input[type="password"]`, "Log in" button), which the live
  passwordless page no longer renders — the spec predates passwordless (last
  touched at the `/app`→`/do` rename). The durable assertions to port are the
  `/welcome back/i` identity guard + "known credentials reach `/do`" +
  "wrong credentials stay auth-side"; the credential path should be modeled on
  the passwordless flow (or the devEmail seed below), not the dead password
  form.

`webapp/e2e/auth-regression.spec.ts` (the gate regression — port verbatim in
intent):
- Bogus localStorage token: `addInitScript` sets
  `localStorage["wasp:sessionId"] = "invalid-stale-token-not-in-db"`; goto
  `/do`; heading `/welcome back/i` visible within 10 s; `page.url()` NOT
  `/do`; press `Meta+K`, wait 500 ms; NO request to
  `/operations/create-inbox-item` fires.
- After logout: `signupNewUser(page)` → URL `/do`; click first button
  `/log out/i` (sidebar), then the dialog-scoped button `/^log out$/i`
  (`getByRole("dialog", { name: /log out/i })`); navigate back to `/do`; same
  heading + not-`/do` + no capture POST assertions.
- Locally `/` redirects to `/login` (RedirectToMarketing), so the gate's `/`
  bounce lands on the login heading in dev.

`webapp/e2e/helpers.ts` (harness parity):
- `signupNewUser`: `createVerifiedUser(opts)` then
  `page.goto("/login?devEmail=" + encodeURIComponent(email))` +
  `waitForURL(/\/do/, { timeout: 15_000 })` — i.e. the whole suite logs in via
  the **dev autologin route**, the F10c seed's behavioral twin.
- `uniqueEmail()`: `e2e-${Date.now()}-${rand}@test.actionamp.dev`; global
  setup/teardown removes that exact pattern from the DB.
- `create-verified-user.mjs` writes the full `User → Auth → AuthIdentity`
  chain with `isEmailVerified: true`, argon2id `TEST_PASS` hash, and
  `hasSeenOnboarding: true` (so the `/welcome` gate doesn't intercept);
  `--admin` flips `isAdmin`.
