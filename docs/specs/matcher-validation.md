---
id: matcher-validation
kind: spec
title: "Matcher validation (manual, zero-code) — gates focus-engine-v2"
status: draft
priority: P1
spec_owner: discover
build_owner: discover     # no build; this is a Discover + user research action
created: 2026-07-03
---

# Spec: Matcher validation (the 48-hour manual test)

> This is a **Discover-owned, zero-code** validation action that **gates
> `focus-engine-v2`.** It was previously buried as a prose recommendation in
> ROADMAP.md and the roast. Promoted to a tracked unit so the queue reflects
> that it is real work with a real outcome.

## Summary

Recruit ~20 overwhelmed people, have each dump a real ~20-task list, manually
pick "the one task" + write the "why this?" line using the *intended*
`focus-engine-v2` logic (priority + size-fit + time-available + energy), send
it back, and measure the reaction. Decides whether to build the matcher
as-spec'd, reshape it, or icebox it — **before** any matcher code is written.

## Why

The wedge-defensibility roast (`docs/research/wedge-defensibility-roast-
2026-06-27.md`, aggregate 4.6/10, verdict RESHAPE) found:

- The matcher is the **only real moat** ActionAmp could have.
- It is currently the **weakest shipped part** — an honest priority sort, not
  the "picks the *right* task" the pitch promises.
- The $79.50 price is **not defensible until the matcher surprises** someone.

Load-bearing assumption #2 ("a machine can pick your next task well enough to
trust") has never been tested. This test tests it directly, for zero money,
before Build spends real effort on `focus-engine-v2`.

## Done-conditions (testable)

A complete run produces a written verdict attached to this spec. The verdict is
one of exactly three:

- [ ] **≥20 subjects** recruited from the right audience (r/ADHD,
      r/productivity, r/gtd — or equivalent), each with a real ~20-task list.
- [ ] For each subject: a manual "the one task" pick + a "why this?" line,
      composed using the `focus-engine-v2` intended logic (NOT the shipped
      priority-only sort — the whole point is to test the richer logic).
- [ ] Each subject's reaction captured (verbatim quote + a yes/no/reshape tag).
- [ ] A **tally**: of N subjects, how many said "yes that's right" / "no I'd do
      X" / "reshape."
- [ ] A **verdict written into this spec** (one of three):
  - **BUILD** — clear majority "yes, that's the right one" unprompted →
    `focus-engine-v2` may pull as-spec'd.
  - **RESHAPE** — subjects consistently disagree → revise the logic; document
    the revision here before Build pulls.
  - **ICEBOX** — the logic can't be made surprising → the matcher isn't the
    moat; lean on structure depth + brand instead; demote `focus-engine-v2`.
- [ ] `docs/SUCCESS.md` Bet 2 status updated to reflect the verdict.
- [ ] `focus-engine-v2`'s status + gate updated to match (unblock, revise, or
      icebox).

## Non-goals

- **No code.** This is manual. The point is to validate the logic before any
  engineering effort.
- **No live product test.** We are *not* A/B-testing the shipped matcher — the
  shipped matcher is priority-only and we already know it doesn't surprise. We
  are testing the *intended v2 logic*, applied by a human.
- **No recruitment at scale.** ~20 is enough to see the signal; this is not a
  powered study.

## Open questions

- Recruiting channel: r/ADHD etc. ban self-promo — what's the value-first ask?
  (Lean: offer the analysis free, no product pitch, in the spirit of "I'm
  researching how overwhelmed people decide what to do next.")
- Format: async (DM + reply) vs scheduled 15-min call? (Lean: async first; call
  only for interesting disagreements.)

## Runbook

The procedure, subject instructions, the manual-selection worksheet, and the
"why this?" composition rules live in **`docs/research/matcher-test-runbook.md`**
(already written). This spec points at it; the runbook is the how, this spec is
the done-conditions and the verdict.

## Prototypes

None. (Disposable artifacts, if any session generates them, live in
`docs/research/`.)
