---
feature: focus-engine-v2
status: draft                  # was ready; flipped 2026-07-03 (review found 3 definition gaps)
gated_by: matcher-validation.md        # must reach a BUILD verdict first
depends_on: tag-management.md          # the moment tags need a UI that doesn't exist
spec_owner: discover
build_owner: build
---

# Feature: Focus engine v2 — moment-aware matcher

> **Status: `draft`** (flipped from `ready` 2026-07-03). Two things keep it out
> of `ready`: (1) the **matcher-validation gate** — run
> `docs/specs/matcher-validation.md` (the zero-cost manual test) and reach a
> **BUILD** verdict before pulling; (2) **three definition gaps** the review
> found, documented below. The wedge-defensibility roast (4.6/10, RESHAPE) says
> the matcher is the only real moat and currently the weakest shipped part —
> which is exactly why this spec can't be `ready` with the surface composition
> and a core prerequisite undefined.

## Summary

Add the **time-available + energy** refinement layer to the Next matcher,
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

- [ ] **The Next card surfaces a moment bar** with two selectors:
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
      preserved. The existing `getTopTask` tests are **updated** to assert both:
      (a) moment-unset → identical ranking to today; (b) moment-set →
      within-tier re-rank, priority never crossed. *(Adding a within-tier
      re-rank changes the comparator; the tests as written today will change —
      that's expected, not a regression.)*
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
- [ ] **`wasp compile` passes; existing `next` e2e updated and green.**
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No "AI suggest" / learned model.** Explicitly Phase 2 (FEATURES.md §8).
  v2 is a transparent rules engine — the rules are visible in the "why" line.
- **No multi-task Next** (show 3 cards) — separate spec.
- **No calendar integration.** Sunsama's lane, not ours.
- **No removal of the priority-first fallback.** Additive only.
- **No new `Task` columns.** Time/energy live as tags; `size` already exists.
- **No gamification.** No streaks, no avoidance-counts, no guilt UI.
- **No automatic moment inference the user can't see or override.** The
  time-of-day default is a starting suggestion, shown explicitly and editable.

## Open questions

- **Moment bar placement/format.** ~~Above the card (lean) vs inline in the
  context line.~~ **RESOLVED 2026-07-04** — see Definition gaps §B below and
  `docs/mockups/moment-bar.html`. Above-card, segmented controls, default-
  collapsed, time-of-day inference stated explicitly.
- **Tag input friction.** Energy/time tags set at triage add a step (mild
  tension with the capture-thesis). Resolution for v1: **tags are optional and
  set later** (via `tag-management`'s Task-detail chips, now `ready`), never
  required at capture. Inference from size is a later refinement if tagging
  proves too much friction — not in this spec.

## Definition gaps (2026-07-03 review — why this is `draft`, not `ready`)

The rest of the spec is sound, but three things would cause Build to guess or
build the wrong thing. **Gap B is now resolved (2026-07-04); A and C remain.**
All three must be resolved before flipping back to `ready`.

### Gap A — depends on a tag-management UI that does not exist

The spec leans on reserved tag names (`~15m`, `~30m`, `~1h`, `~2h+`,
`low-energy`, `med-energy`, `high-energy`) on the existing `Tag` model. **But
there is no tag UI anywhere in the app today.** Verified 2026-07-03: tags are
only created at triage via `@`-parsing (`inbox/operations.ts:155`), never
edited, never listed on Task detail, and there are no reserved tag names. The
moment matcher is inert if users cannot tag tasks with energy/time.

This is a **missing prerequisite, not an open question.** The "tags are
optional and set later (on the task detail / via the moment bar's 'this task
is...' affordance)" line in Open Questions hand-waves a UI that does not exist.

**Resolution path:** `tag-management` becomes its own spec (UI to view/add/
remove tags on a Task, plus seeding the reserved names). `focus-engine-v2`
hard-depends on it (`depends_on` above). Until that spec exists and is `ready`,
this spec cannot be `ready`.

### Gap B — RESOLVED 2026-07-04 (moment-bar mockup locked)

The home screen is the product's most load-bearing surface — the roast's whole
point is that it has to *surprise*. This spec previously left the moment bar's
composition (placement, format, collapse, inference) to Build or "a finding in
review" — too much undefined for the wedge surface.

**Resolved:** the mockup at `docs/mockups/moment-bar.html` is locked. It
renders all three states (collapsed-inferred, expanded, collapsed-mismatch)
against the real `--aa-*` tokens and the shipped What Now card. The decisions:

- **Placement: above the card, inside the card's top padding.** The bar is
  metadata about the moment, not the task — so it sits above the title, not
  inside the context line (would crowd the most-read line) and not below the
  why-line (would read as a verdict on the picker).
- **Format: two segmented controls** (time: 15m / 30m / 1h / 2h+; energy:
  low / med / high). Not chips (imply multi-select), not a form (implies
  commitment). Active segment in teal — system/state, never amber.
- **Collapse: default-collapsed to one quiet line** —
  `30m · low energy — change`. Click the line or press `T`/`G` to expand;
  collapses on selection/blur. The collapsed line is the whole point.
- **Inference: time-of-day default, stated explicitly** —
  `30m · low energy — inferred from time of day`. Morning→high, post-lunch→low,
  evening→medium. Once overridden, the override sticks for the session and the
  "inferred" tag disappears. Never hidden, always overridable.
- **Mismatch: calm + truthful, never blocking.** When the moment disagrees
  with the top task, the why-line says so ("...but it's XL and you have 15
  min. Sure?"). No red, no nag; priority is never demoted by fit.
- **Not here: no badges/streaks (banned), no third selector (two is the cap),
  no persistence beyond the session.**

Build implements to the mockup. The "above-card first, move if review finds it
heavy" open question below is closed — above-card is locked.

### Gap C — the fallback-invariant test claim is incorrect

The spec asserts: "if time/energy are unset, behavior is identical to today,
verified by the existing `getTopTask` tests passing unchanged." But adding a
within-tier re-rank changes the comparator structure of `getTopTask`; the
existing tests will need **rewriting** to assert the new within-tier ordering
(they currently assert a strict priority → size → age order). The invariant
*behavior* (no moment set → same ranking as today) is the right thing to
verify; the claim that the *existing tests* verify it unchanged is wrong.

**Resolution path:** rewrite the done-condition to "the existing `getTopTask`
tests are updated to assert both: (a) moment-unset → identical ranking to
today; (b) moment-set → within-tier re-rank, priority never crossed. The tests
as written today will change; that's expected, not a regression."

**RESOLVED 2026-07-04** — the done-condition above is rewritten as suggested.
Gap C is closed; only Gap A (tag-management shipping) and the matcher-test
gate remain.
