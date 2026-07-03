---
slug: next-what-now
title: "Next / What Now (the home screen + the wedge matcher)"
feature_area: focus
status: shipped
spec: focus-why-transparent.md   # done — the "why this?" line
verified: 2026-07-03
---

# Next / What Now

**What.** The home screen (`/app`) is a chooser, not a list. It surfaces **one**
task — the next thing that matters — with a "why this?" line. State machine:
`Next → (Start) → Now → (Done | Defer | Pause) → Next`. The Now state
(`Task.startedAt`) persists across navigation.

**`getTopTask` ranking** (`tasks/operations.ts`), in order:
1. `startedAt` non-null (in-progress = #1).
2. Status: TODAY > UPCOMING.
3. Priority: IMPORTANT > NORMAL > LOW.
4. Size: S < M < L < XL (quick wins first).
5. Oldest `createdAt`.

Candidate pool: `status ∈ {TODAY, UPCOMING}` AND (`dueDate` null OR `≤ now`),
active lens, not done. **No moment/time-of-day/energy factor yet** — that is
`focus-engine-v2` (not built).

**"Why this?" line** (`app/focusWhy.ts`, `composeWhy`). Composed from the actual
ranking factors, never fabricated; omitted entirely when nothing truthful applies.

**Files.** `app/NextPage.tsx`; `tasks/operations.ts` (`getTopTask`);
`app/focusWhy.ts`.

**Done?** Shipped + verified. The transparent "why this?" shipped under the
`focus-why-transparent` spec (done 2026-06-27). The matcher itself is the MVP
priority sort; the moment-aware extension is `focus-engine-v2` (gated, not built).

**This is the wedge.** The roast's finding: the matcher is the only real moat
and currently the weakest shipped part. `focus-engine-v2` + the manual-matcher
test are what close that gap.
