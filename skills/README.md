# ActionAmp Agent Skills

Bundled skills that teach AI coding agents (pi, Claude Code, OpenAI Codex) how
to manage a user's ActionAmp todos through the `actionamp` CLI.

## What's here

| Skill | Loaded when the user says |
|---|---|
| `aa-setup` | "set up actionamp", first capture fails, login issues |
| `aa-now` | "what should I work on", "plan my day", "what's next" |
| `aa-capture` | "add …", "remind me to …", shares a link or screenshot |
| `aa-triage` | "go through my inbox", "what's in my inbox" |
| `aa-complete` | "done with X", "finished it", "that's handled" |
| `aa-review` | "how was my week", "what did I accomplish" |
| `aa-hygiene` | "clean up my tasks", "audit my projects" |

The `aa-` prefix keeps the set short and collision-free — other tools and
skills have no reason to claim these names.

`_shared/` holds the guardrails every skill references — trust boundaries, the
product voice, and how to read the live CLI reference. It has no `SKILL.md`, so
harnesses never load it as a skill itself. `skills install` copies it into the
target skills dir alongside the skills (each SKILL.md links
`../_shared/rules.md`); `--force` refreshes it together with the skills.

## Install

From a published CLI:

```sh
actionamp skills install
```

The command detects installed harnesses (`~/.pi`, `~/.claude`, `~/.codex`,
`~/.agents`), asks which ones to target (when interactive), and copies the
skill folders in. Re-run with `--force` after a CLI upgrade to refresh them.
Skills are always **copied** — never symlinked — because end users don't have
this repository checked out.

From a repo checkout (local dev):

```sh
cd cli && npx tsx src/index.ts skills install --dry-run
```

## Updating

Edit the `SKILL.md` files here (source of truth), bump nothing —
`publish.sh cli` bundles this folder into the npm package. Keep each skill
lean; details belong in `_shared/`.
