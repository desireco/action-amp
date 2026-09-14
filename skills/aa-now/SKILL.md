---
name: aa-now
description: >
  Answer "what should I work on right now" using ActionAmp's decision loop.
  Use when the user says "what should I do", "what's next", "plan my day",
  "give me one thing to do", "what's on for today", or asks about their
  top task, focus, or today list.
---

# What now

ActionAmp's whole point: one task, the next one that matters. Mirror that.

## Steps

1. `actionamp now --json`
   - **A task comes back** → that's the answer. Present it: description,
     project, size, priority, and the `context.whyNow` line if present. Ask
     "start this?" — if yes, `actionamp task start <id>`.
   - `task: null, reason: "no-candidates"` → nothing is on the table. Say so
     plainly, then suggest: capture a thought (`actionamp capture "..."`) or
     check Today.
   - `task: null, reason: "no-lens"` → the account has no active lens; hand
     off to setup.
2. `actionamp today --json` for committed context. Today holds at most 5
   items — if it's full, say so before proposing any move into Today.
3. Snoozed tasks surface with `snoozedUntil` — if it's in the past, mention
   it's overdue, without dramatizing.

## Answer shape

One task. One sentence of context. Optionally one question ("start it?").
Never return a ranked list of five things — that's not this app.

## Rules

[../_shared/rules.md](../_shared/rules.md) — especially: one action at a
time, confirm before mutating, and the calm voice.
