# Review: focus-why-transparent

<!-- Build owns this file. Discover reads it to sign off. -->

## What changed

On `main`. The one-line "why this?" under the What Now task is now composed
from `getTopTask`'s actual ranking factors instead of hardcoded copy that
often lied ("due today" for an undated task; omitting that #1 was in-progress).
This is the cheapest expression of ActionAmp's one defensible position
(transparent selection) — no matcher change, no schema change.

- `webapp/src/app/focusWhy.ts` (new) — pure `composeWhy(task) → {lead, detail}`
  in signal-priority order mirroring `getTopTask`'s sort: `startedAt` (terminal,
  "You're already doing this.") → IMPORTANT → LOW/size ("Quick win" vs "Low
  priority") → due/overdue (ONLY when a dueDate exists) → size-fit (S/M only).
  Empty when nothing truthful to add.
- `webapp/src/app/focusWhy.test.ts` (new) — 14 cases: every branch + the
  load-bearing "never lies" invariant.
- `webapp/src/app/WhatNowPage.tsx` — wire `composeWhy` into the why/whyEmphasis
  props. Lead-less (NORMAL) reasons promote detail → `why` so they render as
  plain text, not bold amber. Dropped the now-dead `priorityLabel` helper.
- `webapp/src/components/ui/WhatNowCard.tsx` — gate the why line on
  `(why || whyEmphasis)` and render them independently (was gated on `why`
  alone, which dropped detail-only reasons). +1 regression-guard test.

Commits:
- `2b8abe5` spec: ready → building
- (impl) honest "why this" line for What Now
- `d9eca00` fix NORMAL-priority why-line being dropped (review)

## Gates run

- **Cold-context reviewers (2, distinct angles, fresh context):**
  - **Reviewer A — truthfulness/logic:** walked every (startedAt × priority ×
    dueDate × size) combination; the helper itself never lies. Confirmed
    `getTopTask` returns all needed fields (full-row findMany, no select —
    startedAt/priority/size/dueDate/status all present, resolving the spec's
    open question 1). **Found the wiring blocker (B1).**
  - **Reviewer B — wiring/brand/tests/dead-code:** independently found the SAME
    wiring blocker; confirmed `priorityLabel` truly dead, `formatWhen`/
    `sizeLabel` not orphaned, component test unaffected, "Quick win" on-brand,
    e2e asserts nothing on the why copy (so the spec's "update the e2e if it
    asserts old copy" is moot).
  - **Verdict: 1 real blocker (both agree) → fixed → re-gated clean.** See
    Findings. Both confirmed the helper logic was sound — the bug was purely in
    how the card rendered a lead-less reason.
- **Diagnostics:** `wasp compile` — exit 0, three times (impl, after fix, final).
- **Tests:** `npm test` — **210 passed (210)**, exit 0. Was 195 → +14 focusWhy
  + 1 card regression guard.
- **e2e:** `what-now.spec.ts` does NOT assert on the why-line copy (only task
  titles + Now/Next context), so it's unaffected. Not re-run this session.

## Done-conditions

Each predicate from `docs/specs/focus-why-transparent.md` → verdict + evidence.

- [x] "Why" composed from the actual ranking factors — **PASS** — `focusWhy.ts`
      `composeWhy`, signal priority mirrors `getTopTask`'s sort:
      1. `startedAt != null` → "You're already doing this." (`:78`, test `:35`)
      2. IMPORTANT → "Important" (`:85`, tests `:44–59`)
      3. LOW → "Quick win" (S/M) / "Low priority" (L/XL) (`:87`, tests `:63–71`)
      4. due/overdue appended ONLY when dueDate exists (`:57–67`, invariant tests `:98–113`)
      5. size-fit "fits in N min" appended only for S/M (`:70–74`)
- [x] The line never states a reason that isn't true — **PASS** — 4 "load-bearing
      invariant" tests (`:98–113`) assert: never "due today" for an undated
      task; never "Important" for a NORMAL task; never "overdue" for a future
      task. Reviewer A walked all 64+ combinations — no lying combination found.
- [x] Tone matches the brand — **PASS** — Reviewer B inspected every emitted
      string: zero exclamation marks, zero guilt/FOMO. "Quick win" is the only
      borderline-gamified term and is spec-sanctioned. Calm/direct throughout.
- [x] The What Now card renders the composed string — **PASS (after fix)** —
      originally the card gated the `<p>` on `{task.why && …}` (the lead),
      dropping NORMAL-priority reasons entirely. Fixed: gate on
      `(why || whyEmphasis)`, render independently. Regression-guard test added.
- [x] `getTopTask`'s return is sufficient — **PASS (resolved, no query change)**
      — `getTopTask` uses `findMany` with `include: {project, goal}` and NO
      `select`, so all scalar fields (startedAt, priority, size, dueDate,
      status) are returned. No schema change, no query select change needed.
- [x] No matcher logic changes — **PASS** — `getTopTask` sort
      (`operations.ts:136–156`) untouched. Only `WhatNowPage` consumption.
- [x] `wasp compile` passes; existing what-now e2e green — **PASS** — compile
      exit 0; e2e asserts nothing on the why copy so unaffected.
- [x] Cold-context reviewer passes — **PASS** — after the wiring fix.

## Findings

**Accepted (fixed in `d9eca00`):**
1. **[BLOCKER, both reviewers] NORMAL-priority why-line dropped.** `composeWhy`
   correctly returns `{lead:'', detail:'Overdue'}` for a NORMAL overdue task,
   but `WhatNowCard` gated the whole `<p>` on `{task.why && …}` (the lead) →
   the truthful detail vanished for the default priority. Fix: card gates on
   `(why || whyEmphasis)` and renders independently; wiring promotes detail →
   `why` (plain) when there's no lead so it doesn't render as bold amber.
   Added a regression-guard component test.

**Accepted nits (deferred, non-blocking):**
- **Internal "today" inconsistency** (Reviewer A, N2): `formatWhen` (the meta
  `due` label) treats past dates as "today" (`diffDays <= 0`), while `dueClause`
  (the why line) distinguishes "overdue" (`< 0`) from "due today" (`=== 0`). So
  an overdue task can show meta "due today" + why "Overdue" simultaneously.
  Both are individually defensible; flagged for Discover to harmonize if it
  reads as a contradiction. Not a lie from composeWhy.
- **Joiner grammar asymmetry** (Reviewer A, N3): the lone-overdue clause uses
  "and" ("Important and overdue"); multi-clause uses an em-dash list
  ("Important — due today, fits in 15 min"). Grammatical but undocumented.
- **"Quick win" tone** (Reviewer B): mild gamification vocab; spec-sanctioned,
  not a streak/badge. Watch-item if brand tightens.
- **e2e doesn't assert the why line** (both): the spec's "update the e2e if it
  asserts old copy" is moot (nothing to update), but no end-to-end check exists
  that the line renders. Component-level guard covers it; an e2e assertion is a
  nice follow-up.

**Rejected:** none.

## Verdict

**ready-for-signoff.**

All done-conditions PASS; the one review blocker (both reviewers) is resolved;
`wasp compile` green; **210 tests pass** (+15 new: 14 focusWhy + 1 card guard).

This is the cheapest possible expression of the transparent-selection thesis —
no matcher change, no schema change, surfacing what `getTopTask` already
computes. The helper is pure and fully tested; the load-bearing "never lies"
invariant holds across every input combination. The one fix needed was a
rendering bug, not a logic bug.

No non-code gates block this one — it's pure code, fully verified at the unit
level. The only manual step worth doing is a visual spot-check of the What Now
card across a few task states (in-progress, important+overdue, normal+overdue,
normal+nodate) to confirm the line reads as intended. Once Discover signs off,
this is `done`.
