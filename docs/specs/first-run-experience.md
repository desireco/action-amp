---
feature: first-run-experience
status: done
spec_owner: discover
build_owner: build
---

# Feature: First-run experience

## Summary

A brand-new user who signs up should be **guided to the magic moment**, not
dumped on an empty screen. Today onboarding is dead code and teaches the wrong
thing; a new user lands on What Now showing *"Nothing on the table"* with an
empty inbox and no path to feeling the product pick their next task. This spec
fixes the front door: route new signups through a short, real onboarding, seed
them one example task so What Now is non-empty on first load, and remove the
mobile-gesture lessons that the webapp doesn't implement.

## Why

The free-tier audit (ROADMAP.md §Free-tier audit B) found three compounding
churn cliffs at the front door:

1. `hasCompletedOnboarding()` is defined in `OnboardingPage.tsx:342` and
   **never called**. `onAuthSucceededRedirectTo: "/app"` in `main.wasp.ts:68`
   skips `/welcome` entirely.
2. The 4 onboarding "lessons" (`OnboardingPage.tsx:24-45`) teach mobile
   gestures (long-press, two-finger zoom, one-finger mode swipe) that the
   webapp does **not** implement — real interaction is keyboard + buttons.
3. `ensureOnboarded` (`onboarding/operations.ts`) creates empty lenses and
   empty "General" projects only. First-paint What Now is *"Nothing on the
   table."*

A user who hasn't felt the magic won't do homework to feel it. This is the #1
retention cliff and the cheapest to fix.

## Done-conditions

Each is a checkable predicate. Verify against the running app + the test suite.

- [ ] **New signups are routed to onboarding.** A fresh user (cleared DB /
      new email) who completes auth lands on `/welcome`, not `/app`. Verified:
      `main.wasp.ts` `onAuthSucceededRedirectTo` still points to `/app`
      (default post-onboarding), and the redirect-to-onboarding decision is
      made client-side in `App.tsx` or `AppShell.tsx` based on a user flag.
- [ ] **Onboarding completion is persisted server-side, not in localStorage.**
      A `User.hasSeenOnboarding Boolean @default(false)` field exists in
      `schema.prisma`, migrated with `wasp db migrate-dev --name
      add_has_seen_onboarding`, and `hasCompletedOnboarding()` reads it (or is
      replaced by reading `context.user.hasSeenOnboarding`).
- [ ] **Onboarding is shown only once.** A returning user
      (`hasSeenOnboarding === true`) goes straight to `/app`. Verified:
      logging out and back in does NOT re-show onboarding.
- [ ] **The gesture lessons are removed.** `OnboardingPage.tsx` no longer
      references long-press, two-finger swipe, or one-finger mode swipe. The
      `LESSONS` array and any `aa-ob-finger-*` CSS/demo markup are deleted.
- [ ] **Onboarding teaches the real 3-step loop in ≤3 short panels:**
      (1) Capture — "press ⌘K (or ⌘/), type a thought, hit Enter";
      (2) Triage — "go to Inbox, decide what each thing becomes";
      (3) Focus — "What Now picks your next task. Do it. The rest disappears."
      Each panel is one sentence + one visual. No more than 3 panels total
      after the preferred-name step.
- [ ] **New users get seed content**, created by `ensureOnboarded` only when
      the user has zero tasks (idempotent guard): exactly **one** example Task
      in the Me lens with `status=TODAY`, `priority=NORMAL`, `size=M`, e.g.
      description "Try it: complete this task". No fake projects/goals beyond
      the existing "General" project.
- [ ] **First-paint What Now is non-empty for a new user.** Verified: after
      onboarding, `/app` shows the seeded task in the What Now card, not the
      "Nothing on the table" empty state.
- [ ] **Existing users are unaffected.** `ensureOnboarded`'s seed branch is
      guarded by "user has zero tasks," so the 0 existing production users who
      already have tasks get nothing new. (Confirm: no InboxItem/Task is
      created for a user who already has ≥1 task.)
- [ ] **Tests cover the new path.** A Vitest test asserts `ensureOnboarded`
      seeds exactly 1 TODAY task for a user with 0 tasks and 0 for a user with
      ≥1. The existing e2e login flow still passes (it uses a pre-seeded
      verified user — confirm it doesn't break by the hasSeenOnboarding
      default).
- [ ] **`wasp compile` passes** (per `webapp/AGENTS.md` — compile, not `tsc`).
- [ ] **Cold-context reviewer passes** (Build's gate; this is Build's to run).

## Non-goals

- **No multi-step tour / coachmarks inside `/app`.** One-shot onboarding only.
  In-app spotlights are a separate, later spec.
- **No onboarding for the capture/triage *mechanics* beyond the 3 panels.**
  The empty-state copy already instructs; don't build a tutorial.
- **No changes to auth methods.** Email-only stays; Google auth is a separate
  spec (`social-auth-google`).
- **No seed of multiple tasks / projects / goals.** Exactly one task. The
  point is to make What Now non-empty, not to fake a populated life.
- **No analytics events** in this spec (that's `observability-minimal`).
- **No redesign of the onboarding visual style.** Reuse existing
  `OnboardingPage.css` tokens; only swap content.

## Open questions

- _(none — all resolved above. If Build finds `hasSeenOnboarding` collides
  with an existing field, use a distinct name and note it in the review.)_

## Prototypes

_(none — content + routing change; no new UI paradigm to validate.)_
