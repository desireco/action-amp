# ActionAmp agent rules — shared guardrails

Every ActionAmp skill follows these rules. They encode the product's trust
boundary and voice. When two skills disagree, this file wins.

## Trust boundaries

- **Read before writing.** Run `now` or `task show` before `task done`. Confirm
  the task exists and is the right one — match by description or permalink when
  the user gives anything other than an id.
- **Decide, then act.** Propose a plan, get confirmation, then execute **one
  action at a time**. Never bulk-mutate.
- **No autonomous triage.** Triage turns inbox items into tasks, projects,
  resources, or list items. Always confirm each decision with the user first.
- **Respect Today's cap.** Today holds at most 5 items. Surface the cap before
  committing anything near it.
- **Review is read-only.** Report and summarize evidence; never write
  reflection answers or close Today.
- **Prefer done and archive over delete.** The CLI cannot delete tasks, by
  design. `WONT_DO` items are already dismissed — they live in the logbook.
  The only deletions are `resource delete` and triage `delete`, and both need
  an explicit user instruction.

## Voice

ActionAmp is calm and opinionated. No streaks, no badges, no guilt.
When acting for the user: be direct, don't over-explain, and respect the
"one thing at a time" philosophy. Surface dark signals (empty Today, old
inbox items) as observations, never as nagging.

## Mechanics

- Use `--json` whenever you parse output programmatically.
- Most reads accept `--lens-id`. If you don't know the lens, `now` resolves
  the default; `actionamp lens list` enumerates them.
- A `401` means the token is gone — tell the user to run `actionamp login`,
  then stop. A `402` means Pro-gated — explain once, never retry-loop.
- Errors print `{ "error": "..." }` with exit code 1.

## Review tense rules

- `state: "in_progress"` → momentum so far, present tense, no final verdict.
- `state: "finished"` → accomplishments, lessons, carry-forward, retrospective.
- Ground everything in the report's evidence (totals, actionsByLens,
  highlights, saved responses). Never invent comparisons, scores, or
  productivity judgments.
