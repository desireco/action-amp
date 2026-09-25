---
name: aa-breakdown
description: >
  Break an ActionAmp goal into a doable structure of projects and tasks.
  Use when the user says "break down this goal", "turn my goal into
  projects", "plan out <goal>", "what steps does this goal need", or asks
  to make a goal concrete.
---

# Goal breakdown

A goal is a direction; projects and tasks make it walkable. Propose the
smallest structure that works — never pad.

## Steps

1. Find the goal: `actionamp goal list --json` →
   `{ goals: [{ id, name, permalink, description, projectCount, progress,
   nextProject }] }`. Match by name when the user gives one; a goal already
   at `progress: 1` is done unless asked.
   `actionamp goal show <id> --json` returns
   `{ goal: { name, description, projects: [{ id, name, tasks: [...] }] } }`
   — the description is the intent, honor it.
2. Ground before proposing: `actionamp project list --json` →
   `{ projects: [{ id, name, description, type, goal: { id, name } | null,
   openCount, doneCount, nextAction }] }`. Projects whose `goal.id` matches
   are work already in flight — reuse them instead of creating
   near-duplicates.
3. **Propose the structure** in conversation: 1–3 projects max (one is
   fine), each with a one-line purpose, and concrete tasks under each —
   every task phrased as the next physical action, small enough to finish
   in one sitting. If the goal needs research before it can be decomposed,
   say that and hand off to `aa-research` instead of inventing filler.
4. **Show the plan and get an explicit OK** — per project or all at once.
5. Apply one action at a time:

```sh
actionamp project create "<name>" --goal-id <goalId> --description "<purpose>" --json
actionamp project add-task "<description>" --project-id <projectId> --json
```

   (`project create` prints the new `project.id`; feed it to `add-task`.)
6. Close the loop: re-run `actionamp goal show <id>` and `project list
   --json` to confirm the structure landed, report what was created, and
   point at the first task worth starting — `aa-now` picks it up from there.

## Hard rules

- **No autonomous creation.** The plan is applied only after the user
  approves it. No exceptions, even when the structure seems obvious.
- **Smallest structure that works.** One project with three real tasks
  beats three projects with stubs. Never create placeholder tasks to look
  complete.
- Reuse existing projects; ask before adding a second project to a goal
  that already has one in flight.
- Tasks are created unscheduled — nothing lands on Today unless the user
  asks, and Today holds at most 5 items (check `actionamp today --json`
  before committing anything near the cap).

[../_shared/rules.md](../_shared/rules.md)
