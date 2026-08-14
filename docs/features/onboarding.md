---
slug: onboarding
title: "Onboarding (/welcome, server flag, guided first loop)"
feature_area: foundation
status: shipped
spec: first-run-experience.md    # done
verified: 2026-07-03
---

# Onboarding

**What.** Carousel: Welcome → (Name step if no firstName) → Capture → Triage →
Focus. `completeOnboarding` persists `User.hasSeenOnboarding = true` server-side
+ sends a welcome email (best-effort, non-blocking).

**Server flag survives device/browser switch.** `App.tsx` redirects authed users
with `hasSeenOnboarding === false` on `/do` paths → `/welcome`.

**Guided first loop.** `ensureOnboarded` creates default Work + Me lenses, a
"General" project per lens, and one sample TODAY task in Me. Persisted
`onboardingStage` moves **SAMPLE_TASK → CAPTURE → TRIAGE → COMPLETE** after the
real sample completion, first capture, and first triage. Capture and triage are
contextual actions, never fake Tasks. Existing members default to `COMPLETE`;
someone returning to the product can skip the explainer and guided loop, which
also records `COMPLETE` and seeds no sample task.

**Files.** `onboarding/OnboardingPage.tsx`; `onboarding/operations.ts`; gate in
`App.tsx`; guided actions in `NextPage.tsx`; transitions in task/inbox ops.

**Done?** Shipped (first-run-experience spec, done 2026-06-27).
