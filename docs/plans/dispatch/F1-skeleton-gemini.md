# DISPATCH — F1 monorepo skeleton

**TARGET MODEL: Gemini (capable tier) — author** (swapped from Z.AI default;
reviewer stays cross-family)
Goal: F1 · Timebox: half a day · Repo: action-amp root
Spec source: `docs/plans/2026-08-31-platform-switch-goals.md` §Wave 0.

## Read first

1. `AGENTS.md` (repo root) — house rules, including psql paths.
2. `docs/plans/PLATFORM-SWITCH.md` — project home (roadmap + invariants).

## Scope — build exactly this, nothing more

npm-workspaces skeleton at the repo root, four empty-ish packages:

```text
apps/web/         placeholder package.json + src/ placeholder (NO SvelteKit
                  scaffold yet — that is goal F9, do not run sv create)
apps/api/         placeholder package.json + src/ placeholder
packages/domain/  package.json + vitest configured + one smoke test
packages/contract/ placeholder package.json
```

* Root `package.json` with `"workspaces": ["apps/*", "packages/*"]` and
  scripts: `dev`, `build`, `test`, `lint`, `typecheck` (typecheck may
  initially be a passthrough where a package has no sources — wire it
  honestly, don't fake success).
* **The workspaces globs must cover only `apps/*` and `packages/*`.**
  `webapp/`, `cli/`, and `admin-cli/` stay fully independent with their own
  installs — nothing about their setup may change.
* Keep it minimal. This goal is folders + wiring, not features.

## Done when

* Fresh `npm install` at the repo root succeeds; `npm test` and
  `npm run typecheck` exit green.
* `git diff --stat` for your commits shows only the new folders plus root
  workspace config (`package.json`, `package-lock.json`, optional
  `.gitignore`/tsconfig base). `webapp/`, `cli/`, `admin-cli/`, `docs/`,
  `spikes/` untouched.
* A short note in `docs/plans/dispatch/notes/F1-notes.md`: what exists, how
  to run the scripts, anything surprising.

## Constraints

* Commit directly on `main`, focused commits, prefix `platform(F1):`.
* Never touch `webapp/`, databases, or the spike directories.
