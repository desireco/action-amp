# Review: admin-activity-dashboard

<!-- Build owns this file. Discover reads it to sign off. -->

Spec: `docs/specs/admin-activity-dashboard.md` · Commit `a7ee5f7`.

## What changed

A new **Activity** destination in the admin workspace (`/do/admin/activity`,
nav order Overview · Activity · Users · Funnel · Feedback):

- **This week** — tiles for signups, active users, captures, tasks completed,
  each with a "last week N · +X%" sub-value ("new"/"—" when there is no
  baseline).
- **Current month, week by week** — one row per week, clipped to the month's
  edges so the rows (and the totals footer) sum to the month's own numbers —
  the semantics the September GTM milestones are written against. The bucket
  containing today is marked "in progress".
- **Last 8 weeks** — full Monday–Sunday UTC ISO weeks, oldest → newest, for
  trend context.

Implementation follows the existing admin pattern exactly: pure
`getActivityStatsCore` (+ `startOfISOWeek` helpers) in
`admin/operationsCore.ts` with exclusive-end (`gte`/`lt`) bucket ranges;
admin-gated `getAdminActivityStats` Wasp query (entities User, Task,
AnalyticsEvent); `AdminActivityPage.tsx` reusing the shared `aa-admin-*`
styles. Overview's Users group gained one quiet "Weekly signups → Activity"
link; nothing else on Overview changed. Non-goals held: no charts, no CLI
command, no per-user drill-in, no timezone picker.

## Gates run

- `npx vitest run src/admin/` — 25 passed (8 new `startOfISOWeek`/
  `getActivityStatsCore` tests: year-boundary week, Sunday-night edge,
  exclusive-end boundary, clipped month partition, telemetry/`isDone` query
  shapes, undefined-count coercion; 3 page source-contract tests).
- `npm run lint` on changed paths — clean; the one remaining error in
  `operations.ts` (`adminMutationEntities` dictionary type) pre-exists on
  clean main (verified via stash) and is out of scope here.
- `npx wasp compile` — passes (known dependency-override warnings only).
- **Dev-DB verification** (spec done-condition): ran the core against
  `actionamp_dev`. Every bucket matches manual psql `date_trunc('week')`
  counts — signups 21/4/8/4 across Jul 20–Aug 17 weeks, captures 1/41,
  triage 1/30, tasks-done 1/4/1/4 — and the clipped August rows sum to 16,
  exactly `count(*) WHERE "createdAt" >= 2026-08-01`.

## Notes for sign-off

- The live page will show its first real "in progress" week today (Mon Aug
  31) — worth a quick look at `/do/admin/activity` in dev before merging the
  ritual into the GTM Monday reviews.
- Month rows intentionally differ from the trend table's overlapping week
  (month rows are clipped; trend rows are full ISO weeks). Both are labelled
  with their actual date ranges; the page note says so.
