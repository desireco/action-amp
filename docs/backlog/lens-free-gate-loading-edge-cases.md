---
kind: bug
status: draft
priority: low
feature: custom-lenses
parent: reviews/custom-lenses.md
---

# Lens FREE-gate edge cases during loading + self-heal

Spawned from the custom-lenses review (cold-context reviewer finding S3 + S4).
Both are low-severity (the server guard is the real boundary; no data leaks),
but they produce transient UI glitches worth fixing.

## S3 — `selectLens` FREE-gate transiently bypassed while lenses load

`src/app/AppShell.tsx` `selectLens` derives the gating decision by looking up
the lens in the loaded `lenses` array. When `lenses.length === 0` (first paint,
before the query resolves), the fallback `lensOptions` use literal ids
(`"Work"`/`"Me"`), so `lenses.find(id === "Work")` returns undefined → the gate
short-circuits → `setLens("Work")` runs → the literal string "Work" is
persisted to `aa-lens-id` and children render briefly un-gated. It self-heals
once lenses load (the stale id falls through to `lenses[0]`, clamped to
PERSONAL). No data leak (server guard), but the FREE gate flashes wrong content
for a frame and stores a junk id.

**Fix:** gate on the option's `proLocked` flag (already correctly computed on
the fallback options) instead of re-deriving from the lens list, OR disable the
switch until lenses load.

## S4 — self-heal effect resets `workGated` on stale-id correction

`AppShell.tsx` self-heal effect unconditionally sets `workGated(false)` when it
corrects a stale id. If a FREE user has the Work gate open and anything causes
`activeLens.id` to differ from `lensId` (refetch, clamp re-resolving), the gate
closes and Me content flashes, even though the user never picked a new lens.

**Fix:** tie the `workGated` reset to an actual lens selection (in `selectLens`),
not to id self-healing.

## Done-conditions

- [ ] FREE user clicking Work before lenses load does NOT bypass the gate (the
      `proLocked` flag is the source of truth, not the lens lookup).
- [ ] `workGated` only resets on an explicit lens selection, not on self-heal.
- [ ] A test reproduces both (loading state + self-heal-during-gate).
