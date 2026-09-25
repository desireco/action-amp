---
name: aa-research
description: >
  Research an ActionAmp task or project and file the useful sources into it.
  Use when the user says "research this", "find resources for X", "look
  into <task>", "collect links for my project", or wants background
  gathered before starting work.
---

# Task research

Gather first, write once. You read the web; ActionAmp gets the distilled
result.

## Steps

1. Read the target. `actionamp task show <id> --json` →
   `{ task: { description, project?: { id, name }, goal? } }` — match by
   description or permalink when the user gives anything other than an id
   (ids come from `now`, `today`, or `project show`). For a project as the
   target: `actionamp project show <id> --json`.
2. See what's already filed: `actionamp resource list --project <id> --json`
   → `{ resources: [{ id, title, url, notes }] }`. Don't re-gather what's
   there; fill the gaps.
3. **Research** with your own web tools. Prefer primary sources and official
   docs; 3–5 strong sources beat a pile of tabs. Extract what matters for
   *this* task, not a general overview.
4. **Propose, don't apply**: a short summary of what you found, a refined
   task description if the research sharpened the goal, and the resource
   list — title, url, one line on why it matters. Get an explicit OK.
5. Apply each approved resource:

```sh
actionamp resource add "<title>" --project <projectId> --url <url> --notes "<why it matters>" --json
```

6. The refined description has nowhere to land — the CLI cannot edit task
   text. Present it in the conversation for the user to paste into the app,
   and say so plainly. Don't pretend it was saved.

## Hard rules

- **No autonomous writes.** Resources land only after the user approves
  them, one at a time.
- Resources live on a project. If the task has no project, ask before
  creating one (`project create`) — or file nothing and just report.
- Never delete or overwrite existing resources to make room; `resource
  delete` needs an explicit user instruction.
- Cite honestly: the url carries the source, the notes carry the why. If
  you didn't actually fetch it, don't file it.

[../_shared/rules.md](../_shared/rules.md)
