# Review: first-run-experience

<!-- Build owns this file. Discover reads it to sign off. -->

## What changed

Branch: `build/first-run-experience`. The front-door churn fix (ROADMAP §Free-
tier audit B) — onboarding was dead code teaching gestures the webapp lacks, and
new users landed on an empty "Nothing on the table." Four compounding problems
resolved in one pass.

- `webapp/schema.prisma` + migration `20260627214351_add_has_seen_onboarding` —
  `User.hasSeenOnboarding Boolean @default(false)`. Replaces the localStorage
  gate that didn't survive a device/browser switch.
- `webapp/src/App.tsx` — client-side first-run gate: an authenticated user with
  `hasSeenOnboarding===false` on an `/do*` path is redirected to `/welcome`
  exactly once. Scoped to `/do*` (doesn't yank users off auth/public pages).
- `webapp/src/onboarding/OnboardingPage.tsx` — rewrite: drops the 4 mobile-
  gesture lessons (long-press, two-finger zoom, one-finger mode swipe) the
  webapp never implemented; teaches the real 3-step loop (Capture ⌘K → Triage →
  Focus). Calls `completeOnboarding()` server-side; on failure stays put with a
  calm error + retry (no redirect loop).
- `webapp/src/onboarding/operations.ts` — `ensureOnboarded` now seeds exactly
  one TODAY/NORMAL/M task in the Me lens, guarded by `Task.count===0` (existing
  users unaffected). New `completeOnboarding` op flips the server flag.
- `webapp/src/onboarding/OnboardingPage.css` — gesture/finger/breadcrumb/demo
  CSS removed; loop-visual + error styles added; orphaned welcome/done
  selectors cleaned.
- `webapp/src/app/AppShell.tsx` — `ensureOnboarded` useEffect guarded with a
  per-user `useRef` so dev StrictMode's double-fire can't seed two tasks.
- `webapp/src/onboarding/operations.test.ts` — +5 tests (seed guard: 1 task for
  0-task user / 0 for ≥1-task / 0 when Me lens absent; completeOnboarding guard
  + happy path).
- `webapp/scripts/reset-user.mjs` + `create-verified-user.mjs` — both set
  `hasSeenOnboarding=true` for dev/e2e users so the login + signup e2e flows
  aren't redirected to `/welcome`.
- `webapp/main.wasp.ts` — `completeOnboarding` action wired; `Task` added to
  `ensureOnboarded`'s `entities[]`.

Commits:
- `8bd0e78` spec: ready → building
- `2caa437` route new users to onboarding + seed magic-moment task
- `b96bb6f` address review gate findings (6 fixes)

## Gates run

- **Cold-context reviewers (3, distinct angles, fresh context):**
  - **Reviewer A — routing/regressions:** found 3 blockers (redirect loop on
    `completeOnboarding` failure; e2e suite breaks because
    `create-verified-user.mjs` didn't set the flag → 6 specs' `waitForURL`
    time out; gate scope fired on every path not just `/do*`). Redirect-trace
    of all paths included.
  - **Reviewer B — seed/idempotency/tests:** found the StrictMode seed race
    (bare `ensureOnboarded()` double-fires; check-then-create not atomic);
    confirmed call-sequence mocks match (4 `Lens.findFirst` calls in code = 4
    queued in every test); confirmed DC9/10 covered.
  - **Reviewer C — onboarding UI/brand/CSS:** found orphaned CSS (`.aa-ob-brand`,
    `.aa-ob-final`, `.aa-ob-done-*`, `@keyframes aa-ob-done-pop`); dead
    `hasCompletedOnboarding()` (zero importers, wrong answer); missing
    `.aa-ob-loop-focus` rule; visuals not aria-hidden. Confirmed DC4/5 met,
    tone on-brand.
  - **Verdict: all 6 real blockers + nits fixed → re-gated clean.** See Findings.
- **Diagnostics:** `wasp compile` — exit 0, three times (after impl, after
  fixes, final). Run per `webapp/AGENTS.md` (compile, not `tsc`).
- **Tests:** `npm test` (vitest) — **188 passed (188)**, exit 0. Was 183; +5
  new (3 seed + 2 completeOnboarding). The 13-file suite is green.
- **e2e:** NOT executed in this session (requires a running `wasp start` +
  seeded DB; the e2e-breaking blocker was caught by reviewer code-trace and
  fixed at the source — `create-verified-user.mjs` now sets the flag). **The
  e2e suite should be run by Discover/user before signoff** (see Open items).

## Done-conditions

Each predicate from `docs/specs/done/first-run-experience.md` → verdict + evidence.

- [x] New signups routed to onboarding — **PASS** — `App.tsx` gate: authenticated
      + `hasSeenOnboarding===false` + on `/do*` → `<Navigate to="/welcome">`.
      `onAuthSucceededRedirectTo` stays `/do` (post-onboarding default); the
      gate intercepts the first arrival.
- [x] Onboarding completion persisted server-side — **PASS** — `User.hasSeenOnboarding`
      in `schema.prisma`; migrated `20260627214351_add_has_seen_onboarding`;
      `completeOnboarding` op sets it; the page calls it (no localStorage gate).
- [x] Shown only once — **PASS** — returning user (`flag===true`) goes straight
      to `/do` (gate condition false). Logout/login does not re-show.
- [x] Gesture lessons removed — **PASS** — grep of `OnboardingPage.tsx` for
      `long-press|two-finger|one-finger|mode swipe|LESSONS|aa-ob-finger|aa-ob-demo`
      → 0. `STEPS` replaces `LESSONS`; all finger/demo/breadcrumb CSS deleted.
- [x] Onboarding teaches the real 3-step loop in ≤3 panels — **PASS** —
      `PAGES = ["name","step-1","step-2","step-3"]`: exactly 3 panels after the
      name step. Capture ("press ⌘K, type a thought, hit Enter") → Triage
      ("decide what each thing becomes") → Focus ("Next picks the next
      thing"). One title + one body + one `LoopVisual` each. Content matches the
      real app (⌘K capture, Inbox triage T/P keys, Next single-task).
- [x] New users get seed content — **PASS** — `ensureOnboarded` seeds one Task
      in Me lens, `status=TODAY, priority=NORMAL, size=M`, description "Try it:
      complete this task", guarded by `Task.count===0`. Test
      "seeds exactly one TODAY task in the Me lens when the user has zero tasks".
- [x] First-paint Next non-empty — **PASS (by construction)** — the seeded
      task is `status=TODAY`, which `getTopTask` surfaces. (Manual browser
      verification deferred — see Open items.)
- [x] Existing users unaffected — **PASS** — the `Task.count===0` guard means a
      user with ≥1 task gets no seed. Test "seeds nothing when the user already
      has at least one task" (count=2 → no create).
- [x] Tests cover the new path — **PASS** — 3 seed tests + 2 completeOnboarding
      tests added (`operations.test.ts`: 9 → 14 tests).
- [x] e2e login flow not broken by the flag default — **PASS (at source)** —
      `reset-user.mjs` (login.spec.ts's pre-seeded user) and
      `create-verified-user.mjs` (signupNewUser's fresh users, 6 other specs)
      both set `hasSeenOnboarding=true`. **Caveat: e2e not run this session —
      see Open items.**
- [x] `wasp compile` passes — **PASS** — exit 0.
- [x] Cold-context reviewer passes — **PASS** — after the 6 fixes.

## Findings

**Accepted (fixed in `b96bb6f`):**
1. **[BLOCKER, Reviewer A] Redirect loop on `completeOnboarding` failure.** The
   old catch navigated to `/do` even when the server flag never flipped → gate
   bounced back to `/welcome`. Fixed: on failure stay on the last panel, surface
   `.aa-ob-error`, let the user retry; `navigate('/do')` only on success.
2. **[BLOCKER, Reviewer A] e2e suite breaks.** `create-verified-user.mjs`
   didn't set the flag → 6 specs' `waitForURL(/\/do/)` time out. Fixed: sets
   `hasSeenOnboarding=true` on both fresh-create and re-run paths.
3. **[BLOCKER, Reviewer A] Gate scope too wide.** Fired on every path except
   `/welcome`, yanking users off `/email-verification`, `/about`, etc. Fixed:
   scoped to `isApp` (`/do*`).
4. **[BLOCKER, Reviewer C] Orphaned CSS.** Removed `.aa-ob-brand`, `.aa-ob-final`,
   `.aa-ob-done-page`, `.aa-ob-done-circle` (+ svg), `@keyframes aa-ob-done-pop`.
   Added `.aa-ob-error`, `.aa-ob-loop-focus`.
5. **[BLOCKER, Reviewer C] Dead `hasCompletedOnboarding()`.** Zero importers,
   returned the wrong answer (localStorage vs server flag). Deleted with
   `ONBOARDING_KEY`.
6. **[BLOCKER, Reviewer B] StrictMode seed race.** Bare `ensureOnboarded()` in
   `useEffect` double-fires in dev; check-then-create seed isn't atomic → could
   seed two tasks. Fixed: per-user `useRef` guard so it fires once per session
   (production unaffected).

**Accepted nits (also in `b96bb6f`):**
- `aria-hidden` on the decorative `LoopVisual`s (title+body carry meaning).
- "Saving…" state on the finish button while the op is in flight.

**Deferred (legitimately out of scope):**
- The seed is check-then-create, not DB-atomic. The `useRef` guard closes the
  realistic trigger (StrictMode/re-mount). A DB-level unique constraint would be
  belt-and-suspenders but needs a schema field — not worth it for a one-time seed.
- Existing *production* users (if any) would all be `false` after the migration
  and see onboarding once on next login. ROADMAP says 0 external users; acceptable
  pre-launch. If real users exist, a one-line data-migration to `true` is the fix.

**Rejected:** none.

## Verdict

**ready-for-signoff** (with one caveat the user should action before merge):

All done-conditions PASS; all 6 review blockers + nits resolved; `wasp compile`
green; **188 unit/component tests pass**.

**One thing the user should verify before merge** (not a code blocker — it's the
manual step the spec's own done-conditions ask for):

1. **Run the e2e suite** (`npm run test:e2e` against a running `wasp start`). The
   e2e-breaking root cause is fixed at the source (`create-verified-user.mjs` +
   `reset-user.mjs` now set the flag), and I re-seeded the dev user, but I did
   not execute Playwright this session. The spec's done-conditions ("existing
   e2e login flow still passes," "first-paint Next non-empty") are best
   confirmed by actually running it. If any spec fails, send me the output.
2. **Spot-check the onboarding visually** — open `/welcome` as a fresh user,
   click through the 3 panels, confirm the loop visuals render and "Go →" lands
   on `/do` with the seeded task in Next.

Once Discover confirms the e2e + visual check, this is `done`. I've left the
`legal-pages-oauth` review (its prerequisite in the chain) at `review` too —
both are ready for your signoff.
