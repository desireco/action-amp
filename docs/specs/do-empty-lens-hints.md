---
id: do-empty-lens-hints
kind: spec
title: "Empty Next screen points at work in other lenses"
status: review
priority: P1
feature: tasks
spec_owner: discover
build_owner: build
created: 2026-08-31
depends_on: []
---

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4OMwLG      # linked to the pre-existing board item (issue #5) by hand; sync treats it as write-once

# Spec: Empty Next screen points at work in other lenses

> Source: Jake's issue #5 (board Next). The issue voice, verbatim intent:
> sometimes /do has nothing to do in the active lens — in that case, check the
> other lenses and, if they have available actions, outline how many are there.
> "When I go to do, it will say nothing to do, but you have tasks in work lens."

## Summary

The Next screen's empty state ("Nothing on the table.") stays, but when other
accessible lenses have actionable tasks, each gets one calm line — lens name +
count — and tapping it switches the active lens (which refills the chooser).

## Done-conditions

1. A query (`getOtherLensTaskCounts`) returns, for every lens the user can
   access except the active one, the count of actionable tasks — the same
   `activePoolWhere` predicate that drives the Next card (TODAY/UPCOMING, not
   done, not future-scheduled, not snoozed), so the hint numbers can never
   disagree with what the chooser would show.
2. NextPage's empty state (no picked task, nothing on the table) renders one
   hint per other lens with count > 0: `Work · 3 on the table`. Tapping it
   switches the active lens via the AppShell-provided switcher.
3. No hint renders while loading, for FREE users' locked lenses (hints only
   cover accessible lenses), or when every other lens is also empty.
4. Core logic is unit-tested (count per lens, active lens excluded, empty
   lenses omitted); `wasp compile` + lint pass.

## Non-goals

- No badge/dot in the sidebar or lens switcher (counts there are a separate
  surface; this spec only touches the Next empty state).
- No task titles from other lenses — count + lens name only (the list is
  demoted; the hint is a pointer, not a list).
- No upsell copy for locked lenses.

## Open questions

None — Jake's issue names the exact behavior.
