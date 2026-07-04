---
slug: onboarding
title: "Onboarding (/welcome, server flag, 3 seed tasks)"
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
with `hasSeenOnboarding === false` on `/app` paths → `/welcome`.

**Seed (magic moment).** `ensureOnboarded` creates default Work + Me lenses, a
"General" project per lens, and — when `Task.count === 0` — seeds 3 starter
TODAY tasks into Me lens ("Try it: complete this task", "Capture one real thing
on your mind", "Open the Inbox and decide what that thing becomes"). Runs once
per user session.

**Files.** `onboarding/OnboardingPage.tsx`; `onboarding/operations.ts`; gate in
`App.tsx`.

**Done?** Shipped (first-run-experience spec, done 2026-06-27).
