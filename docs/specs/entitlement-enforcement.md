---
feature: entitlement-enforcement
status: done
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
This spec wires the existing, unused `FREE_LIMITS` + `isPlanActive` into the
operations that create scoped entities, and adds the matching client UX.

## The design principle (load-bearing — read before building)

**Every limit a FREE user encounters is a paywall moment.** When a free user
hits any cap — tries the Work lens, creates a 4th project, a 2nd goal, later
opens the command palette — they don't get a hard error or silent refusal.
They get a **calm, specific "this is a Pro feature" message** that names what
they tried + what Pro unlocks + a path to upgrade. The pattern is identical
across every limit: same tone, same component, same billing link.

This is on-brand (PRODUCT.md: honest, not salesy; calm, not pushy) and it's
the conversion mechanism — each cap is a natural "I want more" moment, and a
raw 402 wastes it. The server-side guard is the enforcement; the friendly
client surface is the upgrade trigger. Both are required for every limit.

**Shared building block:** a single `<ProGate>` component (or render helper)
takes `{ feature: string; reason: string }` and renders the consistent panel:
a short line ("`{feature}` is a Pro feature"), a one-sentence `{reason}`
("bring your work life in" / "organize more than 3 projects" / etc.), and a
primary link to `/app/settings/billing` (+ secondary to `/founding-100`).
Every limit surfaces through it, so the tone never drifts and there's one
place to tune the upgrade copy. No modals, no red dots, no urgency tricks.

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

- [ ] **`FREE_LIMITS` is read in `createProject` — server refuses, client
      invites.** In `src/projects/operations.ts`, before `Project.create`, if
      the user is not active-paid (`!isPlanActive(...)`), count non-done
      Projects in the target lens; throw `HttpError(402, ...)` if `>=
      FREE_LIMITS.projects` (3). **The client surfaces this as a paywall
      moment**, not a raw error: the Projects page catches the 402 on the
      create action and renders the shared `<ProGate>` with `feature: "a 4th
      project"` / `reason: "organize more than 3 projects with Pro"`.
      Verified by: a Vitest case (FREE user 4th project rejected, PRO not) +
      a component test that the ProGate renders on the 402.
- [ ] **`FREE_LIMITS` is read in `createGoal` — same pattern.** In
      `src/goals/operations.ts`: FREE user, count non-done Goals in lens,
      throw `HttpError(402)` if `>= FREE_LIMITS.goals` (1). Client renders
      `<ProGate>` with `feature: "a 2nd goal"` / `reason: "link work to more
      than one outcome with Pro"`. Verified by test.
- [ ] **The cap is discoverable *before* the wall.** On the Projects page and
      Goals page, FREE users see their remaining allowance near the create
      affordance (e.g. "2 of 3 projects used" via a `Chip`); at the cap the
      create control is disabled and reads as a ProGate trigger ("Upgrade for
      more projects →"), not a dead button. PRO users see no cap UI. Reuse
      `getAppData` counts (already returned) — no new query. This way the
      paywall moment is anticipated, not a surprise mid-action.
- [ ] **The Work Lens is "visible-but-locked" for FREE users** (the same
      paywall-moment principle applied to the lens). FREE users *see* the Work
      lens in the switch, but selecting it renders the shared `<ProGate>` in
      the main area — `feature: "the Work lens"` / `reason: "bring your work
      life into ActionAmp"` — instead of Work content. Same component, same
      tone, same billing link as the project/goal caps. The Work lens chip can
      carry a subtle "Pro" affordance (tiny chip, not a bright badge —
      PRODUCT.md) so the gate is discoverable before the click.

      **Two layers, both required (the lens-specific enforcement):**
      - **Client (the UX):** on Work-lens click for a FREE user, the app does
        **not** switch the active lens / fire Work queries — it shows the
        `<ProGate>`. No modal, no red dot, no guilt copy.
      - **Server (the boundary, non-negotiable):** the client gate is bypassable
        (lens state is client React + `localStorage`, no server action; a user
        can set `aa-lens=Work` and the queries would still run). So
        `getTasks`/`getProjects`/`getGoals` (any lens-scoped read) **must refuse
        Work-lens data for FREE users** server-side via a shared
        `assertLensAllowed(context.user, lensId, lenses)` helper that throws
        `HttpError(402)`. The client gate is the friendly surface; this is the
        billing boundary. Without it, "visible-but-locked" is theater.
      - **Keep both lenses seeded** (`ensureOnboarded` unchanged): the Work lens
        exists for FREE users (so the switch shows it + it's populated on
        upgrade), but its content is gated by both layers.
- [ ] **A new FREE user defaults to the Me lens**, not Work. Today
      `AppShell.tsx:55` defaults to `"Work"`. Flip the default to `"Me"` so a
      FREE user's first experience is the lens they're entitled to — landing
      them on the locked Work panel on first paint would be a poor first
      impression even with the friendly message. (Cosmetic for paid users; they
      switch freely.)
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

> **Addendum (2026-07-03): name → kind.** The lens decision (`lensViolation`)
> originally keyed on the lens *name* string (`"Work"`/`"Me"`). That was safe
> only because names were hardcoded. Custom lenses made names user-editable, so
> the guard now branches on **`LensKind`** (`PERSONAL` allowed for FREE;
> `WORK`/`CUSTOM` restricted) — the stable handle that survives renames.
> `resolveLensName` became `resolveLens` (returns `{ name, kind }`); a new
> `assertLensConfigAllowed` gates lens *configuration* (Pro-only). See
> `docs/specs/custom-lenses.md` §"Stable handle" for the reasoning.

## Non-goals

- **No Logbook 30-day limit.** Deferred (above).
- **No multi-device cap.** No device model exists; building one is out of scope.
- **No command-palette / search / energy-tag gating in *this* spec.** Those
  features don't exist yet. **But when they ship, they reuse this same
  `<ProGate>` pattern** — that's the point of the shared component. Each future
  Pro feature's spec should call `<ProGate feature="the command palette"
  reason="...">` rather than invent its own paywall. The pattern is established
  here; later specs inherit it.
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
