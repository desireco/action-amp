---
slug: cli
title: "CLI + orchestration skills (power-user terminal surface)"
feature_area: developer
status: partial              # Phase 0 + Phase 1 shipped; Phase 2 (skills) draft
spec: cli.md                       # umbrella; effort split into 3 specs 2026-07-03
verified: 2026-08-08
---

# CLI + orchestration skills

**Phase 0 + Phase 1 shipped 2026-07-22; surface has since grown.** A standalone
`cli/` package (commander + chalk, ESM, TypeScript) talks to the webapp's
`/api/cli/*` routes via PAT auth (OAuth browser login — the `gh auth login`
pattern). **Pro-only:** Free accounts cannot issue CLI tokens or call any CLI/API
route; an active Pro plan or Founding membership is required. Existing tokens
also stop working immediately if an account returns to Free. Staff accounts
retain the standard entitlement bypass. Lens and cap checks remain in place
inside the Pro CLI surface.

**Today's command surface** (every command supports `--json`):

- **Auth/session:** `login`, `whoami`, `logout`.
- **Focus/lists:** `now`, `today (--done)`, `logbook`, read-only
  `review (week|month)` reports (`--previous`, `--for`, optional explicit Lens).
- **Capture/inbox:** `capture` (NL parsing + `--title/--content/--source-url/
  --file` for shared content + one image), `inbox (list|triage)`.
- **Tasks:** `task (show|start|pause|done|snooze|move)`.
- **Planning:** `project (list|show|create|add-task)` (list/show carry
  resources), `goal (list|show|create)`, `resource (list|add|update|delete)`.
- **Lenses:** `lens (list|show|switch|current)` — `switch` stores the active
  lens in `~/.config/actionamp/config.json`; most reads fall back to it
  without `--lens-id`.
- **Meta:** `llm` (prints agent/LLM instructions).

**Spec — split into three 2026-07-03** (the original single spec was too large
for one `ready` unit):

| Spec | Status | What |
|------|--------|------|
| [`cli-pat-plumbing`](../specs/cli-pat-plumbing.md) | **shipped 2026-07-22** | `ApiKey` model (SHA-256 hashed tokens) + PAT routes + Bearer middleware + `/cli/login` consent page + Settings → Access tokens UI. |
| [`cli-package`](../specs/cli-package.md) | **shipped 2026-07-22** (surface grown since) | The `cli/` package — full command surface above + `--json`, backed by pure `*Core.ts` files shared with the Wasp ops (zero duplicated logic). |
| [`cli-skills`](../specs/cli-skills.md) | `draft` | Four orchestration skills. Depends on `cli-package`; `task-research` was blocked on `cli-comments-resources`, now unblocked by the `resource` commands. |

Umbrella design + cross-cutting decisions: [`docs/specs/cli.md`](../specs/cli.md).

**Why it matters.** A focus app whose thesis is "decision, not capture" fits a
terminal; the single-task answer should be reachable without a browser tab.
The CLI is also the machine interface for orchestration skills. It does not
change the wedge — it widens the surface for power users. **Not part of the
validation gauntlet** — opportunistic, shipped because the surface was
self-contained.
