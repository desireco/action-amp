---
id: cli-pat-plumbing
kind: spec
title: "CLI auth + PAT backend plumbing (Phase 0 of the CLI effort)"
status: review
priority: P3              # opportunistic, not validation-critical
feature: cli
spec_owner: discover
build_owner: build
parent: cli.md            # umbrella spec; this is the first deployable slice
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsUt      # sync-managed (write-once)
gh_synced_at: 2026-07-22T00:16:31Z
---

# Spec: CLI PAT plumbing (Phase 0)

> **First of three specs split out of `cli.md` 2026-07-03.** This is the only
> backend slice; everything else in the CLI effort is frontend (`cli-package`)
> + agent skills (`cli-skills`). It is **genuinely `ready`** on its own —
> self-contained, well-scoped, and the natural first pull.

## Summary

Add **Personal Access Tokens** to the backend: an `ApiKey` Prisma model, three
session-authed `api` routes to issue/revoke/list tokens from the Settings UI,
Bearer-auth middleware that resolves a PAT to a `User`, and the Settings UI
section to manage tokens. **No CLI code, no skill code, no op-refactor in this
spec** — those are the next two. This spec ships only the auth layer the rest
of the CLI effort depends on.

## Why

PATs (not the user's password, not a browser session cookie) are the auth model
because the existing session token can expire and because no one should paste
their account password into a CLI. The token is issued from the web UI and
pasted once. Issuing + revoking + the auth middleware are prerequisites for
*any* CLI command — so they ship first, as a unit that's valuable and
verifiable on its own (a user can create a token and hit a stub endpoint with
it), independent of the CLI package's schedule.

## Decisions locked

- **PAT transport = Option A (authed `api` routes).** Custom middleware reads
  `Authorization: Bearer <token>`, hashes it, looks up `ApiKey` by
  `hashedToken`, stamps `lastUsedAt`, resolves the `User`. Missing/revoked/
  wrong token → 401. Follows the Stripe-webhook precedent (`billing/webhook.ts`
  + `main.wasp.ts:168`). *Rejected: Option B (mint a Wasp session from the
  PAT, reuse stock `/operations/*`) — couples to Wasp session internals,
  fragile across upgrades.*
- **Tokens stored hashed, plaintext shown once.** Reuse the hashing already
  used by `webapp/scripts/create-verified-user.mjs` (`@wasp.sh/lib-auth/node`).
- **Full-scope, non-expiring v1 tokens.** Scoping and `expiresAt` are deferred
  to later specs if churn/abuse warrants. Revocation is the safety valve.

## Done-conditions

- [ ] **`ApiKey` model + migration.** `wasp db migrate-dev --name add-api-keys`
      applies clean; model exists in the generated Prisma client (fields: `id`,
      `createdAt`, `lastUsedAt`, `label`, `hashedToken @unique`, `userId`).
      `User.apiKeys ApiKey[]` added. `onDelete: Cascade` so deleting a user
      deletes their tokens.
- [ ] **`POST /api/pat/issue`** (session-authed) — generates a random token,
      returns the plaintext **once**, stores only its hash. Body takes `label`.
- [ ] **`POST /api/pat/revoke`** (session-authed) — delete an `ApiKey` by id.
      Tenancy-safe (the id must belong to `context.user.id`).
- [ ] **`GET /api/pat/list`** (session-authed) — list the user's keys (`id`,
      `label`, `createdAt`, `lastUsedAt`). **Never** the hash.
- [ ] **PAT middleware** — reads `Authorization: Bearer <token>`, hashes, looks
      up, stamps `lastUsedAt`, resolves `User` onto the request context.
      Missing/revoked/wrong → 401. Modeled on `billing/webhookMiddleware.ts`.
- [ ] **A stub `/api/cli/now` route** is wired behind the PAT middleware and
      calls the existing `getTopTask` logic directly (no op-refactor yet — see
      cli-package for the refactor; this stub just proves auth end-to-end and
      is replaced when cli-package ships). A valid PAT returns the user's top
      task JSON; an invalid token returns 401.
- [ ] **Settings UI** — a "Personal Access Tokens" section (in `SettingsPage`
      or a new `/app/settings/pat` route): create (label input → issue → show
      plaintext once with a copy affordance + "won't be shown again" warning),
      list (label + last-used, no hash), revoke (per-row delete).
- [ ] **End-to-end auth verified:** from the UI, create a token → copy it →
      `curl -H "Authorization: Bearer <token>" <api>/api/cli/now` returns the
      user's top task; revoke it → same curl returns 401.
- [ ] **`wasp compile` passes; existing suite green.**
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No `cli/` package.** That's `cli-package`. This spec is backend + Settings
  UI only.
- **No orchestration skills.** That's `cli-skills`.
- **No op-refactor** (factoring pure functions out of `operations.ts` for
  reuse). The stub route calls the existing op directly; the refactor lands
  with `cli-package`, where every op needs it.
- **No `expiresAt` / scopes.** Deferred.
- **No rate limiting.** Out of scope for v1; defer.
- **No token rotation flow.** Revoke + re-issue is the rotation path.

## Open questions

- **Settings UI placement.** New route `/app/settings/pat` vs a section in the
  existing `SettingsPage`. Lean: section in `SettingsPage` (less nav clutter,
  fewer routes). Build picks; note the choice.
- **Token entropy / format.** Random opaque string vs a prefixed `aa_`-style
  token (helps grep/scan). Lean: prefixed (`aa_<random>`), makes "this is an
  ActionAmp token" obvious in logs and secret scanners.

## Prototypes

_(none — a Settings section + three routes; reuse existing Settings +
BottomSheet patterns. The "show plaintext once" affordance mirrors how Stripe
publishable keys are shown.)_

## Dependencies

- None. This is the prerequisite for `cli-package` and `cli-skills`.
