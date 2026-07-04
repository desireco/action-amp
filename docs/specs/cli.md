---
id: cli
kind: spec
title: "ActionAmp CLI + orchestration skills (umbrella)"
status: ready                  # the EFFORT is ready to pull, starting with cli-pat-plumbing
priority: P3                   # opportunistic — not validation-critical
feature: cli
spec_owner: discover
build_owner: build
split_into: [cli-pat-plumbing.md, cli-package.md, cli-skills.md]
created: 2026-07-03
---

# Spec: ActionAmp CLI + orchestration skills (umbrella)

> **Umbrella spec.** The original (pre-2026-07-03) `cli.md` was a single 290-
> line spec covering PAT plumbing + the CLI package + four skills — too much
> for one `ready` unit. **Split into three**, each independently status'd. This
> file is the design + the index; the three children are the buildable units.

## The effort, in one paragraph

A new top-level `cli/` package that talks to the ActionAmp HTTP API (never the
database), authenticated via **Personal Access Tokens (PATs)** added to the
backend. Built as a **typed library + thin binary** so paired agent skills can
shell out (`actionamp <cmd> --json`) while remaining human-usable. The CLI is
the *only* API client the skills use. Headline command: `actionamp now` —
print the next task that matters (the same `getTopTask` that powers `/app`).

## Where this sits strategically

This is a **power-user / developer surface, not part of the validation
gauntlet** in `docs/ROADMAP.md` §"Now." The roadmap's own thesis: adding
surfaces before proving anyone wants the existing product is malpractice. So
the effort is `ready` for Build to pull **opportunistically** — it does not
jump the queue ahead of `observability-minimal`, `retention-criticalpath`,
etc. It's here so that when Build wants a self-contained, well-scoped piece of
work (or the skills need a machine interface), the specs are ready and not
re-discovered.

## The three specs (in pull order)

| # | Spec | Status | What it ships |
|---|------|--------|---------------|
| 1 | [`cli-pat-plumbing`](./cli-pat-plumbing.md) | **`ready`** | `ApiKey` model + 3 PAT routes + Bearer middleware + Settings UI. The only backend slice. Self-contained, verifiable on its own. |
| 2 | [`cli-package`](./cli-package.md) | `draft` | The `cli/` package — ~14 commands, `--json` output, op-refactor. **Draft because the op-refactor scope is unscoped** (its Open Question 1). |
| 3 | [`cli-skills`](./cli-skills.md) | `draft` | Four orchestration skills (inbox-triage, goal-breakdown, today-balancer, task-research). Depends on cli-package; one skill blocked on a deferred spec. |

## Decisions locked (carry across all three children)

- **Write gaps → CLI-first.** The CLI calls only operations that exist today.
  Missing writes (edit description / priority / size, delete task/project/
  goal, comments, attach + list resources) are filed as `cli-write-ops.md`
  and `cli-comments-resources.md` (both `deferred`).
- **Auth → Personal Access Tokens.** `ApiKey` model + custom `api` routes.
  Token issued from the web UI, pasted once. Full-scope, non-expiring v1;
  revocation is the safety valve. Scoping/`expiresAt` deferred.
- **PAT transport = Option A.** Authed `api` routes under `/api/cli/<op>`
  with custom middleware that resolves the user from the PAT. *Rejected:
  Option B (mint a Wasp session from the PAT) — couples to session internals,
  fragile across upgrades.*
- **Location → new top-level `cli/`** (sibling of `docs/` and `webapp/`).
- **Types → generated from the Wasp SDK** via `import type` from
  `wasp/client/operations` (erased at compile time). Drift-proof.
- **Skill ↔ CLI link → shell out with `--json`.** Every command emits a
  documented, stable JSON shape.

## Non-goals (carry across the effort)

- **No Google OAuth login in the CLI.** Browser-redirect; not feasible
  headless. PAT only.
- **No npm/npx distribution.** Local `npm link` / `node` invocation is enough
  for now; publishing is a later decision.
- **No new focus-engine or ranking logic.** The CLI calls `getTopTask` as-is;
  it does not re-rank.
- **No autonomous/unsupervised skill execution.** Skills present a plan and
  wait for approval.

## Open questions (cross-cutting)

- **PAT scoping.** v1 tokens are full-scope. A later `scopes` field is
  possible but not needed now. _Deferred._
- **Token lifetime.** v1 tokens do not expire. Revocation is the safety valve.
  If churn/abuse warrants, add `expiresAt` later. _Deferred._
- **Option A vs B reality check.** If, during `cli-package`, factoring pure
  functions out of every op proves more invasive than expected, revisit
  Option B (mint-a-session) per-op as a fallback — but A is the default.

## See also

- The deferred follow-ups: `cli-write-ops.md`, `cli-comments-resources.md`.
- The competitive context for "decision, not capture" as a terminal use case
  is implicit in `docs/research/wedge-defensibility-roast-2026-06-27.md` —
  the CLI doesn't change the wedge, it widens the surface for power users.
