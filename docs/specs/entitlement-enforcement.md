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
- [ ] **The Work Lens is "visible-but-locked" for FREE users.** Design call
      (revised 2026-06-27): FREE users *see* the Work lens in the switch, but
      selecting it surfaces a calm **"This is a Pro feature"** message instead
      of Work content — they don't get a hard 402 error, they get an invitation.
      This is softer and more on-brand than a read-time error, and it's the
      common pattern (Things/Todoist/Linear all show locked premium surfaces).

      **Two layers, both required:**
      - **Client (the UX — your ask):** when a FREE user clicks the Work lens
        (`LensSwitch` onSelect, `AppShell.tsx`), the app does **not** switch the
        active lens / fire Work queries. Instead it shows a calm inline panel
        in the main area: a short line ("Work is a Pro feature — bring your
        work life into ActionAmp") + a primary link to
        `/app/settings/billing` or the Founding-100 page. No modal, no red dot,
        no guilt copy (PRODUCT.md). The Work lens in the switch can carry a
        subtle "Pro" affordance (a tiny lock or "Pro" chip) so the gate is
        discoverable *before* the click, not just after.
      - **Server (the enforcement — non-negotiable):** the client gate alone is
        bypassable (lens state is client React + `localStorage`, no server
        action; a savvy user can set `aa-lens=Work` and the queries would still
        return data). So `getTasks`/`getProjects`/`getGoals` (any lens-scoped
        read) **must refuse Work-lens data for FREE users** server-side — via a
        shared `assertLensAllowed(context.user, lensId, lenses)` helper that
        throws `HttpError(402)` when a FREE user targets a lens named `Work`.
        The client gate is the friendly surface; this is the billing boundary.
        Without it, "visible-but-locked" is theater.
      - **Keep both lenses seeded** (`ensureOnboarded` unchanged): the Work lens
        exists for FREE users (so the switch shows it and it's populated on
        upgrade), but its content is gated by both layers above.
- [ ] **A new FREE user defaults to the Me lens**, not Work. Today
      `AppShell.tsx:55` defaults to `"Work"`. Flip the default to `"Me"` so a
      FREE user's first experience is the lens they're entitled to — landing
      them on the locked Work panel on first paint would be a poor first
      impression even with the friendly message. (Cosmetic for paid users; they
      switch freely.)
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

- _(The Work-lens gate — resolved 2026-06-27: **visible-but-locked**. FREE users
  see Work in the switch; clicking shows a calm "Pro feature" panel (the UX);
  the server still refuses Work queries via `assertLensAllowed` → 402 (the
  boundary). Both layers required — the client gate is bypassable, so the
  server guard is non-negotiable.)_
- _(The 402-vs-empty-result question — resolved by the above: **402 server-side
  as the enforcement**, but the common path never hits it because the client
  gate intercepts the click first. The 402 is the safety net for the bypass
  case, not the user-facing surface. Build still renders a calm fallback if a
  402 somehow reaches the client, but it should be rare.)_
- **The "Pro" affordance on the Work lens chip.** A tiny lock icon, a "Pro"
  chip, or nothing (rely on the post-click message)? Lean: a subtle "Pro" chip
  so the gate is discoverable before the click — but keep it tiny and neutral,
  not a bright badge (PRODUCT.md bans attention-grabbing UI). Build picks; note
  it in the review.

## Prototypes

_(none — wiring existing constants into existing operations; no new UI
paradigm. The "2 of 3" allowance chip reuses the existing `Chip` component.)_
