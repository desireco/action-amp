---
slug: today
title: "Today (committed list, cap 5, Done-today)"
feature_area: focus
status: shipped
spec: friction-cleanup.md        # done — Done-today section
verified: 2026-07-03
---

# Today

**What.** The committed-for-today list, capped at 5. Tasks beyond the cap show
in a "Beyond the cap" overflow section with an "Over capacity" banner. Header
reads "N of 5 committed." A "Done today" collapsible section lists tasks
completed since local midnight (scoped to lens), grouped by Goal. A "See
upcoming" swap-bench promotes Upcoming → Today.

**Daily rollover** (locked 2026-06-30, in `getAppData`): at the start of each
calendar day, incomplete TODAY tasks flip to UPCOMING so Today starts fresh.
Idempotent via `User.lastTodayRolloverAt`. Done tasks are left alone; `startedAt`
preserved.

**Files.** `lists/TodayPage.tsx`; `getDoneToday` op.

**Done?** Shipped. The Done-today section was the last piece (friction-cleanup,
done 2026-07-02).

**Cap philosophy.** WORKFLOW.md §2.3 / FEATURES.md F12: the cap is a *feature* —
it forces the "what actually matters today" decision ADHD brains avoid.
