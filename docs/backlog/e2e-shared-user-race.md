---
kind: bug
status: draft
priority: P3
feature: e2e
parent: docs/DEV-WORKTREES.md

---

# e2e: per-spec seeded users (retire the shared-user race class)

## What happened (2026-09-26 sweep)

The suite's default-config parallel workers ran spec FILES concurrently, all
against the same seeded users. Any two specs touching one user's state
raced each other and failed non-deterministically:

- `triage` + `triage-dispatch` share `dev@local.test`'s inbox queue — two
  files draining/triaging in parallel made `POST /rpc/inbox/triage` answer
  400 "Inbox item not found." (the other worker had already deleted the item).
- `smoke` asserts the four seeded sample tasks stay un-completed; any spec
  that completed one broke it on the next run.
- `focus-link.spec` left its started task RUNNING on `dev@local.test` — the
  What Now handoff ("Do is focus while running") then bounced every later
  Do-tap to `/focus`, failing all three `mobile-goals` tests with dock
  timeouts.

## What landed (same day)

- `web/playwright.config.ts`: `workers: 1` — files no longer race; full suite
  is deterministic (~2 min, two consecutive green runs).
- `focus-link.spec` now pauses its task when done (cleanup, like the wire
  seeds it creates).
- `next.spec` F16 asserts on `main` (the document `<title>` carried the
  completed task's name during the transition frame) and
  `whatNow.complete()` clears `topTask` so the title/card never name a
  completed task.
- `projects-create` + `tags` reads poll the wire (`expect.poll`) — both
  raced a just-resolved mutation by a few ms.
- `billing` webhook test probes the API's secret state instead of trusting
  the test shell's env, and skips with instructions when the API has
  `STRIPE_WEBHOOK_SECRET` but the shell doesn't.

## The remaining work

`workers: 1` trades suite wall-time and keeps the fragility: any NEW spec
that assumes exclusive ownership of `dev@local.test` (or another shared
seeded user) silently re-introduces this class, and leftover state from a
crashed run poisons the next one.

Per-spec users, following the existing `seed-s4.ts` pattern
(`s4-next@test.local` et al.):

1. Give the inbox-walking specs (`triage`, `triage-dispatch`, `capture`)
   their own user + seeded Groceries/Briefs fixtures (seed-inbox.ts
   extension) instead of `dev@local.test`.
2. Give `smoke` its own user with the four sample rows so nothing else can
   complete them.
3. Then restore parallel workers (`workers: "number of cpus / 2"`-ish) — the
   suite drops back to well under a minute.
4. Convention note for new specs in `web/e2e/helpers.ts`: a spec either
   brings its own seeded user or cleans up every row it starts.
