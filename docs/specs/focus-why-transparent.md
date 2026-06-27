---
feature: focus-why-transparent
status: done
spec_owner: discover
build_owner: build
---

# Feature: Transparent "why this" for What Now

## Summary

Enrich the single line under the What Now task so it states the *actual* reason
that task was ranked first — in plain English, not a template. Today the line
is hardcoded as `"Because it's" + priority + " and due today"` regardless of
what actually decided the ranking (see `WhatNowPage.tsx:100-102`). This spec
makes it reflect the real signal: in-progress state, priority, size-fit, and
overdue/due-today, composed dynamically from what `getTopTask` actually did.

## Why

Two reasons, one practical and one strategic.

1. **PRODUCT.md names transparency as load-bearing:** *"Transparent by design
   — a one-line 'why this?' under the suggestion. The algorithm is never a
   black box; users can always see why and override."* Today the line is
   static copy that often lies (says "due today" even when the task isn't, or
   omits that it's #1 because it's already in-progress). That's a black box
   wearing a transparency costume.
2. **Competitive research (2026-06-27)** found **no competitor** in the
   focus/todo category does honest explainability well — they hide the list or
   pick manually. ActionAmp's defensible position is *transparent selection*;
   this spec is the cheapest possible expression of it. It requires **no
   matcher change, no new inputs, no schema change** — it's purely surfacing
   what `getTopTask` already computes.

This is deliberately split off from `focus-engine-v2` (the auto energy/time
matcher), which stays `draft` because the evidence says auto-matching is
unvalidated and may violate the calm brand. Transparency is the win that
doesn't depend on that bet.

## Done-conditions

- [ ] **The "why this" string is composed from the actual ranking factors.**
      In `WhatNowPage.tsx` (and/or a small helper), build the reason from the
      task's real state, in priority of signal:
      1. If `startedAt != null` → **"You're already doing this."** (the Now
         state is the strongest signal; it always wins — see `getTopTask`'s
         in-progress sort).
      2. Else if `priority === IMPORTANT` → lead with "Important".
      3. Else if `priority === LOW` → "Quick win" only if size is S/M, else
         "Low priority".
      4. Append due/overdue context *only when true*: "due today" /
         "overdue" / "due tomorrow". If no dueDate, omit — never fabricate.
      5. Append size-fit only when it adds info ("fits in 15 min").
- [ ] **The line never states a reason that isn't true.** No "due today" for a
      task without a dueDate; no "Important" for a Normal task. Verified by a
      Vitest case per branch above (in-progress, important+overdue,
      normal+nodate, low+small, etc.).
- [ ] **Tone matches the brand.** Calm, direct, no exclamation, no guilt.
      E.g. `"You're already doing this."` / `"Important and overdue."` /
      `"Quick win — due today, fits in 15 min."` (not "🔥 DO THIS NOW!").
- [ ] **The What Now card renders the composed string** where it currently
      renders the hardcoded `whyEmphasis`. The `WhatNowCard` component's
      `why` / `whyEmphasis` props may need to become a single `reason` string
      — Build's call, keep the visual identical.
- [ ] **`getTopTask`'s return is sufficient to compose the line** — confirm it
      already includes `startedAt`, `priority`, `size`, `dueDate`, `status`.
      If `dueDate` isn't selected today, add it to the include (no schema
      change; just the query select). State in the review.
- [ ] **No matcher logic changes.** `getTopTask` ranking stays priority → size
      → oldest (plus the in-progress override). This spec only changes *what
      we say about* the result, not *how* the result is chosen.
- [ ] **`wasp compile` passes; existing `what-now` e2e still green** (it may
      assert on the old copy — update the test to match the new honest line).
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No energy/time matcher.** That's `focus-engine-v2` (still `draft`).
- **No moment bar / time-available selector.** Same — `focus-engine-v2`.
- **No new task fields or tags.** Uses only what `Task` already has.
- **No multi-line explanation or expandable "show your work" UI.** One line.
- **No "why not the others" comparison.** Explaining the pick, not the rest.
- **No change to the Now/Next state machine.** Purely presentational.

## Open questions

- **`dueDate` in the query.** Confirm `getTopTask` selects it today; if not,
  add to the Prisma include (trivial). Build resolves; not a blocker.
- **Exact copy strings.** The examples above are the spec's lean; Build may
  refine wording for flow as long as every clause stays truthful and on-brand.
  Note final copy in the review.

## Prototypes

_(none — a one-line string change in an existing card; no new UI paradigm.
The current What Now card visual is unchanged.)_
