---
id: cli-package
kind: spec
title: "CLI package + op refactor (Phase 1 of the CLI effort)"
status: building
priority: P3
feature: cli
spec_owner: discover
build_owner: build
parent: cli.md
depends_on: cli-pat-plumbing.md
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsTx      # sync-managed (write-once)
gh_synced_at: 2026-07-22T02:32:51Z
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

## Prototype (first Phase 1 pull — throwaway, "discard on lock")

A throwaway `cli/actionamp.ts` (~100 lines, pure Node 22+, **no dependencies**)
that validates the transport *and* the feel of the loop before committing to
the full surface. The spec's original §Prototypes called for this; the steering
pass on 2026-07-22 (see the four questions in §"What the prototype tells us")
narrowed it to the smallest thing that exercises every usage moment the user
cares about. **Discard on lock** — replaced by the typed, tested,
`commander`-based package when real Phase 1 lands.

### Prototype command surface

| Command | Default (human) output | `--json` output |
|---|---|---|
| `login` | Prompts for a token, validates against `/api/cli/now`, writes `~/.config/actionamp/config.json`. Refuses to save on 401. | `{ ok: true, user: {...} }` |
| `now` | `Description · in ProjectName` or `Nothing on the table.` | `{ task: {...} \| null, reason?: "no-lens" \| "no-candidates" }` |
| `capture <text>` | `Captured.` | `{ ok: true, id, text }` |
| `logout` | `Signed out.` | `{ ok: true }` |

Four verbs, each with `--json`. **No `done` / `snooze` / `done today`** — the
`done` semantics (no-arg = top task, prints next) are the riskiest design call
in the loop; testing them blind on the prototype would be guessing. Save for
after the prototype has taught us whether `now`'s shape feels right.

**Deliberately not in the prototype:** TypeScript + `tsc`, `commander`,
`chalk`, tests, the other 10 commands. The file is `.ts` for syntax but run
via `node --experimental-strip-types` (Node 22+ supports this) — zero build
step. Real Phase 1 rebuilds it properly.

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

## Dependencies

- **`cli-pat-plumbing`** (must ship first — the CLI calls `/api/cli/*` which
  the PAT middleware protects). ✅ shipped (in Review).
- **`cli-comments-resources`** for the `task-research` skill only — not for
  this spec.
