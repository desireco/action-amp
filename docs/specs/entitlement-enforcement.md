---
feature: entitlement-enforcement
status: ready
spec_owner: discover
build_owner: build
---

# Feature: Entitlement enforcement (free-tier caps)

## Summary

Enforce the free-tier caps defined in `PRICING.md §4` **server-side**, so the
free product stops giving away the Pro product and the strongest upgrade
trigger ("personal-only Lens") actually exists. Today `FREE_LIMITS` in
`billing/config.ts` is defined and imported nowhere; `createProject` /
`createGoal` create unconditionally; the Work lens is seeded for everyone.
This spec wires the existing, unused `FREE_LIMITS` + `isPaidPlan` into the
operations that create scoped entities, and adds the matching client UX.

## Why

The free-tier audit (ROADMAP.md §Free-tier audit A) confirmed **zero** of the
seven intended caps are enforced. The product is live (`actionamp.com`) with
working Stripe checkout, so this is an active billing leak: a free user
currently gets unlimited projects, unlimited goals, both lenses, and full
history. More strategically, `PRICING.md §4`'s thesis is that "personal-only
Lens is the strongest single upgrade trigger" — that trigger does not exist
until this lands. This is the highest-value, smallest-scope build on the
roadmap: the constants and the plan field already exist; only the guards are
missing.

## Done-conditions

- [ ] **`FREE_LIMITS` is read in `createProject`.** In
      `src/projects/operations.ts`, before `Project.create`, if the user is
      not paid (`!isPaidPlan(context.user.plan)`), count the user's non-done
      Projects in the target lens; throw `HttpError(402, ...)` if `>=
      FREE_LIMITS.projects` (3). Verified by a Vitest case: a FREE user
      creating a 4th project is rejected; a PRO user is not.
- [ ] **`FREE_LIMITS` is read in `createGoal`.** Same pattern in
      `src/goals/operations.ts`: FREE user, count non-done Goals in lens,
      throw `HttpError(402)` if `>= FREE_LIMITS.goals` (1). Verified by test.
- [ ] **The Work Lens is gated for FREE users.** Two parts:
      - `ensureOnboarded` (`src/onboarding/operations.ts`) still seeds both
        Work + Me lenses (so the switch is visible), BUT a FREE user's attempt
        to **switch to** Work is blocked with an upgrade prompt. The gate is
        enforced where the active lens is chosen — confirm the exact call site
        with Build (likely `AppShell.tsx` lens-state setter or a new
        `setActiveLens` action). A paid user switches freely.
      - The block surfaces a calm, on-brand upgrade affordance (a small inline
        message + link to `/app/settings/billing`), never a hard modal. No
        red-dot/guilt UI (banned by PRODUCT.md).
- [ ] **The client shows the cap state.** On the Projects page and Goals page,
      FREE users see their remaining allowance (e.g. "2 of 3 projects") near
      the create affordance; at the cap, the create button is disabled with a
      tooltip linking to billing. PRO users see no cap UI. Reuse `getAppData`
      counts (already returned) — no new query.
- [ ] **`isPlanActive` is used, not just `isPaidPlan`, where renewal matters.**
      The create-guards above check `isPaidPlan` (any paid plan); but a PRO
      user whose `planRenewsAt` has passed should be treated as FREE.
      `isPlanActive(context.user.plan, context.user.planRenewsAt)` is the
      correct check for the create-guards. Replace dead-code usage; add a test
      for the expired-PRO case.
- [ ] **Dead code removed.** `isPlanActive` in `billing/config.ts` is now
      actually called (grep confirms ≥1 call site in `src/`). The misleading
      comment on `FREE_LIMITS` ("Enforced server-side") is now true.
- [ ] **No data loss for existing users.** Existing FREE users who already
      have >3 projects or >1 goal are NOT deleted or locked out of viewing
      them — they simply can't **create** more. Verified: a user with 5
      projects can still open and use all 5.
- [ ] **Logbook 30-day cap is deferred** (not in this spec). Rationale: it's
      the lowest-value cap (logbook is rarely the upgrade trigger) and adds
      query complexity. Call it out in the review as deliberately skipped so
      Discover can decide separately.
- [ ] **Tests:** new Vitest cases for each guard (project cap, goal cap,
      expired-PRO-is-free, paid-user-unrestricted). Existing tests still pass.
- [ ] **`wasp compile` passes.**

## Non-goals

- **No Logbook 30-day limit.** Deferred (above).
- **No multi-device cap.** No device model exists; building one is out of scope.
- **No command-palette / search / energy-tag gating.** Those features don't
  exist yet; nothing to gate. They'll be gated when built
  (`command-palette-search`, `focus-engine-v2`).
- **No pricing changes, no new plans, no Stripe changes.** The plans and
  prices are correct; only enforcement is missing.
- **No migration of plan data.** Existing `User.plan` values are already
  correct (set by the webhook). No backfill needed.
- **No hard paywall modals.** Brand bans manipulation; the gate is a quiet
  inline message + link.

## Open questions

- **Exact site of the Work-lens switch gate.** The lens is held in client
  React state (`lensContext`) today, with no server action for "switch lens."
  Build: the simplest enforceable approach is to gate the **rendering of Work
  content** — i.e. when a FREE user selects Work, the Work area shows an
  upgrade state instead of tasks. If a server-side guard is preferred, add a
  thin `assertLensAllowed` helper called from `getTasks`/`getProjects`/
  `getGoals`. Discover's lean: client-side gate is fine for v1 (the data is
  already user-scoped; this is an experience gate, not a security boundary —
  the real security boundary is the create-guards). Resolve in the review.

## Prototypes

_(none — wiring existing constants into existing operations; no new UI
paradigm. The "2 of 3" allowance chip reuses the existing `Chip` component.)_
