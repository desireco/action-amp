# Goal prompt: refine all drafts

> Reusable invocation for the `goal` skill. Drains the Duet refine queue:
> every `status: draft` unit reaches a terminal state (`ready`, held-with-
> documented-gaps, or killed) — serially, with judge verification on each lock.
#
> Invoke:
>   goal "$(cat docs/prompts/refine-all-drafts.md)"
>
> Or paste everything below the `---` into a `goal` invocation directly.

---

## Objective

Drain the Duet refine queue. Every `status: draft` work unit in the repo reaches
a terminal state. This is Discover-side (Track 1) work: no production code ships,
no unit enters `building`. "Complete" here means *refined to its natural end
state*, not shipped — shipping is Build's track, with its own review gate.

## Scope (snapshot at invocation — bounded)

Every file in `docs/specs/`, `docs/backlog/`, `docs/tasks/` whose frontmatter
`status:` is `draft` at the moment this goal starts. Sort the worklist by:
1. `priority` descending (P0 > P1 > P2 > P3)
2. then oldest `created:` date (FIFO)

Units captured *during* this run are **out of scope** — they enter the next run.
This bound prevents the goal from running forever against a live intake.

## Method — serial, one unit at a time (NON-NEGOTIABLE)

1. Build the worklist from the snapshot above.
2. Take the first unit. Invoke the `duet-refine` skill on **that single unit**.
3. **Do not refine two units in parallel, ever.** The Duet protocol's
   one-writer-per-file rule is absolute — parallel refinement corrupts the
   audit log and races Discover's own loop. If the instinct is to fan out,
   suppress it. Serial is the contract.
4. Reach a terminal state for that unit (see below).
5. Commit that unit's transition as its own commit (one unit, one commit).
6. Move to the next unit in the worklist. Do not revisit a held draft this run.

## Terminal states (exactly one per unit)

- **`ready`** — the unit meets the stopping rule (below). Flip
  `status: draft → ready`. This is the success path.
- **held `draft`** — genuine product/scope gaps remain that need a human
  decision or external input. Keep `status: draft`, fill the `## Open questions`
  section with the specific blocker, and add a one-line `## Refine notes` entry:
  *"Held at <date>: <what's missing and who/what unblocks it>."* **This is a
  valid terminal state for this goal** — the unit is refined as far as it can
  go without a decision you can't make. Don't force-lock it.
- **killed** — the idea doesn't earn a slot (roast surfaced a fatal flaw,
  duplicate of existing work, contradicts a locked decision). Flip
  `status: done`, add a one-line `## Why killed` under the body. Don't delete
  the file — the audit log keeps it.

A unit is **not** terminal if it's still `draft` with empty Open questions and
no refine-notes — that means it was skipped, not resolved. Skip is failure.

## Stopping rule (must hold to flip `ready`)

The judge checks each of these, cold, against the actual file:

- [ ] **Summary** is plain-language; a stranger understands what's being built.
- [ ] **Why** names the problem, who has it, and the evidence — with a
      `file:line` citation or a `docs/features/<slug>.md` catalog reference.
      "Users want X" without grounding is a vibe, not a Why.
- [ ] **Done-conditions** are testable predicates (verifiable by grep, a route,
      a screenshot, or a passing test). "Feels good" is not testable.
- [ ] **Decisions locked** records the non-obvious choices + reasoning. If a
      decision reverses another spec, a reversal note exists on *that* spec too.
- [ ] **Non-goals** are explicit.
- [ ] **Open questions** empty, or marked "deferred to Build's discretion."

All six must pass. Any fail → the unit is not `ready`; it's held `draft` with
the gap documented.

## Constraints

- **Never write production code** — nothing under `webapp/`, no `main.wasp.ts`,
  no `schema.prisma`. Prototypes, if any, live in a disposable worktree and are
  discarded. Refine is Discover-side.
- **Never touch a unit that isn't `status: draft`** — not `ready`, `building`,
  `review`, `done`, `blocked`. Those belong to other tracks/states.
- **Respect doc authority** (AGENTS.md hierarchy): `WORKFLOW.md` > `INTERACTION.md`
  > `TRIAGE.md` > reference docs. On conflict, the canonical doc wins; note it.
- **Use the refine skill's routing** — don't reinvent:
  - `roast` on fuzzy/strategic drafts before locking (skip only for small
    mechanical fixes with obvious shape).
  - `goal` skill to convert vibes → testable done-conditions.
  - `scout` / `grep` to ground every code claim; `docs/features/` is the
    code-verified starting point.
  - `agent-reach` / `researcher` for external evidence (market, prior art).
- **Decompose (`parent:` / `children:`) only when a unit fails the one-pull
  test** — too big for one worker, one review cycle, one PR. Not reflexively.
  Default is *not* to split. See `docs/queue.md` §Decomposition.
- **Don't bloat the unit under refinement** — out-of-scope ideas spawned during
  refinement go to `docs/backlog/` as new `kind: backlog, priority: P3` drafts
  (capture via `scripts/duet-capture.sh`), not into the card.

## Judge verification (per `ready` flip)

The worker never marks its own work done — the judge does. Before a unit's
`ready` flip is accepted as terminal-for-this-run, the judge independently
re-reads the file cold and checks all six stopping-rule predicates. A flip is
accepted only if all six pass when read without the worker's assumptions.

Held-draft and killed outcomes also get a judge check: the blocker/kill-reason
must be specific and honest, not a generic "needs more thought."

## Overall done-condition (the goal is complete when ALL hold)

- [ ] Every `draft` unit in the invocation snapshot has a recorded terminal
      state (`ready`, held-with-specific-blocker, or killed-with-reason).
- [ ] No unit was skipped or left in `draft` with empty Open questions and no
      refine-notes.
- [ ] Every `ready` flip passed the judge's cold stopping-rule check.
- [ ] Each transition is its own commit; commit messages reference the slug.
- [ ] Newly-`ready` specs are indexed: `docs/features/README.md` "Planned"
      section + a ROADMAP tier entry (per `scripts/new-spec.sh`'s guidance) if
      the unit is a spec.
- [ ] A summary of outcomes (X ready, Y held, Z killed, with the held/killed
      reasons) is reported at the end.

## Out of scope

- **Build / ship.** No unit enters `building`; no production code is written.
  Ready units sit in the queue for Build to pull (round-robin, or pinned).
- **New captures.** Drafts created during the run are next run's problem.
- **Re-opening decided work.** A previously-killed idea stays killed unless the
  user says otherwise.
- **ROADMAP re-prioritization.** You index new ready specs, you don't reshuffle
  tiers — that's a strategic call, not a refine action.
