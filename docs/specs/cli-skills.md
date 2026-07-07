---
id: cli-skills
kind: spec
title: "Orchestration skills (Phase 2 of the CLI effort)"
status: draft
priority: P3
feature: cli
spec_owner: discover
build_owner: build
parent: cli.md
depends_on: cli-package.md
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsVo      # sync-managed (write-once)
gh_synced_at: 2026-07-07T18:16:34Z   # sync-managed (drift detection)
---

# Spec: Orchestration skills (Phase 2)

> **Third of three specs split out of `cli.md` 2026-07-03.** `draft` because it
> depends on `cli-package` (the `--json` contract) and one of its four skills
> is blocked on a deferred spec. Promoted to its own spec so the skill work
> isn't buried inside the CLI package spec.

## Summary

Four paired agent skills that shell out to `actionamp … --json` (shipped by
`cli-package`) and reason over the parsed output. They live in
`.agents/skills/` at the repo root so they travel with the checkout.

1. **`inbox-triage`** — pulls `inbox list`, proposes a destination per item
   (task-today / upcoming / someday / project / resource / archive) using the
   item text + parsed guesses + the user's current Today/goal context,
   presents the plan, applies via `inbox triage` on approval. **Works once
   `cli-package` ships.**
2. **`goal-breakdown`** — takes a goal name/id, proposes a structure of
   Projects + Tasks under it, applies via `goal show` → `project create` →
   `createTask`. **Works once `cli-package` ships.**
3. **`today-balancer`** — reviews `today` against the **Today cap of 5**
   (`WORKFLOW.md` §5 / FEATURES.md F12; the cap is a feature, not a limit) and
   the focus rules (priority > size > oldest, per `getTopTask`), proposes
   promote/demote/snooze moves, applies via `task move` / `task snooze`.
   **Works once `cli-package` ships.**
4. **`task-research`** — takes a task/project, gathers web resources, drafts a
   refined description + resource list. **BLOCKED** on `cli-comments-resources`
   (deferred); scaffolded only.

## Why

The CLI exists partly so that a focus app can be orchestrated by an agent, not
just typed by a human. The three unblocked skills each automate a known-
overwhelming ActionAmp loop: clearing an inbox (decision fatigue), breaking a
goal into doable steps (planning paralysis), and keeping Today honest against
the cap (over-commitment). They are the *use* of the machine interface — and
they double as the cheapest real-world exercise of the `--json` contract.

## Done-conditions

- [ ] **`inbox-triage`, `goal-breakdown`, `today-balancer` each have a
      `SKILL.md`** in `.agents/skills/<name>/` with the standard frontmatter
      (matching the existing `~/.agents/skills/goal/SKILL.md` structure).
- [ ] **Each of the three completes one full cycle** against the running app
      via the CLI: inbox-triage triages one item end-to-end; goal-breakdown
      creates a project + task under a goal; today-balancer proposes + applies
      a move.
- [ ] **Each SKILL.md specifies** the exact `actionamp` commands it shells out
      to, the JSON shape it parses, and the calm tone of its user-facing
      output (no streaks/badges/guilt; ActionAmp register).
- [ ] **`task-research` is scaffolded** (SKILL.md present) and clearly marked
      blocked on `cli-comments-resources.md` (it needs Resource write ops).
- [ ] **AGENTS.md updated** — `.agents/skills/` noted in the implementation map.
- [ ] **Cold-context reviewer passes** on at least one of the unblocked skills.

## Non-goals

- **No `task-research` implementation** — blocked on a deferred spec.
- **No skill does focus-engine work.** They call `getTopTask` / Today rules
  as-is; they don't re-rank.
- **No new CLI commands.** Skills compose existing commands; if a skill needs
  a missing op, that's a follow-up spec, not a workaround here.
- **No autonomous/unsupervised execution.** Each skill presents a plan and
  waits for approval before applying (the ActionAmp principle: decide, then
  act — no silent bulk mutation).

## Open questions

- **Skill discovery.** How does a user invoke a skill? (Lean: the skills live
  in `.agents/skills/` and are invoked by an agent the user is already running
  — same model as `duet-*`. No new launcher.)
- **Plan-then-apply vs streaming-apply.** Each skill's "present the plan,
  wait, apply" is the default. If a skill (e.g. inbox-triage on 30 items)
  would benefit from batching the apply, note it in that SKILL.md.

## Prototypes

_(none — a SKILL.md is the artifact. The cheapest validation is writing
`inbox-triage`'s SKILL.md and exercising it by hand against a seeded inbox.)_

## Dependencies

- **`cli-package`** (the `--json` contract + every command these skills call).
- **`cli-comments-resources`** for `task-research` only.
