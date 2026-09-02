# Auth compatibility notes — platform switch F10 (pre-study)

Spec for goals **F10a/F10b/F10c** (auth validation, Wasp-compatible) of the
platform switch ([2026-08-31-platform-switch-goals.md](2026-08-31-platform-switch-goals.md) §F10),
plus note-only material for **S10** (session issuance). Everything below was
verified against the installed code (`webapp/src/`, the generated
`webapp/.wasp/out/` tree, `webapp/node_modules/lucia` + adapter) and the live
dev DB (`actionamp_dev`, read-only) on 2026-09-01. File:line refs point at the
verified sources.

The switch's superpower: **nobody re-logs-in on switch day** — existing
browser session cookies and CLI PATs must validate against the new API
(Svelte + Hono + oRPC + Drizzle) against the same Postgres.

## 0. The ten facts (TL;DR)

| # | Fact | Verified at |
|---|------|-------------|
| 1 | Session cookie name is **`wasp_session`** (ActionAmp's own fallback layer, not Wasp core). Wasp itself ships no cookie; the browser SPA normally sends `Authorization: Bearer <sessionId>` with the id from localStorage key **`wasp:sessionId`** (JSON-stringified). | `webapp/src/auth/sessionCookie.ts:65`, `webapp/.wasp/out/sdk/wasp/dist/api/index.js:5-24`, `.../core/storage.js:4` |
| 2 | **Session tokens are NOT hashed.** `Session.id` holds the token verbatim (PK lookup by the exact string). The pre-study hypothesis ("Wasp 0.16+ hashes session tokens") is false for this install: Wasp `^0.25.0` vendors **Lucia 3.2.2**, whose `validateSession` looks the id up directly. | `webapp/node_modules/lucia/dist/core.js:60-91`, `webapp/.wasp/out/sdk/wasp/dist/auth/session.js:23-32`, `webapp/src/auth/sessionAuth.ts:14-17` |
| 3 | Session token format: **40 chars, `[a-z2-7]`** (RFC 4648 lowercase base32, no padding) = `randomBytes(25)` encoded. DB confirms: 439/440 ids match `^[a-z2-7]{40}$`. | `webapp/node_modules/lucia/dist/crypto.js:25-28`, `core.js:93` |
| 4 | Join path: `Session.userId → Auth.id`, `Auth.userId → User.id`. Note **`Session.userId` is the Auth id, not the User id**. `Auth.userId` is nullable (orphaned Auth authenticates nobody). | `webapp/.wasp/out/db/schema.prisma:468-493`, `webapp/src/auth/sessionAuth.ts:42-60` |
| 5 | Expiry: `expiresAt` (timestamp(3)); expired sessions are **deleted on read** (lazy cleanup) and Lucia extends `expiresAt` to now+30d once past **half-life** (15d) — same id, no rotation. Default lifetime 30d. | `webapp/node_modules/lucia/dist/core.js:26,60-91` |
| 6 | PAT format: **`aa_` + base64url(32 random bytes)** = 46 chars total (`aa_` + 43). Example shape: `aa_XXXX…(43 base64url chars)`. | `webapp/src/auth/pat.ts:31-39` |
| 7 | PAT storage: **SHA-256 hex (64 lowercase chars) of the full plaintext (incl. `aa_` prefix)** in `ApiKey.hashedToken` (UNIQUE). Lookup = re-hash inbound token → `findUnique({ where: { hashedToken } })`. Deterministic hash, no salt, no timing-safe string compare needed (index equality on a hash). Plaintext shown exactly once at issue. | `webapp/src/auth/pat.ts:40-48`, `patMiddleware.ts:89-135` |
| 8 | CLI header: **`Authorization: Bearer aa_…`**. `/api/cli/*` routes are **Bearer-only** — the middleware stack explicitly *deletes* the session-cookie middlewares there. Missing/malformed → `401 {"error":"Missing or malformed bearer token."}`; wrong/revoked → `401 {"error":"Invalid or revoked token."}`; FREE plan → `402` before any handler. | `cli/src/api.ts:40-48`, `webapp/src/auth/patMiddleware.ts:60-64,143-161,194-199` |
| 9 | There is **no CSRF-token mechanism anywhere** in Wasp 0.25 (default stack: helmet, cors, logger, json, urlencoded, cookieParser). CSRF posture = Bearer-header-by-default + `SameSite=Lax` on the fallback cookie + credentials-CORS allowlist. | `webapp/.wasp/out/server/dist/src/middleware/globalMiddleware.js:10-17`, `webapp/src/auth/sessionCookie.ts:72-80`, `serverMiddleware.ts:55-72` |
| 10 | Wasp's own Bearer parse is **case-sensitive** (`split(" ")`, scheme must equal `Bearer` exactly — Lucia `readBearerToken`); ActionAmp's middlewares use `/^Bearer\s+(.+)$/i`. Accept the case-insensitive superset in the new API. | `webapp/node_modules/lucia/dist/core.js:123-129`, `webapp/src/auth/patMiddleware.ts:60-64`, `sessionAuth.ts:44` |

---

## 1. F10a — Session validation

### 1.1 How a request authenticates today (the full path)

Wasp 0.25 (`webapp/main.wasp.ts:249`) vendors Lucia 3.2.2 +
`@lucia-auth/adapter-prisma` (`webapp/.wasp/out/sdk/wasp/dist/auth/lucia.js:17-33`).
No cookies in Wasp core — "we are using the Authorization header to send the
session token".

Two token transports reach the same validator:

1. **Header (primary).** The React client keeps the session id in localStorage
   (`wasp:sessionId`, JSON-stringified — `core/storage.js:4,30-37` +
   `api/index.js:5-24`) and injects `Authorization: Bearer <sessionId>` on
   every API call (`api/index.js:41-44`).
2. **Cookie (ActionAmp fallback).** `webapp/src/auth/sessionCookie.ts` —
   ActionAmp's own layer, added because iOS/Brave PWA storage eviction logs
   users out. Cookie **`wasp_session`** carries the *same* token.
   Read side (`attachSessionFromCookie`, lines 91-129): if no
   `Authorization` header is present, the cookie value is lifted into
   `Authorization: Bearer <value>` so Wasp's auth path works unchanged.
   The raw-`Cookie` parse URI-decodes the value (`decodeURIComponent`,
   lines 122-126) — a no-op for base32, but replicate it for parity.
   Write side (lines 150-228): set on `/auth/*login` 2xx (parses
   `{sessionId}` from the JSON body), cleared on `/auth/logout`, re-stamped
   with a fresh 30d maxAge on every authenticated 2xx (sliding cookie).

The server `auth` handler (`webapp/.wasp/out/server/bundle/server.js:514-528`):
no `Authorization` header → `req.user = null` (proceed; `auth: true` routes
then 401 at the op layer); header present but session invalid → throws 401
invalid-credentials. Mounted as `router.post("/<op>", auth, handler)` on
`/operations` (bundle :8788+) and `/auth` `/me` + `/logout` (bundle :9461-9463);
routers mount with the global middleware stack first (bundle :12329-12331).

Validation itself (`lucia/dist/core.js:60-91` + adapter
`getSessionAndUser` — `@lucia-auth/adapter-prisma/dist/index.js`):

1. `Session.findUnique({ where: { id: token } })` join `Auth` — **verbatim
   id equality, no hashing, no prefix, no checksum**.
2. No row → null. Auth/user missing → **delete the session row**, null.
3. `expiresAt <= now` → **delete the session row**, null.
4. Half-life renewal: if `now > expiresAt − 15d`, set `expiresAt = now + 30d`
   (UPDATE, same id, no token rotation) and mark the session `fresh`.
5. User load: `User.findUnique({ where: { id: auth.userId } })` with
   `auth.identities` included.

ActionAmp's cookie-authed `/api/*` middleware (`sessionAuth.ts:42-60`) does a
read-only subset of exactly this (findUnique → expiry check → `auth.userId`),
which is the minimal contract F10a must meet.

### 1.2 The exact lookup the new API must replicate

SQL (read path):

```sql
SELECT s."expiresAt", a."userId"
FROM "Session" s
JOIN "Auth" a ON a.id = s."userId"
WHERE s.id = $1;   -- $1 = raw token from cookie/header, verbatim
-- authenticated iff row exists AND "expiresAt" > now() AND "userId" IS NOT NULL
```

Drizzle-shaped:

```ts
const row = await db.query.sessions.findFirst({
  where: eq(schema.sessions.id, token),
  columns: { expiresAt: true },
  with: { auth: { columns: { userId: true } } },
});
if (!row || row.expiresAt.getTime() <= Date.now() || !row.auth.userId) return null;
return { userId: row.auth.userId };
```

Plus, while the bridge runs (both stacks against one DB), replicate the
Lucia side effects so the stacks stay consistent:

- expired row → `DELETE FROM "Session" WHERE id = $1` (lazy cleanup);
- past half-life (`expiresAt − 15d < now < expiresAt`) →
  `UPDATE "Session" SET "expiresAt" = now() + interval '30 days' WHERE id = $1`.

Token acceptance rules:

- Read `wasp_session` cookie **only when no `Authorization` header is present**
  (header wins; matches `attachSessionFromCookie`).
- Accept the token from either the cookie or `Authorization: Bearer <token>`.
- Bearer scheme match: accept case-insensitively (superset of both existing
  parsers; Wasp is case-sensitive, ActionAmp's own middleware is not).
- No format assumption: match by exact string. (439/440 dev rows are
  40-char base32, but one 64-hex seeded row exists and validates fine.)

### 1.3 Table shapes (generated schema, `webapp/.wasp/out/db/schema.prisma:468-493`)

```prisma
model Auth {
  id         String   @id @default(uuid())   // uuid text
  userId     String?  @unique                // → User.id, nullable, CASCADE
  identities AuthIdentity[]
  sessions   Session[]
}
model AuthIdentity {
  providerName   String    // 'email' (only provider live; Google disabled)
  providerUserId String    // the email address
  providerData   String @default("{}")  // JSON: hashedPassword (scrypt), isEmailVerified, …
  authId         String    // → Auth.id, CASCADE
  @@id([providerName, providerUserId])
}
model Session {
  id        String   @id @unique           // THE token, verbatim (text)
  expiresAt DateTime                       // timestamp(3); no createdAt column
  userId    String                         // → Auth.id (NOT User.id), CASCADE
  @@index([userId])
}
```

Dev-DB verification (`actionamp_dev`, 2026-09-01): `Session` 440 rows
(190 unexpired; 439 ids `^[a-z2-7]{40}$`, 1 outlier `^[0-9a-f]{64}$` — a
seeded test row, not a Wasp format); `Auth` 37 rows, 0 orphaned `userId`;
`AuthIdentity` 37 rows, all `providerName='email'`; all 440 sessions join
cleanly to a `User`.

### 1.4 Implementation plan (F10a, est. ½d per goal set)

1. Hono middleware `sessionAuth`: extract token (cookie `wasp_session`
   unless `Authorization` present), run the lookup above, attach
   `{ userId }` to context; 401 JSON on failure for auth-required routes.
2. Replicate side effects (lazy delete + half-life extension) — cheap,
   keeps Wasp and the new API behaviorally identical during the bridge.
3. User hydration: the new app's "user" object joins
   `User ← Auth.userId`; entitlement fields (`plan`, `planRenewsAt`,
   `isAdmin`, `manualAccessGrant`) come off `User` (see §2.3 — the PAT path
   reads the same fields).
4. Done = goal-set's check: a real captured Wasp cookie authenticates via
   `curl` (capture once from a logged-in local browser; document the
   capture in this file's §5 if needed).

## 2. F10b — PAT validation (CLI tokens)

### 2.1 Token lifecycle

- **Issue** (session-authed): Settings UI `POST /api/pat/issue`
  (`webapp/src/auth/patRoutes.ts:362-396`) or the CLI OAuth browser flow
  `POST /operations/mint-cli-token` (`webapp/src/auth/cliMint.ts:21-38`).
  Both: `generateToken()` → `aa_<base64url(32B)>`, store
  `hashToken(plaintext)` = SHA-256 hex, return plaintext **exactly once**.
  Row: `{ id: uuid, hashedToken, label, userId }`.
- **No expiry, full scope** — revocation is the safety valve
  (`webapp/src/auth/pat.ts:1-8`).
- **Revoke** = delete row (`patRoutes.ts:401-426`, tenancy-checked).
- **List** never returns the hash (`patRoutes.ts:431-445`).

### 2.2 The exact lookup the new API must replicate

`webapp/src/auth/patMiddleware.ts:70-180`, the whole request path:

1. `OPTIONS` → `204` passthrough (CORS preflight never auths).
2. Parse `Authorization: Bearer <token>` (case-insensitive,
   `/^Bearer\s+(.+)$/i`, `:60-64`). Absent/malformed →
   `401 {"error":"Missing or malformed bearer token."}`.
3. Fail fast shape check `looksLikeToken`: starts `aa_`, rest matches
   `[A-Za-z0-9_-]+` (`pat.ts:54-61`).
4. `hashed = sha256_hex(token)` → single round-trip join (prisma shape,
   `patMiddleware.ts:97-122`):

```sql
SELECT k.id            AS api_key_id,
       u.id            AS user_id,
       u.plan, u."planRenewsAt", u."isAdmin", u."manualAccessGrant", u."fullName",
       (SELECT i."providerUserId" FROM "AuthIdentity" i
         JOIN "Auth" a ON a.id = i."authId"
        WHERE a."userId" = u.id AND i."providerName" = 'email'
        LIMIT 1)       AS email
FROM "ApiKey" k
JOIN "User" u ON u.id = k."userId"
WHERE k."hashedToken" = encode(sha256($1::bytea), 'hex');
```

   In app terms: `ApiKey.findUnique({ where: { hashedToken } })` →
   `user(id, plan, planRenewsAt, isAdmin, manualAccessGrant, fullName)` →
   `user.auth.identities where providerName='email' take 1` → email.
5. No row → `401 {"error":"Invalid or revoked token."}` — deliberately the
   same response for wrong and revoked (no probing oracle), `:143-148`.
6. **Entitlement gate before every handler** (`:152-161`):
   `cliAccessViolation(user)` (`webapp/src/billing/entitlements.ts:62-124` —
   entitled iff `isAdmin` OR `manualAccessGrant` OR active PRO/FOUNDER plan)
   → `402 {"error":"<feature> is a Pro feature.","feature":…,"reason":…}`.
   This is plan-state re-checked per request: an old token stops working the
   moment a plan ends.
7. Stamp `ApiKey.lastUsedAt = now()` fire-and-forget (failure logged, never
   blocks the response), `:165-175`.
8. Attach the resolved user for handlers (admin routes additionally gate on
   `user.isAdmin` → 403 `{"error":"Admin only."}`,
   `patRoutes.ts:1776-1789`).

Timing-safe comparison: not a string compare — the inbound token is
re-hashed with deterministic SHA-256 and matched by unique index. This is
the documented GitHub/Stripe-style pattern and the reasoning in
`pat.ts:10-27` (argon2id's random salt would make hash-lookup impossible;
256-bit entropy makes a KDF pointless). Replicate as-is: hash → index
lookup. Do not introduce a constant-time compare of stored hashes — there
is nothing to compare; the digest is the key.

**Bearer-only enforcement:** the Wasp middleware config for `/api/cli/*`
deletes `sessionCookieAuth` + `sessionCookieWrite` and requires
`auth: false` on the route (`patMiddleware.ts:182-199`). The new API MUST
keep the same separation: cookie/session auth must never satisfy a
`/api/cli/*` route (both CLIs send `Authorization: Bearer aa_…` —
`cli/src/api.ts:40-48`, `admin-cli/src/api.ts:46`; token at
`~/.config/actionamp/config.json` / `~/.config/actionamp-admin/config.json`,
`cli/src/config.ts:22`, `admin-cli/src/config.ts:22`).

### 2.3 Implementation plan (F10b, est. ¼d)

1. Hono middleware `patAuth` mirroring §2.2 steps 1-8 verbatim, including
   the exact 401/402/403 JSON shapes (both CLIs key off 401 to say
   "Run: actionamp login" and off `feature` for 402 messaging —
   `cli/src/api.ts:57-76`).
2. `lastUsedAt` write-behind (don't await it in the hot path).
3. Done = goal-set's check: a PAT minted on Wasp authenticates against the
   new `/api/cli/*` surface (e.g. `whoami` shape parity:
   `{ user: { id, email, fullName, plan, isAdmin } }`,
   `patRoutes.ts:639-659`).

## 3. F10c — Test affordances

### 3.1 Session seeding (how e2e logs in)

A session row is all auth needs. Seed helper (dev/e2e only):

```sql
INSERT INTO "Session" (id, "expiresAt", "userId")
VALUES (
  '<40-char [a-z2-7] token, freshly generated>',   -- becomes the cookie/Bearer value
  now() + interval '30 days',
  (SELECT id FROM "Auth" WHERE "userId" = :userId) -- Auth id, NOT User id
);
```

Token generation for seeds = same algorithm as issuance (§4): 25 random
bytes → lowercase base32 (alphabet `abcdefghijklmnopqrstuvwxyz234567`),
no padding → exactly 40 chars. Then set cookie `wasp_session=<token>` (or
send `Authorization: Bearer <token>`) in the test client. Cover: valid,
expired (`expiresAt` past → 401 + row deleted), absent, garbage token
(no row → 401). The goal-set done condition: seed helper mints a working
session; expired/absent/invalid covered by tests.

### 3.2 `devEmail=` equivalent

Today (`webapp/src/auth/devAutologin.ts`, gated `NODE_ENV === "development"`
else 404, lines 20-24): `/login?devEmail=x@y.z` → client calls the
`prepareDevAutologin` op (lines 47-117), which creates-or-reuses the
`User` + `Auth` + email `AuthIdentity`, force-sets a known dev password
(`DEV_AUTOLOGIN_PASSWORD` env or `ActionAmpDevAutologin123!`, lines 8-9)
inside `providerData.hashedPassword` (scrypt, `salt:key` hex — Lucia's
Scrypt, N=16384 r=16 p=1 dkLen=64, `lucia/dist/crypto.js:29-43`), sets
`isEmailVerified: true` + `hasSeenOnboarding: true`, then the client logs
in through Wasp's normal email login → real `{sessionId}` response
(`webapp/src/auth/email/PasswordlessAuthPage.tsx:96-115`).

New-API equivalent (recommended, simpler): a dev-only endpoint
`POST /dev/login { email }` that creates-or-reuses the same
User/Auth/AuthIdentity rows and **returns a minted session token + sets the
`wasp_session` cookie directly** — no password plumbing at all. Keep:
- the `NODE_ENV=development` hard gate (404 otherwise, same as today);
- the `?devEmail=` UX on the new `/login`;
- `hasSeenOnboarding: true` and `isEmailVerified: true` semantics so
  onboarding gates don't fire mid-test;
- user-creation shape parity (fullName derived from the email local part,
  `devAutologin.ts:38-45`) so seeded rows are indistinguishable from real
  ones for downstream code.

### 3.3 CSRF stance (recommended)

What exists today: **no CSRF tokens anywhere** (Wasp default stack is
helmet/cors/logger/json/urlencoded/cookieParser —
`globalMiddleware.js:10-17`). Browser mutations ride the Bearer header
(CSRF-immune by construction); the cookie fallback is `httpOnly`,
`Secure` in prod, **`SameSite=Lax`**, `Path=/`, 30d
(`sessionCookie.ts:72-80`). Cross-origin credentialed fetch is allowed only
for the configured client origin (+ `https://actionamp.com` for anonymous
funnel posts) via credentials-CORS (`serverMiddleware.ts:55-72`).

Recommended stance for the new API — the goal-set's default, and it
validates cleanly against the CLIs:

1. **Cookie: keep `wasp_session`, `httpOnly`, `Secure` (prod),
   `SameSite=Lax`, `Path=/`, 30d maxAge.** Same name + attributes means
   existing browsers transition with zero cookie churn on switch day.
2. **Custom header required on cookie-authenticated state-changing
   requests** (POST/PUT/PATCH/DELETE): e.g. `X-Requested-With: XMLHttpRequest`
   (or a project header like `X-ActionAmp-Api: 1`). Cross-site attackers
   cannot attach custom headers without a CORS preflight the allowlist
   won't grant; same-origin fetch (the Svelte app, Playwright) always can.
   Keep GETs header-exempt — `<img src>`/navigation loads cannot set
   headers and are covered by `SameSite=Lax` + must-stay-side-effect-free.
3. **Bearer requests are exempt from CSRF checks entirely.** Both CLIs
   (`aa_` PATs) and the legacy header path never send cookies, so nothing
   about the header requirement touches them — verified against
   `cli/src/api.ts` and `admin-cli/src/api.ts` (fetch + Bearer, no cookie
   jar).
4. **`/api/cli/*` stays Bearer-only** (replicate the middleware-stack
   delete from `patMiddleware.ts:194-199`). A browser cookie must never
   drive a CLI route — that would re-open exactly the CSRF surface the
   custom header closes.
5. CORS for the new API: mirror the current policy (allowlist the client
   origin; `credentials: true`; no wildcard-with-credentials).

oRPC note: client transports let you set default headers centrally, so the
custom header is one line in the Svelte client setup; e2e helpers must send
it too (fold into the F10c seed helper).

## 4. Session ISSUANCE (S10, note-only)

What a Wasp-format session row requires, precisely from the installed code
(`lucia/dist/core.js:92-109`, `crypto.js:25-28`, adapter `setSession`,
Wasp wrapper `session.js:7-9`):

- **Token generation:** 25 random bytes (`crypto.getRandomValues`, i.e.
  CSPRNG; `crypto.randomBytes(25)` equivalent) → **RFC 4648 lowercase
  base32, no padding** (alphabet `abcdefghijklmnopqrstuvwxyz234567`) →
  exactly **40 chars**. Shape: `xxxx…(40 chars, [a-z2-7])`.
- **Hashing: none.** The encoded string is stored verbatim as `Session.id`
  and returned to the client as-is. The cookie value, the Bearer value, and
  the DB id are the same string. (Security implication, accepted today:
  DB-read ⇒ usable token. If the new stack later moves to hashed session
  ids, it must keep validating legacy verbatim rows — dual lookup — or
  force re-login, which defeats F10.)
- **Row:** `{ id: token, userId: <Auth.id>, expiresAt: now + 30d }` —
  `Session.userId` references the **Auth** id (the prisma call is
  `session.create({ data: { id, userId: authId, expiresAt } })`; Wasp
  resolves the authId from the logged-in identity first).
- **Lifetime:** 30d fixed (`TimeSpan(30,'d')` default, Wasp doesn't
  override — `core.js:26`). Renewal: past half-life, `expiresAt = now+30d`,
  **id never rotates** (a rotated id would desync the SPA's localStorage
  token mid-session).
- **Logout:** `DELETE FROM "Session" WHERE id = $1`
  (`invalidateSession`, `core.js:110-112`).
- **Login response shape:** `{ "sessionId": "<token>" }`
  (`responseSchemas.js` SessionResponseSchema). Cookie stamping is
  ActionAmp's layer on top (§1.1), not Wasp core — S10 replicates it via
  `Set-Cookie: wasp_session=<token>; HttpOnly; SameSite=Lax; Path=/;
  Max-Age=2592000` (+ `Secure` in prod).
- Email identity for new users (if S10 also registers): passwordless
  (magic-link) today — `MagicLoginChallenge` (`webapp/schema.prisma:132-144`,
  8 rows in dev: `codeHash`/`tokenHash` both SHA-256 hex, 6-digit code,
  attempts counter) and the password path exists only for the dev autologin.
  `providerData.hashedPassword` (when present) is scrypt `salt:key` hex.

## 5. DB verification snapshot (read-only, no token values)

Database `actionamp_dev` on localhost:5432, 2026-09-01. Structures via `\d`
match §1.3 and §2 exactly (`Session.id` text PK; `ApiKey.hashedToken` text
UNIQUE, all rows `^[0-9a-f]{64}$`; `Auth.userId` text NULL UNIQUE).

| Table | Rows | Notes |
|-------|------|-------|
| `Session` | 440 (190 unexpired) | 439× `^[a-z2-7]{40}$`; 1× 64-hex seeded outlier |
| `Auth` | 37 | 0 orphaned `userId` |
| `AuthIdentity` | 37 | all `providerName='email'` |
| `ApiKey` | 8 | hashes all 64-char lowercase hex |
| `MagicLoginChallenge` | 8 | out of F10 scope |
| `User` | 37 | id uuid text |

All 440 sessions join `Session → Auth → User` cleanly (no dangling rows).

## 6. Open questions

1. **Cookie name on switch day** — recommend keeping `wasp_session`
   verbatim (zero churn); alternative is a new name + dual-read window.
   Needs an explicit call before F10a lands.
2. **Bearer session-token parity** — should the new API also accept
   `Authorization: Bearer <session token>` (the legacy SPA path), or
   cookie-only? Recommend accepting both during the bridge; cost is nil
   (same lookup).
3. **Hardening the verbatim-token storage** — Session ids in the DB are
   usable credentials. Options: dual lookup (new hashed tokens, legacy
   verbatim), or keep verbatim for full Wasp interop. Decide before S10;
   F10a is unaffected either way.
4. **The 64-hex session outlier** — almost certainly a manually seeded
   test row; exact-match lookup handles it, but confirm and delete if
   stray before switch day (housekeeping, not blocking).
5. **MagicLoginChallenge surface** — F10 ignores it; S10's passwordless
   flow needs a decision (reuse the table/hash scheme or new design).
6. **`onAfterLogin` / login-activity parity** — Wasp hook
   (`webapp/src/auth/hooks.ts`, `loginActivity.ts`) records login events;
   decide whether the new login path replicates it (analytics continuity).
7. **Cookie `Domain` widening in prod** — today the client mirrors a
   non-httpOnly `wasp_session` with `Domain=<apex>` for cross-subdomain
   `<img>` loads (`sessionCookieMirror.ts:40-81`). If the new deployment
   keeps app/api on separate subdomains, S10 needs the same domain-wide
   cookie (or same-origin deployment, which retires the mirror entirely).
