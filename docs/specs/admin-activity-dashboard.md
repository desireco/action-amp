---
id: admin-activity-dashboard
kind: spec
title: "User activity dashboard — calendar-week (Mon–Sun) activity metrics"
status: building
priority: P1
feature: admin-activity-dashboard
spec_owner: discover
build_owner: build
created: 2026-08-31
depends_on: [admin-workspace, growth-analytics]

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4OMmW5      # sync-managed (write-once)
gh_synced_at: 2026-08-31T19:41:07Z
---

# Spec: User activity dashboard — calendar-week (Mon–Sun) activity metrics

## Summary

Add an **Activity** destination to the admin workspace (`/do/admin/activity`):
a dashboard that tracks user activities in **calendar weeks, Monday 00:00 →
Sunday 23:59:59 UTC**. It answers, at a glance:

- How many **signups this week** (so far) vs **last week** (complete)?
- What did users **do** this week — captures, triage, tasks created/completed,
  active users — vs last week?
- Inside the **current month**, how do signups break down **per week**?

Today's Overview only has **rolling** windows ("last 7 days" = now minus
7×24h). A rolling 7-day window slides across week boundaries, so it can never
answer "how many signed up last week" or "are we on pace for this week's
milestone." The September GTM campaign (`docs/GTM-SEPTEMBER-2026.md`) sets
**Monday–Sunday weekly signup milestones** and a **30-minute Monday ritual**
that reads exactly these numbers — this page is the instrument for that ritual.

## User problem

The admin Overview can say "16 signups in the last rolling 30 days," but
during a month with explicit weekly targets (15 → 20 → 25 → 30) it cannot say:

- "This week (Mon–Sun): 11 so far."
- "Last week finished at 19."
- "September so far: 45, of which W1 15 · W2 20 · W3 10 (in progress)."

Every answer requires exporting rows and hand-bucketing. That is the gap.

## Evidence

- `webapp/src/admin/operationsCore.ts` — `windows()` computes `today` (UTC
  midnight), `d7`, `d30` as rolling offsets; `signedUpToday/7d/30d` are the
  only signup time-cuts. No calendar-week bucketing exists anywhere in the
  admin surface (checked Overview, Funnel, Users pages + admin-cli `stats`).
- `AdminPage.tsx` tiles (`New signups · ${range}`) inherit the rolling ranges
  (`7d`/`30d`/`all`); `AdminFunnelPage.tsx` uses the same `FunnelRange`.
- The GTM plan's Monday ritual needs: current-week signups, previous-week
  signups, activation, and week-over-week active users — read in under a
  minute.

## Decisions locked

1. **New destination, not an Overview extension.** Nav item **Activity** in
   `AdminLayout` (order: Overview · **Activity** · Users · Funnel · Feedback),
   route `/do/admin/activity`, page `AdminActivityPage.tsx`. Admin-gated
   identically to siblings (client gate + `isAdmin` check in the Wasp query).
   Overview stays the aggregate scan; it does not grow weekly tables (mirrors
   D2 of `admin-workspace` and D1 of `admin-user-management`).
2. **Calendar weeks are Monday 00:00:00 → Sunday 23:59:59.999 UTC.** Consistent
   with the UTC windows in `operationsCore.ts` `windows()`. The page states
   "Monday–Sunday · UTC" once in a note; no timezone picker in v1. (Postgres
   `date_trunc('week')` is also Monday-based, so a future raw-SQL path agrees.)
3. **Explicit JS ranges + Prisma `gte`/`lt` counts — no raw SQL, no
   `groupBy`-by-week.** A pure `startOfISOWeek(date: Date): Date` helper (UTC
   ISO-week math) + per-bucket counts. Portable, unit-testable, and at current
   scale (~8 buckets × ~6 counts) the parallel `Promise.all` is trivially
   cheap. Revisit only if bucket count grows an order of magnitude.
4. **Activities tracked per week (the columns):**
   - **Signups** — `User.createdAt` (durable; the anchor metric).
   - **Active users** — `User.lastActiveAt` (throttled app-load signal).
   - **Captures** — `AnalyticsEvent` `CAPTURE_CREATED` (best-effort browser
     telemetry; labelled as such, like Users page wording).
   - **Triage completed** — `AnalyticsEvent` `TRIAGE_COMPLETED` (same caveat).
   - **Tasks created / completed** — `Task.createdAt` / `Task.completedAt`
     (durable rows; not the `TASK_COMPLETED` event).
   - Logins, payments, funnel steps: **not** on this page (they belong to
     Users, Overview operating snapshot, and Funnel respectively).
5. **Three sections on the page, tiles + tables only — no charts in v1.**
   - **This week** — tiles: `Signups` (value = this week so far; sub =
     "last week N · +X%"), `Active users` (same shape), `Captures`,
     `Tasks completed`. Calm deltas; `+0%`/`—` when last week was zero.
   - **Current month, week by week** — a table with one row per week of the
     current calendar month (`W1 · Sep 1–7`, `W2 · Sep 8–14`, …, label
     "in progress" on the current week) and columns = the activities above;
     footer row = month totals. The GTM milestone comparison happens against
     this table.
   - **Last 8 weeks** — same columns, oldest → newest, current row marked.
     Gives trend context without a chart; subsumes "previous week."
6. **Core shape mirrors `getAdminStatsCore`.** New pure
   `getActivityStatsCore(entities, { now?: Date })` in
   `webapp/src/admin/operationsCore.ts`, returns:

   ```ts
   type ActivityWeek = {
     weekStart: string;        // ISO, Monday 00:00 UTC
     weekEnd: string;          // ISO, exclusive (next Monday 00:00)
     isCurrent: boolean;
     signups: number;
     activeUsers: number;
     captures: number;
     triageCompleted: number;
     tasksCreated: number;
     tasksCompleted: number;
   };
   type ActivityStats = {
     weeks: ActivityWeek[];                 // last 8, oldest → newest
     month: { label: string; weeks: ActivityWeek[]; };  // current calendar month
   };
   ```

   The page derives this-week/last-week/deltas from `weeks`. Exposed via one
   new Wasp query in `admin/operations.ts` (gate: `context.user.isAdmin`,
   same as `getAdminStats`); the current-week bucket counts naturally stop at
   `now` because future rows cannot exist.
7. **Overview keeps its rolling windows and links here.** No duplication: the
   Overview "Users" group gains one quiet link ("Weekly signups → Activity"),
   mirroring how Overview defers depth to Funnel/Users.
8. **Admin CLI: out of scope v1** (same call as `admin-user-management` D1).
   The dashboard is the surface; `actionamp-admin` can grow a `weeks` command
   later if the ritual ever moves to the terminal.
9. **No per-user drill-in from this page.** Week rows are aggregates; "who
   signed up this week" is already served by Users (`joined` filter). Don't
   rebuild the directory here.

## Done-conditions

- [ ] `startOfISOWeek`-style pure helpers with Vitest unit tests covering the
      edges: Sunday 23:59 UTC belongs to the week that started the *previous*
      Monday; Monday 00:00 starts a new bucket; a bucket spanning a year
      boundary (e.g. Mon Dec 29 → Sun Jan 4) keeps Monday-derived labels.
- [ ] `getActivityStatsCore` tested with synthetic count-faking entities that
      assert each bucket's `gte`/`lt` boundaries (a row exactly at `weekEnd`
      lands in the *next* bucket) and the 8-week/month partitioning.
- [ ] Wasp query admin-gated; non-admin gets the same access-denied treatment
      as `getAdminStats` (test mirrors `operations.test.ts`).
- [ ] `/do/admin/activity` route + "Activity" nav item (desktop rail and
      mobile nav); page renders the three sections with correct loading (`—`
      placeholders), error, and empty (all-zero) states consistent with
      `AdminPage`.
- [ ] Overview gains the quiet "Weekly signups → Activity" link; nothing else
      on Overview changes.
- [ ] Verified in dev against seeded users/tasks/events spanning ≥3 weeks
      (make the dev account admin via psql if needed); buckets match manual
      psql `count(*) … WHERE "createdAt" >= … AND < …` spot-checks.
- [ ] `npm run lint` clean on changed paths; `wasp compile` passes.

## Non-goals

- Charts/graphs (v1 is tiles + tables; a calm sparkline can be a follow-up if
  the tables feel insufficient).
- Retention/return cohorts (D7 return is a different, harder metric; separate
  spec if the ritual needs it).
- Timezone-configurable weeks; admin CLI command; per-user drill-in;
  export/CSV.

## Open questions

- None blocking. (UTC weeks vs the maker's local week is accepted deliberately
  in D2 for consistency with every existing window; if the Monday ritual ever
  shows a systematic off-by-hours distortion, a local-time bucketing pass is a
  contained change to the pure helpers.)
