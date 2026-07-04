---
slug: weekly-monthly-review
title: "Weekly + Monthly Review"
feature_area: review
status: missing
spec: weekly-monthly-review
verified: 2026-07-03
---

# Weekly + Monthly Review

**What.** Period debrief surfaces (`/app/review/weekly`,
`/app/review/monthly`, **not yet built**) that collect the window's completed
tasks/projects **grouped by Goal/Project** (not by day, as the Logbook does),
show a **progress delta** vs. the previous period, and surface **stuck/aging**
items (overdue, interrupted-Now >7d, never-Today >30d). A reflection view over
the same data the Logbook shows flat.

**Status today.** Not in code. The Review focus-nav section exists
(`AppShell.tsx`) but contains only "Logbook" — no Weekly/Monthly entries, no
routes. The underlying data is all queryable now (`Task.completedAt`,
`Project.completedAt`, `getGoals` rollup); the missing piece is the period
view over it.

**Planned op.** `getReview({ lensId, period, for })` — one lens-scoped query
returning completed-in-period, per-goal progress delta, and stuck/aging
groupings. Goes through `assertLensAllowed` like the other lens reads.

**Entitlement lean.** **Pro-only** (open question in the spec). Sidesteps the
half-enforced 30-day Logbook cap (PRICING.md §4) and fits the tier the
feature lives in (ROADMAP §Then — post-validation).

**Pair with.** `work-area-merged`. v1 (completions + stuck) ships on the
current schema; **v2 (timeline progress)** is gated on `work-area-merged`'s
`kind` enum on `TaskUpdate`, which is the missing Started/Paused/Completed
signal.

**Spec.** `docs/specs/weekly-monthly-review.md` (`draft`).

**Note.** WORKFLOW.md §2.5 names this area "least-built — net-new work" and
describes the surfaces in general terms; the spec makes them concrete without
rewriting the area definition.
