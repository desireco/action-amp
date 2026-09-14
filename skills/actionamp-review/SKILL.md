---
name: actionamp-review
description: >
  Report what the user accomplished in ActionAmp over a week or month, from
  read-only evidence. Use when the user says "how was my week", "what did I
  get done", "monthly review", "show my progress", "what have I accomplished
  lately", or asks about momentum, streaks of work, or focus time.
---

# Reviews — evidence only

Reviews are read-only. You report; the user reflects in the app.

## Commands

```sh
actionamp review week --json            # current week
actionamp review week --previous --json # last week
actionamp review month --json           # current month (--previous, --lens-id)
actionamp logbook --json                # full history when deeper digging is needed
```

## Report structure

Ground everything in the report payload — `totals`, `actionsByLens`,
`highlights`, `tasks`, `projects`, `goals`, `weeklySlices`, `checkIn`,
`reflection`, `emphasisGoal`. Never invent comparisons, scores, grades, or
productivity judgments.

1. **Counts** — actions, finished projects/goals, focus minutes, split by
   lens when more than one lens is active.
2. **Highlights** — the meaningful few, in the user's own outcome notes when
   present.
3. **The user's own words** — surface saved `checkIn`/`reflection` responses
   verbatim if any exist.
4. **Carry-forward** — what's open, snoozed-and-overdue, or accumulating
   (inbox size). State as observation: "7 inbox items, oldest from Sep 3."

## Tense rules (from the CLI's own contract)

- `state: "in_progress"` → momentum so far, what's going well, challenges,
  remaining attention. Present tense. **No final verdict.**
- `state: "finished"` → accomplishments, lessons, carry-forward.
  Retrospective language.

## Known dark signals

`focusMinutes` near zero means tasks are completed without `task start` —
effort is invisible, not absent. Empty `checkIn`/`reflection` and zero goals
mean reviews carry no direction layer. Mention once, gently, as an
observation — never as a lecture.

[../_shared/rules.md](../_shared/rules.md)
