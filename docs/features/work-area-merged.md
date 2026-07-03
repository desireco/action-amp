---
slug: work-area-merged
title: "Merged Work Area + activity log"
feature_area: focus
status: missing
spec: work-area-merged.md         # draft
verified: 2026-07-03
---

# Work area merged

**Wanted.** Collapse `/app` + `/app/today` into one Lens-scoped page (hero +
Today | Done columns). Three reshaping rules: (1) no completion circle anywhere
— complete only from focus mode; (2) a timestamped activity log per task
(`Started/Paused/Completed/Not doing` + user notes via a `kind` enum on
`TaskUpdate`, surfaced nowhere today); (3) `NOT_DOING` → lossless archive.

**Today.** Not built. Reverses WORKFLOW.md §5.4 "two surfaces" → one.

**Spec.** `docs/specs/work-area-merged.md` (`draft`). Prototype at
`docs/mockups/today-merged.html`.

**Why it matters.** Product-quality polish on the wedge surface itself. Sits in
the post-gauntlet tier — surfaces-and-logging refactor, not selection logic
(`getTopTask` is untouched, so independent of focus-engine-v2).
