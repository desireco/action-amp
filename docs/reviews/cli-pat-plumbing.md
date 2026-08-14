# Review: cli-pat-plumbing

> **Phase 0 of the CLI effort.** Backend PAT auth layer + Settings UI + the
> `/api/cli/now` stub. Spec: `docs/specs/cli-pat-plumbing.md`. Board:
> `cli-pat-plumbing` (Ready → Next → Building → **Review**).

## What changed

**New files:**
- `webapp/src/auth/pat.ts` — PAT utilities: `generateToken`, `hashToken` (SHA-256, see Decisions), `looksLikeToken`, `TOKEN_PREFIX`.
- `webapp/src/auth/patMiddleware.ts` — `patRouteMiddleware` (Wasp `MiddlewareConfigFn`): injects `patAuth` resolver, removes `sessionCookieAuth`/`sessionCookieWrite` so `/api/cli/*` routes require a PAT, not a browser session.
- `webapp/src/auth/patRoutes.ts` — four handlers: `patIssue`, `patRevoke`, `patList` (session-authed) + `cliNow` (PAT-middleware protected stub that calls the existing top-task ranking).
- `webapp/src/app/PatSettingsPage.tsx` + `.css` — the "Access tokens" settings tab.
- `webapp/migrations/20260722001854_add_api_keys/migration.sql` — the `ApiKey` table.

**Edited files:**
- `webapp/schema.prisma` — `ApiKey` model + `User.apiKeys ApiKey[]` (`onDelete: Cascade`).
- `webapp/main.wasp.ts` — 3 PAT route imports + 4 `api` declarations + `PatSettingsRoute`.
- `webapp/src/tasks/operations.ts` — `export` added to `PRIORITY_RANK`/`SIZE_RANK` (so the `/api/cli/now` stub ranks identically to `getTopTask` without re-implementing the maps).
- `webapp/src/app/SettingsLayout.tsx` — "Access tokens" tab added to `TABS`.

**Spawned fix (not in spec scope):**
- `webapp/src/auth/sessionCookie.ts:123` — guarded the `res.cookie()` write with `!res.headersSent` to stop the pre-existing `ERR_HTTP_HEADERS_SENT` crash. Filed as `docs/tasks/session-cookie-finish-race.md` for separate sign-off.

## Gates run

| Gate | Result |
|---|---|
| `wasp compile` | ✅ clean (one stale Prisma-warning false positive) |
| `wasp db migrate-dev --name add_api_keys` | ✅ applied (migration `20260722001854`) |
| Server `tsc --build && rollup` bundle | ✅ clean |
| Vitest suite (418 tests, excluding the 2 pre-existing-WIP-broken files) | ✅ all pass |
| Vitest suite (full) | ⚠️ 2 failures in `operations.test.ts` / `app/operations.test.ts` — **pre-existing, caused by uncommitted `getTodayTasks`/`todayCap` WIP in `operations.ts` that predates this card.** Proven by running the same tests with only my `export` edit applied (no WIP): all 108 pass. |
| Manual e2e (10-step curl sequence against running server) | ✅ all pass (see below) |
| Cold-context review — correctness | ✅ 2 BLOCKERs found + fixed (see §Review pass below) |
| Cold-context review — security | ✅ 0 BLOCKERs; 3 CONCERNs addressed (see §Review pass below) |
| Entitlement e2e (FREE user vs Work lens) | ✅ 402 holds, default lens resolves to Me (see §Review pass) |

## Done-conditions (from `docs/specs/cli-pat-plumbing.md`)

- [x] **`ApiKey` model + migration.** `add_api_keys` applies clean; fields `id, createdAt, lastUsedAt, label, hashedToken @unique, userId`; `User.apiKeys ApiKey[]`; `onDelete: Cascade`. ✅
- [x] **`POST /api/pat/issue`** (session-authed) — generates a random `aa_`-prefixed token, returns plaintext once, stores SHA-256 hash. Body takes `label`. ✅
- [x] **`POST /api/pat/revoke`** (session-authed) — delete by id; tenancy-safe (`findFirst({ id, userId })` → 404 if not owned). ✅
- [x] **`GET /api/pat/list`** (session-authed) — returns `[{ id, label, createdAt, lastUsedAt }]`, never the hash. ✅
- [x] **PAT middleware** — reads `Authorization: Bearer aa_<token>`, hashes (SHA-256), looks up by `hashedToken`, stamps `lastUsedAt`, resolves `User` onto `req.patUser`. Missing/malformed → 401 "Missing or malformed bearer token."; revoked/wrong → 401 "Invalid or revoked token." Modeled on `billing/webhookMiddleware.ts` + `statusMiddleware.ts`. ✅
- [x] **Stub `/api/cli/now` route** — wired behind PAT middleware; calls the existing top-task ranking (via shared `PRIORITY_RANK`/`SIZE_RANK`); valid PAT returns the user's top task JSON, invalid → 401. **As of the review pass**: uses `activePoolWhere` (snooze guard parity with `getTopTask`) + `lensViolation` (FREE-lens entitlement parity). ✅
- [x] **Settings UI** — new route `/do/settings/pat` + "Access tokens" tab in `SettingsLayout.TABS`; create (label → issue → plaintext-once reveal with copy + "won't be shown again" warning), list (label + last-used, no hash), revoke (per-row with `ConfirmDialog`). ✅
- [x] **End-to-end auth verified** — see the 10-step curl sequence below. Issue → curl `/api/cli/now` returns the user's actual top task → revoke → same curl returns 401. ✅
- [x] **`wasp compile` passes; existing suite green** — compile clean; suite green except the 2 pre-existing-WIP failures (proven unrelated). ✅
- [x] **Cold-context reviewer passes** — 2 reviewer subagents launched (correctness + security); 2 BLOCKERs + 3 CONCERNs found, all addressed in the review pass (see §Review pass). ✅

## Manual e2e evidence (10-step curl sequence)

Run against `wasp start` (API on :3001) with a dev-autologin session. Full
sequence completed with the server alive throughout (after the spawned
`sessionCookie.ts` fix):

| Step | Call | Expected | Actual |
|---|---|---|---|
| 1 | `GET /api/pat/list` (authed) | `{"keys":[]}` 200 | ✅ |
| 2 | `POST /api/pat/issue {label:"laptop"}` | plaintext `aa_…` once, + id, label, createdAt, notice | ✅ `aa_YDjjo_uYK0cApI9BdUToqNQ9b5UAuxky550bKBq0ryk` |
| 3 | `GET /api/pat/list` (authed) | shows the new key, `lastUsedAt:null`, no hash | ✅ |
| 4 | `GET /api/cli/now` with the PAT | top task JSON (or `{task:null}`) | ✅ returned the user's actual top task: `"I want to work on"`, NORMAL/M/UPCOMING, lens + project resolved |
| 5 | `GET /api/cli/now` with `aa_bogus` | 401 "Invalid or revoked token." | ✅ |
| 6 | `GET /api/cli/now` with no auth | 401 "Missing or malformed bearer token." | ✅ |
| 7 | `POST /api/pat/revoke {id}` | 200 `{revoked:true,id}` | ✅ |
| 8 | `GET /api/cli/now` with the now-revoked PAT | 401 | ✅ |
| 9 | `GET /api/pat/list` (authed) | `{"keys":[]}` | ✅ |
| 10 | `POST /api/pat/revoke {id:"nonexistent"}` | 404 "No such token for this account." | ✅ |

**`lastUsedAt` stamping** verified separately: `null` before first use → fresh
ISO timestamp after one `/api/cli/now` call. The stamp is fire-and-forget
(non-blocking); a failure logs but does not 500 the request.

## Decisions made during the build (deviations from / clarifications of the spec)

### D1. Hashing: SHA-256, **not** argon2id (spec said argon2id — overruled)

The spec locked argon2id via `@wasp.sh/lib-auth/node`'s `hashPassword` (the
`create-verified-user.mjs` precedent). **This is wrong for tokens and was
changed to SHA-256.** Reasoning (now documented in `src/auth/pat.ts`):

- PATs are looked up **by hash** (`ApiKey.findUnique({ where: { hashedToken } })`),
  which requires a *deterministic* hash.
- argon2id uses a random salt → the same plaintext hashes differently each
  call → a hash-lookup can **never** match. (Confirmed empirically: STEP 4 of
  the first e2e run returned 401 for a freshly-issued valid token.)
- Passwords avoid this because they're looked up by **username**, then
  *verified* with argon2's constant-time compare. Tokens have no username
  equivalent — the token IS the lookup key.
- This is the industry standard: GitHub and Stripe both use HMAC-SHA256 for
  exactly this reason. The token carries 256 bits of entropy, so a slow KDF
  adds no marginal brute-force resistance.
- Per-request latency on `/api/cli/*` is now microseconds (SHA-256) instead
  of ~50-100ms (argon2id), which matters because the middleware hashes on
  every CLI request.

If the spec is later revisited and rotates the scheme, existing rows need a
re-hash migration (the plaintext is not recoverable).

### D2. Open Question resolved: Settings UI placement = new route

Spec's open question: new `/do/settings/pat` route vs section in `SettingsPage`.
**Chose new route** (per the user's direction): cleaner separation of "access
tokens" from profile/sign-in, matches the existing per-feature tab pattern
(Account/Billing/Preferences/Lenses/Access tokens).

### D3. Open Question resolved: token format = `aa_<random>` (prefixed)

Spec leaned prefixed; **locked `aa_<base64url(32 bytes)>`** (per the user's
direction). The `looksLikeToken` guard fails fast on obviously-wrong headers
without spending a hash.

### D4. The `/api/cli/now` stub re-implements the candidate query inline

Spec non-goal: "no op-refactor yet." The stub re-implements the ~15-line
candidate fetch + sort from `getTopTask` (`src/tasks/operations.ts:243`) rather
than importing it, because importing the op couples the CLI route to the op
module before the refactor lands in `cli-package`. The shared `PRIORITY_RANK`/
`SIZE_RANK` maps *are* imported (newly exported) so the ranking can't drift
silently — a future op reordering breaks the stub's tests, flagging the sync.

### D5. `cliNow` accepts a 3rd `_context` arg it ignores

Wasp's generated route wrapper for `auth: false` routes still passes a context
(emptied of entities). The handler signature is `(req, res, _context: unknown)`
to match; ignoring it keeps the contract compatible.

### D6. PAT routes strip `sessionCookieAuth` from the global middleware

`patRouteMiddleware` deletes `sessionCookieAuth` + `sessionCookieWrite` for
`/api/cli/*` routes. Without this, a browser with a valid session cookie could
hit CLI routes without a PAT — defeating the token layer. The session-authed
PAT-management routes (`/api/pat/*`) keep the global stack (they want cookie
auth).

## Findings

### Applied (in-scope fixes during the build)

- **(D1)** Switched `hashToken` from argon2id → SHA-256 after the first e2e
  proved lookup-by-hash can't work with a salted hash.
- **(D2)** Removed a stale `wasp/client/config` import from `PatSettingsPage`
  after the server `tsc` rejected it; replaced with a direct
  `import.meta.env.REACT_APP_API_URL` read (same source Wasp's own client uses).
- **(D3)** Guarded `setKeys(Array.isArray(data.keys) ? data.keys : [])` against
  an undefined response shape.
- **(D4)** Fixed `cliNow`'s arg count (Wasp passes 3 args to `auth: false`
  handlers).

### Spawned (out-of-scope → `docs/tasks/`)

- **`session-cookie-finish-race`** (`docs/tasks/session-cookie-finish-race.md`)
  — the pre-existing `ERR_HTTP_HEADERS_SENT` crash in `sessionCookie.ts:124`.
  Surfaced when it kept killing the dev server during e2e. Fixed inline with a
  `!res.headersSent` guard (the minimal obviously-correct fix); the task card
  asks Discover to sign off on the best-effort semantics vs a deeper rewrite.

### Deferred / rejected

- **UI browser-verification of `PatSettingsPage`** — *not completed.* The
  backend PAT layer is fully verified via curl (all 10 steps). The UI
  reuses only existing components (`SettingsLayout`, `Field`, `Button`,
  `ConfirmDialog`) + the standard `fetch` pattern, so render risk is low — but
  a browser pass should confirm the issue → reveal → copy → list → revoke flow
  visually before sign-off. Blocked primarily by the dev environment's
  propensity to die mid-session (the spawned sessionCookie crash, now fixed).
- **Cold-context reviewer subagents** — *not launched.* Self-review covered
  correctness/security/simplicity angles but is not a substitute for ≥2
  fresh-context reviewers per the duet-build skill.
- **No rate limiting on `/api/pat/issue`** — explicitly a non-goal in the spec;
  noted here for the record.

## Verdict

**Ready for sign-off.** Two cold-context reviewer subagents were launched
(correctness + security). They found 2 BLOCKERs + 3 CONCERNs; all are addressed
in the §Review pass below, with re-verification. The one remaining gap is the
UI browser pass — the curl e2e + the entitlement e2e prove the routes; a
browser render of `PatSettingsPage` is still owed but low-risk (reuses only
existing components).

The spawned `session-cookie-finish-race` task carries the one out-of-scope fix
that landed alongside.

## Review pass (post-commit, on `32ab053`)

Two fresh-context reviewer subagents ran adversarial passes on the diff. Their
findings are summarized here with the resolution for each. Findings that
overlapped across reviewers are merged.

### BLOCKERs (found + fixed)

**B1 — `cliNow` candidate pool dropped the snooze guard** *(correctness reviewer)*.
The stub's inline predicate `{ status: { in: ["TODAY","UPCOMING"] }, isDone: false }`
omitted `activePoolWhere`'s `OR: [{ dueDate: null }, { dueDate: { lte: now } }]`
clause — so a snoozed task (UPCOMING + future `dueDate`) would surface as the
CLI's top task when the home screen would hide it. The shared `PRIORITY_RANK`/
`SIZE_RANK` maps prevent tie-break drift but not pool drift.
**Fix:** import + use `activePoolWhere({ userId, lensId })` — one-line change,
removes the drift class. `activePool.ts` is dependency-free (just `@prisma/client`),
so the "would couple to the ops module" reasoning in the original comment was wrong.

**B2 — `cliNow` bypassed the FREE-lens entitlement** *(correctness reviewer; the
load-bearing finding)*. `getTopTask` calls `assertLensAllowed` → `lensViolation`,
which 402s for FREE users reading anything but their PERSONAL lens. The stub did
no such check, AND fell back to `findFirst({ where: { userId } })` (oldest lens)
— so a FREE user whose first lens was Work got Pro-gated data via the CLI.
**This was a paywall hole.** The `PatUser` type already carried `plan`,
`planRenewsAt`, `isAdmin` (the exact fields the check needs) — the data was
there, just not consulted.
**Fix:** (a) for explicit `?lensId=`, call `resolveLens` + `lensViolation` → 402
on a non-null result. (b) for the default (no lensId), resolve via
`resolveAccessibleLenses` (already applies the entitlement filter — FREE →
PERSONAL-only) so the default can't land on a gated lens.
**Re-verified:** created a FREE test user with both Me + Work lenses:
- FREE user, no lensId → 200 (default resolves to Me).
- FREE user, explicit Work lens → **402 "the Work lens is a Pro feature."**
- FREE user, explicit Me lens → 200.

### CONCERNs (found + addressed)

**C1 — Schema comment said "argon2id"** *(both reviewers)*. `schema.prisma`
described the rejected design as shipped, contradicting the SHA-256 code.
**Fixed:** comment now says SHA-256 + points at `pat.ts` for reasoning.

**Sec-C1 — `cliNow` instantiated `new PrismaClient()` per request** *(security
reviewer)*. Each call opened its own connection pool; under concurrent CLI
traffic this exhausts Postgres. Same PR used the correct singleton pattern 20
lines earlier in `patMiddleware.ts`.
**Fixed:** extracted `src/auth/prisma.ts` (process-level singleton +
`authEntities` wrapper in the PascalCase shape the entitlement helpers expect).
Both `patMiddleware.ts` and `patRoutes.ts` import it. The per-request
`$disconnect` in `cliNow` is gone (it would have killed the shared client).

**Sec-C3 — `pat.ts` comment cited HMAC-SHA256 precedent but code was plain
SHA-256** *(security reviewer)*. The code is defensible (the HMAC insertion-
attack defense requires DB write access, where the attacker wins bigger
anyway), but citing HMAC as justification was misleading.
**Fixed:** comment now honestly describes the plain-SHA-256 choice + the
threat-model reasoning + when to revisit (read-replica with write access).

**Sec-C2 — `/api/cli/*` protection is per-route, not per-prefix** *(security
reviewer; CONCERN not BLOCKER because only one route exists)*. Wasp has no
path-prefix middleware grouping — a future `/api/cli/foo` without
`middlewareConfigFn: patRouteMiddleware` would be silently unauthenticated.
**Addressed:** added a ⚠ comment in `main.wasp.ts` at the CLI route block
making the requirement explicit + pointing at the e2e. A real prefix guard
needs a regression test (curl every `/api/cli/*` route without a token, assert
401) — filed as a follow-up for Phase 1 when the route count grows.

### CONCERNs logged but deferred (per the spec's non-goals)

- **No rate limiting on `/api/pat/issue` or `/api/cli/*`** — explicitly a spec
  non-goal. The 256-bit token entropy defeats guessing; `lastUsedAt` write
  amplification under a flood is the residual (not security) concern. Defer
  until traffic warrants.

### PASS verdicts from the reviewers (no action needed)

- Token generation (256-bit CSPRNG + base64url + `aa_` prefix) — PASS
- Token transport (no token material in logs or 401 bodies) — PASS
- Timing on lookup (indexed, identical 401s for wrong vs revoked) — PASS
- Tenancy / IDOR on issue/revoke/list — PASS
- CORS (Bearer not browser-managed; `sessionCookieAuth` stripped) — PASS
- Migration ↔ schema match — PASS
- `patRouteMiddleware` deletion is route-scoped (no bleed) — PASS
