---
name: aa-hygiene
description: >
  Audit and tidy an ActionAmp account — stale someday projects, dismissed
  tasks, misfiled resources, aging inbox, Today overload. Use when the user
  says "clean up my tasks", "audit my projects", "review everything and tell
  me what to remove", "what can I get rid of", or wants a general tidy of
  their todo state.
---

# Account hygiene

Examine everything, propose removals, execute confirmed items one by one.

## Audit sweep

1. `actionamp lens list --json` — every lens, with counts.
2. Per lens: `actionamp project list --lens-id <id> --json`, then
   `project show <id> --json` for anything with open work.
3. `actionamp inbox list --json` — age of oldest items.
4. `actionamp today --json` — cap check (max 5).

## What to look for

- **Stale someday projects** — untouched since long ago, all tasks SOMEDAY.
  Propose archiving the *project* (web app) or moving tasks to someday.
- **Dismissed tasks** — `status: "WONT_DO"`. Already terminal: they live in
  the logbook as wont-do history. Tell the user they're already cleared —
  do not chase deletion; the CLI has none.
- **Misfiled resources** — a resource whose content clearly belongs to
  another project (a restaurant link inside an automation project).
  `actionamp resource list --project <id>` first, always. Removal needs an
  explicit OK — `resource delete` is one of only two destructive commands.
- **Inbox age** — items older than a week or two are decisions avoided.
  Propose triage (that skill's confirmation rules apply).
- **Today overload** — more committed than the cap allows or realistic.
  Suggest moving one or two to upcoming.

## Removal rules (the short version)

| Target | Possible via CLI | Notes |
|---|---|---|
| Task | `done` only | completion feeds reviews |
| Inbox item | triage `archive` / `delete` | confirm each |
| Resource | `resource delete` | confirm, irreversible |
| Project | web app | propose, don't attempt |

Present findings as a table, get per-item confirmation, execute one action
at a time, then re-run the sweep numbers to show the after-state.

[../_shared/rules.md](../_shared/rules.md)
