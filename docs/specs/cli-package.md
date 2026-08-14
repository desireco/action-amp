---
id: cli-package
kind: spec
title: "CLI package + op refactor (Phase 1 of the CLI effort)"
status: done
priority: P3
feature: cli
spec_owner: discover
build_owner: build
parent: cli.md
depends_on: cli-pat-plumbing.md
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsTx      # sync-managed (write-once)
gh_synced_at: 2026-07-22T03:18:14Z
---

# Spec: CLI package (Phase 1)

> **Second of three specs split out of `cli.md` 2026-07-03.** `ready` as of
> 2026-07-22 — Open Questions 1 (op-refactor scope) + 2 (lens scoping) resolved
> by the Phase 0 Discover pass; see "Op refactor — decision table" below.

## Summary

Build the top-level `cli/` package: a typed library + thin binary that talks to
the ActionAmp HTTP API via the PAT middleware shipped in `cli-pat-plumbing`.
Headline command `actionamp now` (print the next task that matters); around it,
the read + write commands the backend already exposes — start/pause/complete,
move between Today/Upcoming/Someday, capture + triage, browse/create projects +
goals, logbook. Every command emits a stable, documented `--json` shape (the
contract the skills in `cli-skills` depend on).

## Why

A focus app whose thesis is "decision, not capture" is a natural fit for a
terminal: the single-task answer should be reachable without opening a browser
tab, and the loop (capture → triage → start → done) is short enough to live on
the command line. The CLI is also the **machine interface** for orchestration
skills (`cli-skills`) — they need a typed, scriptable surface with stable
`--json` output.

## Decisions locked

- **Location → new top-level `cli/`** (sibling of `docs/` and `webapp/`).
  Standalone `package.json` + `tsconfig`; mirrors the repo's two-part framing.
- **Stack:** `commander` (arg parsing), native `fetch` (Node 22+), `chalk` /
  `cli-truncate` for human output, `vitest` + `msw` for tests. ESM, TypeScript
  5.9, `tsc` build. **`tsc` is correct here** — outside Wasp's build graph.
- **Type sourcing:** `cli/src/types.ts` does an `export type *` from
  `wasp/client/operations` (path-mapped to `webapp/.wasp/out/sdk/...`).
  Drift-proof against `main.wasp.ts` changes. Build-time check asserts the SDK
  is generated (stale checkout fails loudly).
- **`--json` is stable + documented** in `cli/README.md`. Humans get calm,
  human-readable output by default (ActionAmp tone: no streaks/badges/guilt).

## Command surface (existing ops only)

| Command | Backing op | Notes |
|---|---|---|
| `now` | `getTopTask` | headline; active lens resolved from `getAppData` |
| `task show <id>` | `getTask` | |
| `task start <id>` / `pause` / `done` | `startTask` / `pauseTask` / `toggleTaskDone` | |
| `task snooze <id> --preset <p>` | `snoozeTask` | presets: `1h\|3h\|tomorrow\|weekend\|someday` |
| `task move <id> --to <t>` | `updateTaskStatus` | `today\|upcoming\|someday` |
| `today` / `today --done` | `getTasks` / `getDoneToday` | |
| `inbox list` / `inbox capture <text>` | `getInboxItems` / `createInboxItem` | |
| `inbox triage <id> --decision <d>` | `triageInboxItem` | |
| `project list` / `show <id>` / `create` / `add-task` | `getProjects` / `getProject` / `createProject` / `createTask` | |
| `goal list` / `show <id>` / `create` | `getGoals` / `getGoal` / `createGoal` | |
| `logbook` | `getLogbook` | |
| `login` / `whoami` / `logout` / `token` | PAT flow (shipped in cli-pat-plumbing) | |

**Not built here:** edit description, delete anything, comments, attach/list
resources. Filed as `cli-write-ops` + `cli-comments-resources` (deferred).

## Done-conditions

- [ ] **Op refactor executed per the decision table above.** Every op in the
      "Factor" rows gets a pure core extracted; the Wasp op + the `/api/cli/*`
      route both delegate to it. No op needs Option (b) or (c).
- [ ] **`cli/` builds and tests pass.** `tsc` clean; `npm test` (vitest + msw)
      green; `actionamp --help` lists every command.
- [ ] **Auth + headline loop work against a running app.** `actionamp login`
      (token paste) → `whoami` → `now` returns the next task → `task done <id>`
      completes it (appears in `today --done`). Verified manually against
      `wasp start`.
- [ ] **Every command supports `--json`** with a documented, stable shape,
      asserted in tests; shapes listed in `cli/README.md`.
- [ ] **Human output follows ActionAmp tone** — calm, no exclamation marks,
      no streaks/guilt UI.
- [ ] **AGENTS.md + repo README updated** — `cli/` added to the implementation
      map and the repo-layout table.
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No PAT plumbing** — shipped in `cli-pat-plumbing`.
- **No orchestration skills** — `cli-skills`.
- **No missing write ops** (edit/delete/comments/resources) — `cli-write-ops`,
  `cli-comments-resources`.
- **No Google OAuth in the CLI.** Browser-redirect; not feasible headless.
- **No npm/npx distribution.** Local `npm link` / `node` invocation; publishing
  is a later decision.
- **No new focus-engine or ranking logic.** The CLI calls `getTopTask` as-is.

## Op refactor — decision table (Open Q1, resolved 2026-07-22)

The PAT transport (Option A, locked in `cli-pat-plumbing`) puts each CLI
command behind an `/api/cli/<op>` route that delegates to a **pure function
factored out of the existing `operations.ts`**. The original concern was that
"factor pure functions out of every op" is unbounded — so the Discover pass
enumerated every op in the command surface and rated its factorability.

**Headline: the refactor is bounded and mechanical. Every op in the surface is
factorable (15 EASY, 2 MEDIUM, 0 HARD). Nothing needs the Option B
session-minting fallback.** The codebase already has the template —
`billing/entitlements.ts` is a two-file split where pure decision functions
take a loosely-typed `entities` object (not Wasp's `context`), and
`billing/entitlementHttp.ts` is the only file that imports `wasp/server` to
wrap them in `HttpError`. Every refactor below mirrors that split.

### Template (applies to every "Factor" row)

```
operations.ts (today)              →  operations.ts (after)        +  operationsCore.ts (new)
─────────────────────────────────      ──────────────────────────     ─────────────────────────
export const getTasks = (async       export const getTasks =          export async function getTasksData(
  (args, context) => {                 (async (args, context) => {      entities, { userId, ...args }
  // auth check                        if (!context.user) throw …     ) { /* pure DB access */ }
  // lens guard                        await assertLensAllowed(…)     )
  // DB access  ←─ extract ────────▶   return getTasksData(
  // shape                           context.entities,
}) satisfies GetTasks<…>;              { userId: context.user.id, …args },
                                    );
                                  })
```

- The pure core takes `entities` (Prisma-client-shaped) + a plain args object,
  returns data. No `wasp/server` import → unit-testable without mocking Wasp.
- The Wasp op becomes a thin wrapper: auth check + `assertLensAllowed` +
  `assertUnderCap` (the entitlement guards) + delegate to the core.
- The `/api/cli/<op>` route does the same: resolve user from PAT middleware,
  run the same guards (PAT-compatible — `req.patUser` carries the fields
  `entitlementHttp.ts`'s `GuardContext` reads), delegate to the same core.

### Per-op decisions

**Factor (default — Option a):**

| Op | Why factorable | Notes |
|---|---|---|
| `getTopTask` | sort comparator already duplicated as `rankTopTask` in `patRoutes.ts:34`; `activePoolWhere` already factored | The Phase 0 stub (`cliNow`) is already half this refactor — extracting the core *replaces* the stub's inline copy. |
| `getTask` | single `findFirst`, no lens guard, no side effects | — |
| `getTasks` | where-clause is already inline-pure | — |
| `getDoneToday` | both entitlement helpers (`resolveAccessibleLenses` etc.) already pure | — |
| `pauseTask` | 2 writes (close session + clear startedAt) | Simpler twin of `startTask`. |
| `toggleTaskDone` | outcome-trim logic already pure inline | — |
| `snoozeTask` | extract `snoozeTarget(preset, now)` as pure (testable); then a 1-write data fn. `SNOOZE_OFFSETS` is already pure | — |
| `updateTaskStatus` | tenancy `findUnique` + single update | — |
| `createInboxItem` | `parseCapture` already factored pure (`inbox/parseCapture.ts`) | — |
| `getInboxItems` | single `findMany`, no lens guard (inbox is universal) | — |
| `getProjects` / `getProject` / `createProject` / `createTask` | rollup maps already pure; cap + permalink (`uniquePermalink`) already factored | — |
| `getGoals` / `getGoal` / `createGoal` | same shape as Projects | — |
| `getLogbook` | `Promise.all` of 4 `findMany`s + 4 pure shape maps | NOTE: `getLogbook` currently lacks `assertLensAllowed` (pre-existing gap); the refactor should add it on the CLI path. |

**Factor (MEDIUM — Option a, but watch the sequence):**

| Op | Why medium | Notes |
|---|---|---|
| `startTask` | 3 writes (clear others' `startedAt`, close prior `TaskSession`, create new `TaskSession`) **not in `$transaction`** | Pre-existing smell, not a refactor cost. Extract `startTaskCore` keeping the write order; file a task to add `$transaction` separately. |
| `triageInboxItem` | orchestrator body; but `resolveTagRecords`, `resolveEffectiveProject`, `createTaskFromTriage`, `createProjectFromTriage` (lines 113-245) are *already* standalone `async` functions | The hard parts are done. Extract `triageInboxItemCore(entities, userId, args)`. Multi-write (create + delete `InboxItem`) also not transactional — same filed-task caveat. |

**Partial factor (Option a for the slice, b for the rest):**

| Op | What to factor | Notes |
|---|---|---|
| `getAppData` | factor **only** `resolveActiveLens(lenses, requestedId)` (already pure inline at `app/operations.ts:79-82`; already re-implemented in `patRoutes.ts:165-184` — the duplication is visible). Leave the full bootstrap op alone. | The CLI's `now` needs only lens resolution, not the 5 counts + rollover write. Factoring the whole op is HARD and unnecessary. |

**Option (b) Inline — none. Option (c) Option B session mint — none.** Every
op in the surface goes Option (a) (or partial-a for `getAppData`).

### PAT-route entitlement guards

Every `/api/cli/<op>` route backing a lens-scoped op must run the equivalent
of `assertLensAllowed`. This is already PAT-compatible:
- `lensViolation` (`entitlements.ts:91`) is pure, takes a loosely-typed
  `entities` + the user fields `{id, plan, planRenewsAt, isAdmin}`.
- `req.patUser` from `patMiddleware.ts` carries exactly those fields.
- A `/api/cli/*` route calls `resolveLens(entities, userId, lensId)` +
  `lensViolation(user, lens, msg)`, translating a non-null result to a 402.
- `assertUnderCap` follows the same pattern for create ops.

The two-file split means `operationsCore.ts` can call these pure helpers
directly (they don't import `wasp/server`); only the HTTP wrappers in
`entitlementHttp.ts` do, and those are route-layer concerns.

## Lens scoping for `now` (Open Q2, resolved 2026-07-22)

`getTopTask` is lens-scoped; the browser resolves the active lens from
`getAppData`. The CLI has no app shell. **Locked: `actionamp now` resolves the
lens in this order:**

1. `--lens <name>` flag if present (matched against the user's lenses by name,
   case-insensitive; 404 if not found).
2. Else `defaultLens` from `~/.config/actionamp/config.json` if set + still
   owned by the user.
3. Else the user's first lens by `createdAt` (the same fallback `getAppData`
   uses at `app/operations.ts:79-82`). This is the zero-config path — a fresh
   user with one Work lens gets Work without configuring anything.

The `?lensId=` query param on the Phase 0 `/api/cli/now` stub is replaced by
this resolution in the `cli/` package's `now` command.

## Prototype — IN PROGRESS (throwaway; "discard on lock")

> **Status: `building`** (reworked 2026-07-22 from `review`). The first cut
> used paste-a-token login — too much friction for daily use. Replacing the
> login command with browser-OAuth (the `gh auth login` pattern): CLI opens
> a browser, you authenticate there, the token comes back via a localhost
> callback. `now`/`capture`/`logout`/`--json` from the first cut stay.

A throwaway `cli/actionamp.ts` (pure Node 22+, **no dependencies**) that
validates the transport *and* the feel of the loop before committing to the
full surface. **Discard on lock** — replaced by the typed, tested,
`commander`-based package when real Phase 1 lands.

### Prototype command surface

| Command | Default (human) output | `--json` output |
|---|---|---|
| `login [--dev]` | Opens browser to `/cli/login`, you confirm, token comes back via localhost callback, written to `~/.config/actionamp/config.json`. | `{ ok: true, user: {...} }` |
| `now` | `Description · in ProjectName` or `Nothing on the table.` | `{ task: {...} \| null, reason?: "no-lens" \| "no-candidates" }` |
| `capture <text>` | `Captured.` | `{ ok: true, id, text }` |
| `logout` | `Signed out.` | `{ ok: true }` |

**`--dev` flag** switches `apiUrl` between `localhost:3001` (dev) and
`api.actionamp.com` (prod, the default). Explicit, not auto-detection —
auto-detecting "is there a dev server running?" is flaky.

Four verbs, each with `--json`. **No `done` / `snooze` / `done today`** — the
`done` semantics (no-arg = top task, prints next) are the riskiest design call
in the loop; testing them blind on the prototype would be guessing. Save for
after the prototype has taught us whether `now`'s shape feels right.

**Deliberately not in the prototype:** TypeScript + `tsc`, `commander`,
`chalk`, tests, the other 10 commands. The file is `.ts` for syntax but run
via `node --experimental-strip-types` (Node 22+ supports this) — zero build
step. Real Phase 1 rebuilds it properly.

### The OAuth login flow (replaces paste-a-token)

The pattern every modern CLI uses (`gh`, `stripe`, `vercel`): the CLI is not a
trusted token-issuer — only the authed browser can mint — so the CLI asks the
browser to do it, then receives the result via a localhost callback.

```
$ actionamp login --dev
Opening browser to http://localhost:3001/cli/login?callback=http%3A%2F%2Flocalhost%3A42319%2Fcallback&state=a1b2c3…
Waiting for authorization… (Ctrl+C to cancel)

  ← browser opens →
  ← if not logged in: redirects to /login, then back to /cli/login?callback=…&state=… →
  ← "Authorize ActionAmp CLI?" page with a Confirm button (explicit consent) →
  ← on click: mints an ApiKey via /api/pat/issue, redirects to the callback →

✓ Signed in as zeljko@dakic.com.
Token saved. You can revoke it from Settings → Access tokens.
```

Moving parts:

1. **CLI spins up a throwaway `http.createServer` on a random high port**
   (e.g. 42319), listens for exactly one request, then closes.
2. **CLI generates a `state` nonce** (random hex) — CSRF protection. Stored
   in-memory; the callback must echo it.
3. **CLI opens the browser** (macOS: `open`; Linux: `xdg-open`) to
   `${apiUrl}/cli/login?callback=${encodeURIComponent(localhostCallback)}&state=${state}`.
4. **The `/cli/login` page** (new, session-authed, `authRequired: true`):
   - Reads `callback` + `state` from query params.
   - If unauthed, Wasp redirects to `/login` with a redirect-back to here
     (preserving the query params).
   - Once authed, shows **"Authorize ActionAmp CLI?"** with a Confirm button
     showing the requested label (auto-generated: `CLI on <hostname>`).
   - **Explicit consent** — a malicious site can embed a `callback=` pointing
     at its own server, but it can't get the user to click Confirm on the real
     `/cli/login` page without their action. The button is the consent gate.
   - On click, the page calls `POST /api/pat/issue` (reusing the existing
     session-authed route verbatim — `webapp/src/auth/patRoutes.ts:75`), gets
     the plaintext token back, then redirects the browser to
     `${callback}?token=${token}&state=${state}`.
5. **CLI receives the callback** at its temp server, validates `state` matches,
   stores the token in `~/.config/actionamp/config.json` (mode 0600), shuts
   down the server, prints "Signed in as <email>." (email from a `whoami`
   call — see below).

**Token storage** is unchanged from the first cut — `patIssue` already does
SHA-256 hashing + writes an `ApiKey` row. The OAuth flow is purely a *better
delivery mechanism* for that row; the storage layer (the `ApiKey` table, the
`/api/cli/*` middleware) is reused as-is.

### What's reused vs. what's new

**Reused (nothing wasted):**
- `patIssue` route — the page calls it directly; no new mint route needed.
- `ApiKey` model + `/api/cli/*` middleware — identical; the OAuth flow just
  creates a row via the existing session-authed route.
- Settings UI — stays as the manual management surface (revoke, see what's
  issued); OAuth becomes the *primary* creation path.

**New (this pull):**
- One React page: `webapp/src/auth/CliLoginPage.tsx` — session-authed,
  explicit-confirm, mints + redirects on click. Mirrors `Founding100Page`'s
  `authRequired: true` route pattern (`main.wasp.ts:165`).
- One route in `main.wasp.ts`: `route("CliLoginRoute", "/cli/login", page(CliLoginPage, { authRequired: true }))`.
- Rewritten CLI `login` command: `node:http` server + `node:child_process`
  browser-open + state validation + `--dev` flag.
- A `whoami`-style endpoint OR reuse `/api/cli/now`'s resolved user (the
  middleware already attaches `req.patUser` with id/plan/etc., but not email).
  Lean: extend `req.patUser` to include `email`/`username` for the "Signed in
  as X" line. One-line change to the middleware's `select`.

### Open question (resolve during build)

- **`onAuthSucceededRedirectTo` interaction.** Wasp's global setting is
  `/do` (`main.wasp.ts:103`). After a fresh login on `/cli/login`, does Wasp
  return the user to `/cli/login?callback=…` or send them to `/do`? The
  `Founding100Route` comment at `main.wasp.ts:161-165` says Wasp returns them
  to the intended page after auth — verify this holds for query-string-bearing
  routes. If not, the page stores `callback`/`state` in `sessionStorage`
  pre-login and reads them post-login.

### What the prototype tells us (the steering questions)

After ~a week of use, the answers shape Phase 1's real scope:

1. **Does `now` pull you back into focus, or do you open the tab anyway?** If
   the tab wins, the CLI's value isn't the decision loop — it's `capture` +
   a future `done today` reflection surface.
2. **Is one token per machine fine, or do you want per-context tokens?**
   Steers whether PAT scopes ship sooner.
3. **Does `capture` from the terminal beat `⌘K` in the browser?** If not,
   `capture`'s real home may be a global hotkey, not the CLI.
4. **Does `--json` feel like a real constraint or an afterthought?** If human
   and JSON outputs diverge a lot, the "one command, two outputs" model is
   wrong and the surfaces should split.

### Phase 1 scope options (decided *after* the prototype)

Three honest forks, ordered by what the prototype is likeliest to confirm:

- **Loop-first (5 verbs)** — `login` / `now` / `done` / `snooze` / `capture`
  + `logout`. The decision-loop surface. Smaller than the current spec; ships
  the value sooner. The browsing commands (`project list`, etc.) fold into a
  later phase or into Phase 2 with the skills.
- **Input/reflection surface** — `capture` + `done today` + `login`/`logout`.
  The CLI as a side-channel, not a decision surface. Smaller still.
- **Full surface (current spec)** — all ~14 commands + `--json` + op-refactor.
  Largest. Only if the prototype confirms the browsing commands pull weight
  from the terminal, which is the least likely outcome.

### Verification log (2026-07-22)

Prototype exercised end-to-end against `wasp start` (API on :3001) with a
session-issued PAT. All four verbs + `--json` + error paths verified:

| Step | Command | Result |
|---|---|---|
| 1 | `--help` | Usage text printed. ✅ |
| 2 | `now` (not logged in) | `Not logged in. Run: actionamp login` + exit 1. ✅ |
| 3 | `login` (pipe a real PAT) | `Signed in. API: http://localhost:3001`. ✅ |
| 4 | `now` | `Capture one real thing on your mind` (the user's actual top task). ✅ |
| 5 | `now --json` | Full task JSON (id, description, lens, project, …). ✅ |
| 6 | `capture "text #cli"` | `Captured.` ✅ |
| 7 | `capture "…" --json` | `{ok:true, id, text, createdAt}`. ✅ |
| 8 | `capture` (no text) | Usage error + exit 1. ✅ |
| 9 | `logout` | `Signed out.` + config deleted. ✅ |
| 10 | `now` (after logout) | `Not logged in.` ✅ |
| 11 | `login` with `aa_bogus` | `Token rejected (401).` + exit 1. ✅ |

Also verified the Phase 0 review-fix path still holds end-to-end through the
CLI: the prototype's `now` resolves the default lens via `resolveAccessibleLenses`
(FREE → PERSONAL), and `/api/cli/capture` is wired behind `patRouteMiddleware`
with the same ⚠ guard comment as `/api/cli/now`.

**No new backend route gaps.** `/api/cli/capture` added in the same pull,
duplicating `createInboxItem`'s logic inline (the same tradeoff `cliNow` makes
for `getTopTask`). Phase 1's op refactor collapses both duplications.

## Dependencies

- **`cli-pat-plumbing`** (must ship first — the CLI calls `/api/cli/*` which
  the PAT middleware protects). ✅ shipped (in Review).
- **`cli-comments-resources`** for the `task-research` skill only — not for
  this spec.
