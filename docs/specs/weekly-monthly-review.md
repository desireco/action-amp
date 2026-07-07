---
feature: weekly-monthly-review
status: draft
spec_owner: discover
build_owner: build

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mgsfa      # sync-managed (write-once)
gh_synced_at: 2026-07-07T18:16:34Z   # sync-managed (drift detection)
---

# Feature: Weekly + Monthly Review

## Summary

Today the Review area (WORKFLOW.md §2.5) is the **least-built area of the
app**: its only surface is the Logbook — a flat, reverse-chronological list of
completed tasks/projects and archived notes, grouped by day. There is no way
to step back and see a *period*. This spec adds two review surfaces — **weekly**
and **monthly** — that collect and organize the work of a period into a calm,
readable debrief: actions completed (grouped by Goal/Project, not by day),
progress made (delta vs. the previous period), and what's stuck or aging.

The "actions done" data already exists today (`Task.completedAt`,
`Project.completedAt`, the `getGoals` rollup); an MVP that groups completions
by outcome and counts them per period is buildable now off the current schema.
The richer "progress made" signal — Started/Paused/Completed events in a
timeline — **does not exist yet**; it lands with `work-area-merged`'s `kind`
enum on `TaskUpdate`. So this spec is split: **Range Review v1** (completions
+ stuck items, shippable now) and **Activity Review v2** (timeline-based
progress, gated on `work-area-merged`).

Per AGENTS.md, this is **net-new work in a canonical area** (Review, §2.5).
WORKFLOW.md §2.5 names the surfaces in general terms ("how many tasks
completed this week, what's stuck, what's been deferred repeatedly") — this
spec makes them concrete without rewriting the area definition, so no
WORKFLOW.md cascade is required for v1.

## Why

- **The area is explicitly under-built.** WORKFLOW.md §2.5 flags Review as
  "currently the least-built area — net-new work." The Logbook shipped, but
  the reflection/period view it points at never did. The roadmap's "Then"
  tier exists precisely for depth work like this — it earns its keep once
  someone has stayed long enough to have a week to look back on.
- **"What did I actually do?" is the ADHD-friendly close to the loop.** The
  product's thesis is that overwhelm lives at the *decision* (what now?), and
  the wedge solves the front of the loop (Next). The back of the loop —
  "did I do anything this week?" — is the reflection deficit the same audience
  reports. A flat Logbook answers "what did I finish on Tuesday?"; a weekly
  review answers "did this week matter?", which is a different and more
  valuable question for someone who loses the day-to-day thread.
- **"What's stuck" is inspectable today, surfaced nowhere.** Tasks with
  `status=UPCOMING` + a past `dueDate` (overdue), tasks triaged weeks ago that
  never moved, tasks `startedAt`-set then never finished — all queryable, none
  surfaced as a grouped "these are aging" view. Review is the natural home.

## Done-conditions

Split into **v1 (range review)** — shippable on the current schema — and
**v2 (activity review)** — explicitly gated on `work-area-merged`.

### v1 — Range Review (completions + stuck)

**Routes + nav**
- [ ] `/app/review/weekly` and `/app/review/monthly` routes exist, both
      lens-scoped (the active Lens determines the data; the page shows the
      Lens name in the header, same as Today/Logbook).
- [ ] Both routes are reachable from the **Review** expanding section of the
      focus nav (`AppShell.tsx`), beneath "Logbook": `Logbook · Weekly ·
      Monthly`. The Review section's mobile-dock entry stays "Review" → lands
      on Weekly (the more-frequent cadence), not Logbook.
- [ ] Deep-linking by date works: `/app/review/weekly?for=2026-06-29` loads
      the week containing that date (default: the most recent *completed*
      week/month, not the in-progress one — see Open questions).

**The period query (`getReview`)**
- [ ] A single query `getReview({ lensId, period: "weekly"|"monthly", for:
      Date })` returns the period's data. It is lens-scoped and goes through
      `assertLensAllowed` (FREE → Me-only, the established entitlement
      pattern). Boundary math is **week = Mon 00:00 → Sun 23:59** and
      **month = 1st 00:00 → last day 23:59** in the server locale, matching
      `getDoneToday`'s locale convention.
- [ ] **Completed in period** returns tasks + projects with `completedAt`
      inside the window, each with its `project`/`goal` for grouping.
- [ ] **Progress delta** returns, per Goal touched in the period, the count
      of that goal's tasks/projects completed in-window vs. the goal's total
      — reusing `getGoals`' rollup math (no second implementation of progress
      %). Surfaces as "Goal X: +3 this week (8/12)" style rows.
- [ ] **Stuck / aging** returns tasks in the active Lens that are not done
      and meet any of: `status=UPCOMING` with `dueDate < now` (overdue);
      `startedAt` set and older than 7 days (an interrupted "Now"); or
      `createdAt` older than 30 days having never been `TODAY` (parked).
      Each row carries its reason tag so the UI can group by it.
- [ ] **Previous-period comparison** returns the same completed/stuck counts
      for the prior period, so the UI can show a calm "+4 vs. last week" /
      "−2" delta. Numbers only — no up/down arrows in red/green (calm rule).

**The page**
- [ ] Period header ("Jun 23 – Jun 29" / "June 2026") with prev/next
      chevrons + a `?`-on-hover "what this covers" tooltip.
- [ ] **Completed** section: tasks grouped by Goal (violet dot, as today),
      then by Project, then "General" (gray) — *not* by day. Counts at each
      group header. Project completions sit under their goal; standalone
      projects under "No goal."
- [ ] **Progress** section: per-Goal rows with the delta line ("8/12, +3 this
      week"). Calm typographic treatment — no progress-bar animation, no
      green/red.
- [ ] **Stuck** section: grouped by reason (Overdue / Interrupted / Parked),
      each row tappable → opens the task. One-line empty state: *"Nothing's
      stuck. That's the point."*
- [ ] Monthly is the same layout, wider window, with sub-groups by week —
      not a separate component.
- [ ] Every section collapses to a calm empty state when empty (no zero-shame
      copy, no sad-face icon). A period with zero completions reads
      *"Nothing landed this week. Capture what's on your mind with ⌘K."* —
      same tone as the existing empty states.

**Calm guardrails (PRODUCT.md)**
- [ ] **No streaks, no return-counters, no "you completed N days in a row."**
      Banned outright by PRODUCT.md; a code comment in the page names the ban
      so a future contributor doesn't add one.
- [ ] **No guilt-trip color.** Deltas use neutral type weight, not red/green.
      Stuck items use the existing rose only for *overdue* (its established
      meaning), never for "you didn't do enough."

### v2 — Activity Review (timeline progress) — gated, NOT in this build

These wait on `work-area-merged`'s `kind` enum on `TaskUpdate`
(`STARTED | PAUSED | COMPLETED | NOT_DOING | NOTE`). Do not build them in v1:

- A per-task activity timeline within the review (when each was started,
  paused, resumed — the "progress made" between completions).
- Time-in-progress aggregation ("you spent the most focus on Project X").
- "Picked up after pausing" as a positive signal (the anti-stuck story).

v1 must ship without these and read coherently — completions + stuck is a
complete, useful debrief on its own.

## Non-goals

- **No gamification of any kind.** No streaks, badges, return-counters,
  scores, or "best week ever" copy. PRODUCT.md bans it; the Review area is the
  easiest place to accidentally reintroduce it.
- **No daily review.** "Today" is the Work area's job (§2.3); Review starts at
  the week. A daily debrief would overlap `getDoneToday` and the existing
  Today "Done today" section.
- **No AI summaries / "your week in review" prose.** Tempting, explicitly
  out. The matcher is the only AI-adjacent surface, and it hasn't earned trust
  yet (see `focus-engine-v2`'s matcher-test gate). Auto-prose now would be a
  confidence trick.
- **No nudges, emails, or notifications to review.** Same brand line as
  `retention-criticalpath` §C: a bad nudge is worse than none, and the
  re-engagement-email decision is data-gated there, not here.
- **No new entities.** v1 reuses Task/Project/Goal/TaskUpdate as-read; v2
  only consumes the `kind` enum `work-area-merged` introduces. No
  `ReviewSnapshot` model, no materialized aggregates.
- **No Logbook rewrite.** The Logbook stays as the flat by-day record; Review
  is the period/grouped view *over the same data*. Two surfaces, one source.
- **No changes to caps, billing, or the matcher.** Those have their own specs.

## Open questions

- **The 30-day Logbook cap (PRICING.md §4) — does Review inherit it?**
  PRICING.md gates Logbook history at 30 days (Free) / unlimited (Pro), but
  `getLogbook` enforces no date range today (the cap is unbuilt —
  `entitlement-enforcement` left it open). A monthly review of a free user
  inherently needs >30 days. **Lean (proposed):** Review v1 is **Pro-only**,
  full stop — it's a reflection surface for someone paying, and it sidesteps
  the half-enforced cap cleanly. FREE users see the Review nav items with a
  `<ProGate>` paywall (the established pattern), same as Work Lens. This
  makes the feature a retention lever for paying users, which is the tier it
  lives in anyway. Discover confirms before `ready`.
- **Which week starts the view?** Lean: the most recent *completed* week
  (Sun-just-passed), not the in-progress one — a review of an unfinished week
  is a status check, not a debrief. User can nav forward to the current week
  via the chevrons. Build confirms this reads right; fallback is
  current-week with a subtle "in progress" chip.
- **"Stuck" thresholds.** The 7-day interrupted-Now and 30-day never-Today
  cutoffs are starting guesses. Lean: ship them as constants, surface the
  counts, and revisit once real data shows whether they fire too hot or cold.
- **Custom period ranges (e.g. "last fortnight").** Out for v1; weekly +
  monthly cover the cadences the area is named for.

## Prototypes

_(none yet — v1 reuses existing TaskRow/Goal grouping components in a new
layout; a throwaway `docs/mockups/review-week.html` is the right next
artifact before `ready`, to settle the grouping + delta typography.)_
