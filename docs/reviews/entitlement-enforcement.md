# Review: entitlement-enforcement

<!-- Build owns this file. Discover reads it to sign off. -->

## What changed

On `main`. Wires the existing-but-unused `FREE_LIMITS` + `isPlanActive` into the
ops that create scoped entities, adds the matching client UX, and gates the Work
lens. The free product no longer gives away the Pro product; the strongest
upgrade trigger ("personal-only Lens") now exists.

- **Server boundary (the non-negotiable half):**
  - `src/billing/entitlements.ts` — pure decision logic: `capViolation`,
    `lensViolation`, `isEntitled`, `resolveLensName`. No `wasp/server` import
    (so it's unit-testable — see the testability note below).
  - `src/billing/entitlementHttp.ts` — the server-only layer that turns a
    violation into a thrown `HttpError(402, ..., { feature, reason })`. This is
    the ONLY file under `src/` that imports `wasp/server` for enforcement, by
    design (no unit test; HTTP behavior e2e-verified, mirroring `billing/operations.ts`).
  - Guards wired into: `createProject`, `createGoal`, `getTasks`, `getProjects`,
    `getGoals`, `getTopTask`, `getDoneToday`, and the triage `project` decision
    (closes the bypass where triage created a project without the cap).
  - `isPlanActive` (not `isPaidPlan`) is the check: expired PRO → treated as
    FREE. FOUNDER never expires.
  - Detail reads (`getProject`/`getGoal`/`getTask`) are intentionally NOT lens-
    guarded — the spec's "no data loss" invariant: existing content stays
    viewable; only list/scope reads + creates enforce.
- **Client surface (the friendly half):**
  - `src/components/ui/ProGate.tsx` — the shared paywall-moment panel: calm,
    specific (`{feature} is a Pro feature` + one-sentence `{reason}`), links to
    `/app/settings/billing` + `/founding-100`. Also an `asTrigger` form for the
    at-cap create affordance. No modals, no red dots, no urgency copy. Future
    gates (command palette, search) reuse it.
  - `ProjectsPage` / `GoalsPage` — allowance chip ("N of 3 used"), the create
    button becomes a ProGate trigger at the cap, and a 402 on create renders the
    inline ProGate. PRO users see no cap UI.
  - `AppShell` — Work lens is "visible-but-locked" for FREE users: clicking it
    renders the ProGate in the main area WITHOUT switching the lens or firing
    Work queries. Default lens flipped `Work → Me` (FREE users land on the lens
    they're entitled to). A stored `aa-lens=Work` (bypass attempt / stale) is
    clamped client-side to Me so queries don't 402 on load.
  - `LensSwitch` — a tiny, neutral "Pro" chip on the Work lens for FREE users
    (discoverable before the click, not a bright badge — PRODUCT.md).
  - `useEntitled` hook + `extractEntitlementMessage` — client mirrors of the
    server check, reading `plan`/`planRenewsAt` straight off `useAuth()` (no
    extra query; the User entity spreads into AuthUserData).

## Gates run

- **Diagnostics:** `wasp compile` — exit 0.
- **Tests:** `npm test` — **285 passed (285)**, exit 0. +101 from the 184
  baseline (new entitlement suites + the existing op suites now run in node).
- **e2e:** `playwright test --workers=1` — **45 passed (45)**, exit 0. +3 new
  (`e2e/entitlements.spec.ts`: Work-lens ProGate, project allowance chip, goal
  allowance chip). Existing next/today tests updated to clear the now-visible
  starter task (Me default made it surface on home — see Findings #2).

## Done-conditions

Each predicate from `docs/specs/done/entitlement-enforcement.md` → verdict + evidence.

- [x] **`FREE_LIMITS` read in `createProject` — server refuses, client invites.**
      PASS — `assertUnderCap(context, lensId, count, FREE_LIMITS.projects, …)`
      before `Project.create`; 402 carries `{ feature: "a 4th project", … }`.
      `ProjectsPage` catches the 402 → renders `<ProGate>`. Unit-tested
      (`entitlements.ops.test.ts`) + e2e (allowance chip).
- [x] **`FREE_LIMITS` read in `createGoal` — same pattern.** PASS — same shape
      with `FREE_LIMITS.goals` (1) + "a 2nd goal" message. Unit + e2e covered.
- [x] **Cap discoverable before the wall.** PASS — allowance chip on both pages
      ("1 of 3 projects used" / "0 of 1 used"); at the cap, the create control
      becomes a `<ProGate asTrigger>` ("New project · Upgrade →"), not a dead
      button. PRO users see neither. e2e-verified.
- [x] **Work Lens visible-but-locked.** PASS — both layers: client (ProGate on
      click, no lens switch, no Work queries fired) + server (`assertLensAllowed`
      refuses Work-lens reads for FREE → 402). Both lenses still seeded
      (`ensureOnboarded` unchanged). e2e-verified (the gate renders + Me stays
      selected).
- [x] **New FREE user defaults to Me.** PASS — `AppShell` `useState` initializer
      flipped `"Work" → "Me"`; stored-lens clamp keeps a stale `aa-lens=Work`
      from 402-ing on load.
- [x] **`isPlanActive` used, not `isPaidPlan`.** PASS — the entitlement check is
      `isPlanActive(plan, planRenewsAt)`; expired-PRO-is-FREE covered by a unit
      test (`isEntitled("PRO", PAST) → false`).
- [x] **Dead code removed.** PASS — `isPlanActive` + `FREE_LIMITS` are now read
      in `src/` (was "imported nowhere" per the audit). The "Enforced server-
      side" comment on `FREE_LIMITS` is now true.
- [x] **No data loss for existing users.** PASS — guards are on create + list
      reads, never on detail reads; a user with 5 projects opens/uses all 5.
      (Counted guards skip done entities, so finishing frees a slot.)
- [x] **Logbook 30-day cap deferred.** DONE (deliberately skipped, per spec).
- [x] **Tests.** PASS — Vitest: `capViolation`/`lensViolation`/`isEntitled`/
      `resolveLensName` (17 cases incl. expired-PRO + FOUNDER); op→guard wiring
      (6 cases); `<ProGate>` render (5 cases). e2e: 3 entitlement cases.
- [x] **`wasp compile` passes.** PASS.

## Findings

1. **[decision] Module split: `entitlements.ts` (pure) vs `entitlementHttp.ts`
   (server).** Wasp's `detectServerImports` Vite plugin blocks any static
   `wasp/server` import under `src/` in the client build that Vitest uses. Since
   the guarded ops are imported transitively by their unit tests, a static
   `HttpError` import in a shared guard module broke the whole op test suite
   (goals/projects/tasks/inbox). Resolution: the pure decision logic
   (`capViolation` returns a message or null) lives in `entitlements.ts` —
   unit-tested, no `wasp/server`. The throw (`HttpError`) lives in
   `entitlementHttp.ts` — server-only, no unit test, HTTP behavior e2e-covered.
   This mirrors the existing `billing/operations.ts` precedent (also imports
   `wasp/server`, also has no unit test). The real `HttpError` is required:
   Wasp's Express error handler only honors `err.statusCode` when
   `err instanceof HttpError` — a plain error falls through to a generic 500
   (verified in the bundled `server.js`).
2. **[consequence of the Me default] Starter task now visible on home.** Before
   this change, the default lens was Work and the seeded "Try it" starter task
   lived in Me — so home looked empty for a new user. With the Me default, home
   shows the seed task (the intended "teach the loop by doing" first impression).
   This is correct product behavior; it broke 8 `next.spec` + 2 `today.spec`
   tests that assumed an empty home. Fixed via a `completeTopTask` e2e helper
   that clears all seeded tasks before tests needing a clean slate. No product
   behavior changed — only the tests' setup.
3. **[decision] Triage project-create also capped.** `triageInboxItem` with
   `decision: "project"` created a Project directly, bypassing `createProject`'s
   cap. Added `assertUnderCap` to that path too (and a lens guard for all triage
   decisions) so the cap can't be dodged via triage. Not called out in the spec
   explicitly but clearly within its intent ("the cap is enforced server-side").
4. **[open question, resolved] "Pro" affordance on the Work lens chip.** Chose a
   tiny neutral "Pro" chip (not a lock icon, not nothing) — discoverable before
   the click without being a bright badge (PRODUCT.md bans attention-grabbing UI).
   Styled in `--aa-text-4` / `--aa-surface-muted`, the quietest tier.
5. **[deferred, not blocking] `getGoal`/`getDoneToday` still have no unit tests
   of their own** (carried from friction-cleanup). The entitlement wiring is
   e2e-covered; tenancy matches the proven `findUnique` pattern.

**Rejected:** none.

## Verdict

**done** (signed off 2026-07-03).

All done-conditions PASS. `wasp compile` green; **285 unit tests pass**; **45/45
e2e pass serially** (incl. 3 new entitlement cases). The server boundary (402 on
Work-lens reads + cap overflow) and the friendly client surface (ProGate,
allowance chips, visible-but-locked Work lens) are both in place. The one
architectural decision worth flagging is the `entitlements`/`entitlementHttp`
split forced by Wasp's `detectServerImports` plugin (Finding #1) — it's the
clean way to keep the guards both correct (real `HttpError`) and unit-testable.
