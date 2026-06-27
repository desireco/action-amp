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
- [ ] **The Work Lens is gated for FREE users — server-side, not client.**
      This is the load-bearing decision and it must be enforced in the queries,
      not the UI. Why: lens selection today is pure client React state +
      `localStorage` (`AppShell.tsx:53-59`, key `aa-lens`); there is **no server
      action for "switch lens"** — the active lens is just a `lensId` arg passed
      to `getTasks`/`getProjects`/`getGoals`. A client-only gate is therefore
      trivially bypassable (the lens is in localStorage; the queries still
      return Work data). For a *billing* trigger that PRICING.md §4 calls "the
      strongest single upgrade driver," a bypassable wall means nobody ever
      upgrades. So:
      - **Server:** `getTasks`/`getProjects`/`getGoals` (and any other lens-
        scoped read) throw `HttpError(402)` — or return an empty/upgrade-shaped
        result — when a FREE user queries a Lens whose name is `Work`. A single
        helper `assertLensAllowed(context.user, lensId, lenses)` does the check;
        call it from each lens-scoped operation. (A FREE user still *sees* both
        lenses in the switch — the gate is on the *content*, not the visibility.)
      - **Client:** when a query 402s (or returns the upgrade marker), the Work
        area renders a calm upgrade state instead of tasks — small inline
        message + link to `/app/settings/billing`. Never a hard modal; never a
        red dot (banned by PRODUCT.md).
      - **Keep both lenses seeded** (`ensureOnboarded` unchanged): a FREE user
        can still create Work-lens entities via the create-guards above (those
        are plan-checked) — but reading the Work area prompts upgrade. The Work
        lens stays *aspirational* and *populated-on-upgrade*, which is exactly
        the "I want to bring my work life in" trigger PRICING.md describes.
- [ ] **A new FREE user defaults to the Me lens**, not Work. Today
      `AppShell.tsx:55` defaults to `"Work"`. Flip the default to `"Me"` so a
      FREE user's first experience is the lens they're entitled to — landing
      them in a gated Work view on first paint would be a terrible first
      impression. (The default is cosmetic for paid users; they switch freely.)
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

- _(The Work-lens gate site — previously open — is **resolved**: server-side, in
  the lens-scoped queries, via a shared `assertLensAllowed` helper. See the
  done-condition above for the full reasoning. Rationale: lens state is client-
  side React + localStorage with no server action, so a client gate is bypassable
  and useless as a billing trigger.)_
- **402 vs empty-result for the gate.** Throwing `HttpError(402)` is simplest
  and lets the client branch cleanly, but it surfaces as a query error in
  React Query (needs an `onError`/`error` render branch). Returning an upgrade-
  marker shape keeps the query "successful" but flagged. Build picks the one
  that reads cleanest in the existing list pages; note it. Lean: 402 + an error
  boundary per area is more honest about what happened.

## Prototypes

_(none — wiring existing constants into existing operations; no new UI
paradigm. The "2 of 3" allowance chip reuses the existing `Chip` component.)_
