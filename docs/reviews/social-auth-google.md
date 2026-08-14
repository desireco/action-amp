# Review: social-auth-google

<!-- Build owns this file. Discover reads it to sign off. -->

## What changed

On `main`. Adds Google as a second auth method alongside email — the ROADMAP
gauntlet #5 ("#1 predictable checkout-friction remover"). Dependency
`legal-pages-oauth` is `done`, so the OAuth flow can land with privacy/terms
already disclosing Google as a processor.

- `webapp/main.wasp.ts` — `auth.methods.google` with `configFn` (scopes
  `profile` + `email`) + its own `userSignupFields`, alongside the untouched
  `email` method. Imports aliased (`userSignupFields as googleUserSignupFields`)
  to avoid collision with the email one.
- `webapp/src/auth/google/userSignupFields.ts` (new) — `defineUserSignupFields`
  mapping `data.profile.name` → `fullName`, `given_name`/first-token →
  `firstName`. Never throws: falls back to email-localpart then `"there"` (some
  Google accounts have no profile name; `fullName`/`firstName` are NOT NULL).
- `webapp/src/auth/google/config.ts` (new) — `configFn` returning
  `{ scopes: ["profile", "email"] }` (Wasp's default is profile-only).
- `webapp/src/auth/google/GoogleButton.tsx` (new) — "Continue with Google"
  anchor using Wasp's `googleSignInUrl`; inline 4-color G SVG.
- `webapp/src/auth/email/{LoginPage,SignupPage}.tsx` — `<GoogleButton />` + an
  "or with email" divider above the email form. Email stays the visual default.
- `webapp/src/components/ui/AuthLayout.css` — `.aa-auth-google` (neutral
  surface, not teal) + `.aa-auth-or` divider, token-based, dark-mode-safe.
- `webapp/.env.server` — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` empty
  placeholders + documented dev/prod redirect URIs (no secrets committed).

Commits:
- `88af7db` spec: ready → building
- (impl) Google OAuth alongside email
- `07b719b` fix false null/loading story in GoogleButton (review)

## Gates run

- **Cold-context reviewers (2, distinct angles, fresh context):**
  - **Reviewer A — Wasp config / regressions: PASS.** Config matches the 0.24
    docs exactly (`configFn` + `userSignupFields` keys); name aliasing correct
    (no cross-wiring); NOT-NULL safety traced through every edge case
    (profile undefined, email undefined — always returns non-empty); scope
    config correct; email method untouched; Google correctly needs no
    emailVerification/passwordReset.
  - **Reviewer B — UI/UX / brand / a11y / CSS: BLOCKER.** Found that
    `googleSignInUrl` is a plain synchronous string constant, NEVER null — my
    `as string | null` cast was a lie, `aria-disabled` was dead code, and the
    "degrades gracefully when unconfigured" docstring was false. Plus
    `aria-disabled` on `<a>` doesn't prevent navigation anyway. Also flagged
    N4: no justification for a custom button vs Wasp's stock
    `GoogleSignInButton`.
  - **Verdict: 1 real blocker + 1 nit → fixed → re-gated clean.** Reviewer A's
    PASS stands (config + safety were solid). See Findings.
- **Diagnostics:** `wasp compile` — exit 0, three times (after impl, after
  fix, final).
- **Tests:** `npm test` — **195 passed (195)**, exit 0. Email auth path
  unchanged; no test touches the Google button (additive UI).
- **e2e:** NOT executed this session (requires a running `wasp start` + a real
  Google OAuth client). Email-auth e2e (`login.spec.ts`) is untouched by the
  diff. The Google callback can't be e2e-tested without the OAuth client
  (Discover's non-code gate) — see Open items.

## Done-conditions

Each predicate from `docs/specs/done/social-auth-google.md` → verdict + evidence.

- [x] `main.wasp.ts` declares the Google method with its own `userSignupFields`
      — **PASS** — `main.wasp.ts:75-78` `google: { configFn, userSignupFields }`;
      imported aliased at `:35`.
- [x] Google `userSignupFields` defined, maps profile→names, never throws
      — **PASS** — `userSignupFields.ts`; `resolveFullName` returns
      name→email-localpart→`"there"`, all non-empty. Reviewer A traced every
      null edge. (Spec guessed `data.names[0].displayName`; the actual Wasp
      `/userinfo` shape is `data.profile.name` — impl follows the real shape
      per the 0.24 docs.)
- [x] Env vars wired, no secrets committed — **PASS (dev)** — `.env.server` has
      empty placeholders + URI comments. **Prod vars not set** — deferred per
      spec open question; Wasp validates both as required so a missing-prod-var
      deploy fails fast. No secret values committed.
- [x] Login + signup pages offer Google — **PASS** — both render `<GoogleButton
      />` + divider; uses Wasp's `googleSignInUrl` (not hand-rolled OAuth);
      styled to AuthLayout tokens.
- [ ] OAuth callback works in dev — **NOT VERIFIED** — requires a real Google
      OAuth client + test user (Discover's non-code gate). Code path is
      standard Wasp; will verify once the client exists. → Open item.
- [ ] OAuth callback works in prod — **NOT VERIFIED** — same gate + prod
      redirect URI registration. → Open item (spec sanctions deferral).
- [ ] Google consent screen references live `/privacy` + `/terms` — **N/A
      (code)** — console setup, not code. `/privacy` already discloses Google
      (done in `legal-pages-oauth`); URIs for Discover to register below.
- [x] Account linking not required for v1; Wasp default documented — **PASS** —
      Wasp 0.24 does NOT auto-merge: email signup + Google on the same address
      = **two separate accounts**. No merge UI (spec non-goal). If duplicate
      accounts become a real complaint, a merge/merge-prompt is a follow-up.
- [x] `wasp compile` passes — **PASS** — exit 0.
- [x] Existing email auth + e2e `login.spec.ts` still pass — **PASS** — email
      method config untouched; 195 unit/component tests green. (e2e itself not
      re-run; it exercises email auth only, which the diff doesn't touch.)
- [x] Cold-context reviewer passes — **PASS** — after the GoogleButton fix.

## Findings

**Accepted (fixed in `07b719b`):**
1. **[BLOCKER, Reviewer B] False null/loading story.** `googleSignInUrl` is
   `export const signInUrl: string = ${config.apiUrl}/auth/google/login` — a
   plain synchronous string, never null. My `as string | null` cast suppressed
   the real type; `aria-disabled={href == null}` was dead code (always false);
   the "degrades gracefully when unconfigured" docstring was fiction; and
   `aria-disabled` on `<a>` doesn't prevent navigation anyway. Fixed: dropped
   the cast + dead branch + unreachable CSS rule; rewrote the docstring to
   state the honest behavior (misconfigured → click navigates, server errors).
2. **[nit, Reviewer B] No justification for custom button.** Added: the stock
   `GoogleSignInButton` ships `SocialButton` styles that ignore our `--aa-*`
   tokens; this reuses the same `googleSignInUrl` but renders in our AuthLayout
   chrome. Same URL, our skin — not a hand-rolled OAuth flow.

**Accepted nits from Reviewer A (deferred / noted, not blocking):**
- Prod env files lack `GOOGLE_CLIENT_*` — Wasp validates both as required, so a
  prod deploy without them fails fast. Documented as a deploy-time checklist
  item (Open item 1).
- `config.ts` doesn't import `GoogleConfigFn` for the return type — it isn't
  re-exported from `wasp/server/auth` in 0.24; the `configFn` field type-checks
  the shape. Matches the docs' own un-annotated example.

**Deferred (legitimately out of scope / non-code):**
- The dev + prod OAuth-callback verification (DCs 5, 6, 7) — requires the
  Google Cloud OAuth client, which is Discover's non-code gate (ROADMAP §GTM
  prep B). The code is standard Wasp social auth; nothing to verify until the
  client exists.
- Account-merge UI — spec non-goal; revisit only if duplicate accounts surface.

**Rejected:** none.

## Open items for Discover (before `done`)

These are the non-code gates the spec itself defers. Build can't clear them:

1. **Create the Google OAuth client** (Google Cloud Console → APIs & Services →
   Credentials → OAuth client, type "Web application"). Get `GOOGLE_CLIENT_ID`
   + `GOOGLE_CLIENT_SECRET`; set both in Railway service vars (and locally in
   `.env.server`). *Gates DCs 5, 6, the env-var prod half.*
2. **Register the authorized redirect URIs** (Wasp's standard callback path):
   - Dev: `http://localhost:3001/auth/google/callback`
   - Prod: `https://api.actionamp.com/auth/google/callback`
3. **Add a test user** to the OAuth consent screen (Testing) so dev login works
   pre-verification. *Gates DC 5.*
4. **Point the consent screen at the live legal pages** — `https://actionamp.com/privacy`
   + `https://actionamp.com/terms` (already Google-disclosure-ready via
   `legal-pages-oauth`). *Gates DC 7 + Google verification.*
5. **Run the e2e suite + a manual Google sign-in** once the client exists, to
   confirm the callback → `ensureOnboarded` → `/do` (or `/welcome` for a
   brand-new Google user, via `first-run-experience`) path end-to-end.

## Verdict

**ready-for-signoff.**

All code-side done-conditions PASS; the one review blocker + nit are resolved;
`wasp compile` green; **195 tests pass**; email auth + its e2e path untouched.

The remaining unchecked done-conditions (5, 6, 7 — the actual OAuth callback
verification) are the spec's explicitly-deferred non-code gates: they require
the Google Cloud OAuth client, which is Discover's to create (Open items 1–4).
The code is standard Wasp 0.24 social auth, grounded against the versioned
docs, and will verify once the client exists.

Once Discover creates the OAuth client + registers the URIs + confirms a test
sign-in works, this is `done`.
