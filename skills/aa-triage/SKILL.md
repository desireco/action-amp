---
name: aa-triage
description: >
  Process unprocessed ActionAmp inbox items into tasks, projects, resources,
  list rows, or the archive. Use when the user says "go through my inbox",
  "what's in my inbox", "triage", "file these", "clean up my captures", or
  asks what to do with saved links and screenshots.
---

# Inbox triage

Classify, propose, confirm, execute — one item at a time.

## Steps

1. `actionamp inbox list --json` — items carry `text`, `title`, `content`,
   `sourceUrl`, `attachments`, and pre-parsed hints (`parsedPriority`,
   `parsedProject`, ...). Respect those hints; the user already said them at
   capture time.
2. **Classify** each item yourself first:
   - *Actionable* → `task-today`, `upcoming`, or `someday` (+ `--lens-id`)
   - *Reference link* → `resource` into a project
   - *List material* (reading, shopping, watching) → `list-item` into a
     Simple-list project — only where the target lens has one
   - *Stale ad / promo / dead link* → `archive` (default) or `delete` only if
     the user explicitly says delete
   - *Screenshot* → ask what it is, then decide
3. **Show the plan** — a small table: item → proposed decision → target.
   Get an explicit OK per item (or "go ahead with all of these").
4. Execute one at a time:

```sh
actionamp inbox triage <id> --decision <d> [--lens-id <id>] [--project-id <id>]
```

Decisions: `task-today`, `upcoming`, `someday`, `project`, `resource`,
`list-item`, `archive`, `delete`.

## Hard rules

- **No autonomous triage.** Every decision is confirmed by the user first.
  No exceptions, even when the classification seems obvious.
- Respect the Today cap (5) — if triage would push Today over, surface it.
- After the sweep, report counts: filed where, archived how many, inbox now
  empty or what remains and why.

[../_shared/rules.md](../_shared/rules.md)
