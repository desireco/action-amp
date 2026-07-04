---
slug: cli
title: "CLI + orchestration skills (power-user terminal surface)"
feature_area: developer
status: missing
spec: cli.md                       # umbrella; effort split into 3 specs 2026-07-03
verified: 2026-07-03
---

# CLI + orchestration skills

**Wanted.** A top-level `cli/` package (typed library + thin binary) that
talks to the ActionAmp HTTP API via **Personal Access Tokens**, plus four
paired orchestration skills that shell out to `actionamp <cmd> --json`.
Headline command `actionamp now`. Power-user / developer surface — **not part
of the validation gauntlet**; `ready` for Build to pull opportunistically.

**Today.** No CLI code; no PAT model; no skills.

**Spec — split into three 2026-07-03** (the original single spec was too large
for one `ready` unit):

| Spec | Status | What |
|------|--------|------|
| [`cli-pat-plumbing`](../specs/cli-pat-plumbing.md) | **`ready`** (P3) | `ApiKey` model + PAT routes + Bearer middleware + Settings UI. Self-contained backend slice. The natural first pull. |
| [`cli-package`](../specs/cli-package.md) | `draft` | The `cli/` package — ~14 commands + `--json`. **Draft because the op-refactor scope is unscoped** (its Open Question 1). |
| [`cli-skills`](../specs/cli-skills.md) | `draft` | Four orchestration skills. Depends on `cli-package`; one skill blocked on `cli-comments-resources`. |

Umbrella design + cross-cutting decisions: [`docs/specs/cli.md`](../specs/cli.md).

**Why it matters.** A focus app whose thesis is "decision, not capture" fits a
terminal; the single-task answer should be reachable without a browser tab.
The CLI is also the machine interface for orchestration skills. It does not
change the wedge — it widens the surface for power users.
