---
name: aa-complete
description: >
  Mark ActionAmp tasks done safely, with a completion note, and surface what
  comes next. Use when the user says "done with X", "finished it", "X is
  handled", "check off X", "I did it", or otherwise reports finishing
  something tracked in ActionAmp.
---

# Completing tasks

Read before writing; make the finish meaningful; then show the next thing.

## Steps

1. **Identify the task.** The user rarely gives an id — match their words
   against open tasks (`task show <permalink>`, or the project's task list
   via `project show <id> --json`). If two tasks match, ask which.
2. `actionamp task show <id> --json` — confirm it exists, is not already
   done, and is the one they mean. Say what you found before mutating.
3. `actionamp task done <id> --outcome "<one line>"` — nudge for an outcome
   note when the user gave any context ("it was easy", "shipped via X").
   Outcomes are what make weekly reviews worth reading later. Don't invent
   one if the user said nothing — omit the flag.
4. `actionamp now --json` — the next task surfaces automatically. Present it
   the same way the `now` skill would: one task, one line of context.

## Judgment calls

- **Started tasks** (`startedAt` set) — completing them is the normal loop:
  done, then next.
- **Not actually done** — the user says "forget it" or "not doing this":
  don't mark done. Offer to snooze (`task snooze <id> --preset someday`) or
  move (`task move <id> --to someday`). True dismissal (WONT_DO) is a
  web-app action; the CLI can't set it, and `done` would inflate reviews.
- **Today is now emptier** — note it in one clause, no commentary.

## Rules

[../_shared/rules.md](../_shared/rules.md) — read-before-write and one
action at a time apply fully here.
