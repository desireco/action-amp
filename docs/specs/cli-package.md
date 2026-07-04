---
id: cli-package
kind: spec
title: "CLI package + op refactor (Phase 1 of the CLI effort)"
status: draft              # was part of ready cli.md; unscoped refactor → draft
priority: P3
feature: cli
spec_owner: discover
build_owner: build
parent: cli.md
depends_on: cli-pat-plumbing.md
created: 2026-07-03
---

# Spec: CLI package (Phase 1)

> **Second of three specs split out of `cli.md` 2026-07-03.** This is `draft`:
> the spec knows *what* commands the CLI needs, but the **op-refactor it
> depends on is unscoped** — see Open Question 1. That's the one thing keeping
> it from `ready`.

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

## Done-conditions (draft — gated on Open Question 1)

- [ ] **The op-refactor scope is decided and executed** (Open Question 1).
      This is the prerequisite for every CLI command's server-side call.
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

## Open questions

### 1. The op-refactor scope (this is why it's `draft`, not `ready`)

The PAT transport (Option A, locked in `cli-pat-plumbing`) puts each CLI
command behind an `/api/cli/<op>` route that delegates to a **pure function
factored out of the existing `operations.ts`**. The original `cli.md` flagged
this in a ponytail comment: *"the pure-function refactor is the part most
likely to touch a lot of files; keep it mechanical."* That is an open question
masquerading as a decision — Build doesn't know how invasive the refactor is
until it starts, and "factor pure functions out of every op" is unbounded.

**Resolution path (Discover's job before `ready`):** enumerate every op the
command surface above touches (≈14 ops across tasks/projects/goals/inbox/lists)
and decide, per op, one of:
- **(a) Factor** — extract a pure function, both the browser op and the
  `/api/cli` route call it. (Default; most ops.)
- **(b) Inline** — the route re-implements the op's logic for the CLI path.
  (Acceptable only where the op is trivially small and stable.)
- **(c) Option B fallback** — for ops where factoring proves too invasive,
  mint a Wasp session from the PAT and reuse the stock `/operations/*`
  endpoint. (Last resort; couples to Wasp internals.)

The spec lists which ops go (a)/(b)/(c). Until that enumeration exists, the
refactor is unscoped and the spec is not `ready`.

### 2. Lens scoping for `now`

`getTopTask` is lens-scoped; the browser resolves the active lens from
`getAppData`. The CLI has no app shell. Lean: `actionamp now` reads a default
lens from config (`~/.config/actionamp/config.json`), overridable with
`--lens work|me`. Note the choice.

## Prototypes

_(none yet — a throwaway `cli/` worktree proving `actionamp now --json` against
a running `wasp start` is the cheapest validation that the transport +
type-sourcing approach holds. Discard on lock. Belongs at the top of Phase 1,
before the full command surface.)_

## Dependencies

- **`cli-pat-plumbing`** (must ship first — the CLI calls `/api/cli/*` which
  the PAT middleware protects).
- **`cli-comments-resources`** for the `task-research` skill only — not for
  this spec.
