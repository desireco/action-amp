---
feature: focus-engine-v2
status: ready
spec_owner: discover
build_owner: build
---

# Feature: Focus engine v2 — moment-aware matcher

## Summary

Add the **time-available + energy** refinement layer to the What Now matcher,
on top of the existing priority → size → oldest sort. The user sets the moment
they're in (two one-key selectors: time, energy); the matcher re-ranks Today's
candidates to fit it; the "why this" line (built in `focus-why-transparent`)
explains the fit in plain English. This is FEATURES.md F10's explicitly-planned
"refinement layer" — the MVP priority sort is live, this is the next layer on
top of it.

## Why

The matcher today (`tasks/operations.ts` `getTopTask`) ranks by priority →
size → oldest. That's honest and transparent, but it ignores the one thing
that actually determines whether you can do a task *right now*: **how much
time you have and what your energy is.** An Important XL task ranked #1 is
useless advice at 4pm with 15 minutes and low energy. The product's thesis is
that it optimizes *the decision* — and a decision that ignores the moment
isn't really a decision, it's a sort.

This is a **planned layer, not a speculative bet.** FEATURES.md F10 states it
directly: *"Time-available, energy, and tags are refinement layers added
later, on top of priority + size."* The question was always when, not whether.
It's sequenced after the front-door fixes (first-run, auth, the transparent
"why" line) because those unblock acquisition; this one improves the quality
of the core loop for users already inside.

### On not copying competitors

Competitive research (`docs/research/focus-engine-competitive-2026-06-27.md`)
found no competitor auto-matches on energy — they surface state and let the
user place tasks manually. That's **context, not a veto.** ActionAmp's entire
reason to exist is that every other app makes the safe choice (open to a
list); doing what Tiimo does would erase the wedge. The matcher is the
differentiation. It's built on the product's own terms below, not on theirs.

## Done-conditions

- [ ] **The What Now card surfaces a moment bar** with two selectors:
      - **Time available** — `15m / 30m / 1h / 2h+` (FEATURES.md F9).
      - **Energy** — `low / medium / high` (F9).
      Each settable with one keystroke (`T` cycles time, `G` cycles energy —
      per the existing shortcut set in FEATURES.md §6). Defaults inferred from
      time-of-day (morning → high, post-lunch → low), overridable, and the
      override persists for the session (not forever).
- [ ] **The matcher re-ranks within the existing sort, never across priority.**
      `getTopTask` becomes: in-progress override → priority tier → **within a
      tier, prefer tasks that fit the moment** (size ≤ available time; energy
      tag ≤ selected energy) → size → oldest. **Priority is never demoted by
      time/energy** — an Important task stays above a Normal one regardless of
      fit. (This is the resolved version of the old "override" question:
      time/energy are tie-breakers *inside* a tier, not overrides of it.)
- [ ] **Time/energy use the existing `Tag` model**, not new columns. Reserved
      tag names: `~15m`, `~30m`, `~1h`, `~2h+` for time; `low-energy`,
      `med-energy`, `high-energy` for energy. A task's effective energy
      defaults to **medium** when untagged (so untagged tasks aren't
      penalized). No schema migration.
- [ ] **If time/energy are unset, behavior is identical to today** (priority →
      size → oldest). The refinement is strictly additive; the MVP fallback is
      preserved. Verified by the existing `getTopTask` tests still passing
      unchanged when no moment is selected.
- [ ] **The "why this" line reflects the moment** (depends on
      `focus-why-transparent` shipping): e.g. *"Important, fits in 30 min, and
      you said energy is low."* When the top task *doesn't* fit the moment,
      the line says so honestly: *"Important, but it's XL and you have 30 min
      — sure?"* — never silently demotes, never hides the mismatch.
- [ ] **The matcher never auto-starts a task or removes user agency.** It only
      re-orders and explains. The user still clicks "Do this." No nudges, no
      "you've avoided this" counts (banned by PRODUCT.md).
- [ ] **The moment bar is calm, not crowded.** Per PRODUCT.md "calm over
      features / whitespace is the point": the bar is a single quiet row above
      the card, the selectors are unobtrusive (segmented controls or chips,
      not a form), and it collapses to a one-line summary when set ("30 min ·
      low energy"). If it can't be made to feel calm in implementation, that's
      a finding — raise it in the review, don't ship a crowded home screen.
- [ ] **Pro-only gate.** Energy/time tags are Pro features per PRICING.md §4;
      gated via `isPlanActive` (depends on `entitlement-enforcement`). FREE
      users get the priority matcher (today's behavior) + the moment bar in a
      read-only/disabled state with a calm "Pro" affordance.
- [ ] **Tests:** Vitest cases for each ranking branch — moment-unset falls
      back to today; within-tier fit preferred; priority never crossed by fit;
      untagged-task energy defaults to medium; the "why this" string for:
      fits-the-moment, doesn't-fit, moment-unset.
- [ ] **`wasp compile` passes; existing `what-now` e2e updated and green.**
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No "AI suggest" / learned model.** Explicitly Phase 2 (FEATURES.md §8).
  v2 is a transparent rules engine — the rules are visible in the "why" line.
- **No multi-task What Now** (show 3 cards) — separate spec.
- **No calendar integration.** Sunsama's lane, not ours.
- **No removal of the priority-first fallback.** Additive only.
- **No new `Task` columns.** Time/energy live as tags; `size` already exists.
- **No gamification.** No streaks, no avoidance-counts, no guilt UI.
- **No automatic moment inference the user can't see or override.** The
  time-of-day default is a starting suggestion, shown explicitly and editable.

## Open questions

- **Moment bar placement/format.** Above the card (lean) vs inline in the
  context line. Build: implement above-card first (simplest, least likely to
  crowd the card); if review finds it heavy, move to the context line. Note
  the choice.
- **Tag input friction.** Energy/time tags set at triage add a step (mild
  tension with the capture-thesis). Resolution for v1: **tags are optional and
  set later** (on the task detail / via the moment bar's "this task is..."
  affordance), never required at capture. Inference from size is a later
  refinement if tagging proves too much friction — not in this spec.

## Prototypes

_(none yet, but the moment bar should be eyeballed against the existing What
Now card before locking the placement. See `docs/mockups/` for the current
card visual; the bar is a new row, not a redesign.)_
