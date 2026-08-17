---
slug: next-what-now
title: "Next / What Now (the home screen + the wedge matcher)"
feature_area: focus
status: shipped
spec: focus-why-transparent.md   # done — the "why this?" line
verified: 2026-08-16
---

# Next / What Now

**What.** The home screen (`/do`) is a chooser, not a list. It surfaces **one**
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

**Captured images** (2026-08-16; revised same day). A task carrying images
from triage (`TaskAttachment`) shows them **on the card itself** — display-
only thumbs (md, shared lightbox on click) in their own centered band below
the "Why does this matter?" goal block, with breathing room above and below
(`.aa-wn-card__attachments`, `margin: 14px 0 36px`). The task on stage can
be judged by what was actually shared. (First cut was a calm "1 image" text
chip in the meta row — replaced the same day: the real thing beats a count on
the one card the app opens to.) Focus and the task detail page show the same
thumbs.

**Added 2026-08-10 — three rationale layers, never conflated**
(focus-goal-context spec). Next candidate (`state="next"`) shows, in order:

1. **Matcher "why now"** — the existing `composeWhy` line, amber emphasis,
   unchanged.
2. **Goal rationale "why at all"** — `Why does this matter?` / trimmed Goal
   description / `Goal · <name>` (quiet violet), or `Toward <Goal name>.` when
   the Goal has no description, or nothing when no Goal resolves. Resolution:
   `task.project.goal` → legacy `task.goal` → none. Never manufactured from
   Project/Task text, priority, due date, or work history.
3. **Paused-work continuity** — a compact stats row (`<n> min worked · <n>
   sessions · <n> notes`, zero segments omitted, correct singular/plural) plus
   an optional two-line `Latest note` preview. Derived from valid closed
   `TaskSession`s (`endedAt > startedAt`; sub-60s → `<1 min worked`) and
   trimmed non-empty `TaskUpdate.kind === NOTE` rows (COMPLETED excluded).
   Newest NOTE only, passive plain text. A fresh Task renders no block.

The home **`now` state** does **not** show the paused-work summary — live
execution context belongs in Focus. History relations attach only to the ranked
winner (not every candidate) via a shared owned hydration core
(`hydrateTopTaskData`); normalization lives in the pure `app/taskContext.ts`.

**Added 2026-08-16 — the alternatives rail** (WORKFLOW.md §5.12). Below the
card, while deciding (`next` candidate state, picked task included), the next
ranked candidates (up to 2) render under "Or choose another task in \<Lens\>"
with the hint "The recommendation stays available." Sourced from
`getTaskAlternatives` (`tasks/operations.ts`) → `getTaskAlternativesData`
(`tasks/operationsCore.ts`): the same `activePoolWhere` pool and comparator as
`getTopTask`, minus the on-stage task's id (`excludeIds`), rows light (project
name only, no history hydration). Choosing a row navigates to
`/do/today/:permalink` (the existing picked-task path) — nothing is snoozed,
started, or demoted; the recommendation re-enters the list flagged "Suggested".
The rail is hidden when the on-stage task is Now (`startedAt`) or the pool
holds nothing else. Verified 2026-08-16 by `tasks/operationsCore.test.ts` +
`tasks/operations.test.ts` (alternatives core + op: same pool/comparator,
excludeIds, limit) and `components/ui/NextAlternatives.test.tsx` (rows,
kicker, onChoose, empty suppression).

**Files.** `app/NextPage.tsx`; `components/ui/NextCard.tsx`;
`components/ui/NextAlternatives.tsx`; `tasks/operations.ts`
(`getTopTask` → rank → `hydrateTopTaskData`; `getTaskAlternatives`);
`tasks/operationsCore.ts` (`getTopTaskData`, `getTaskAlternativesData`,
`TASK_ALTERNATIVES_LIMIT`, `hydrateTopTaskData`); `app/focusWhy.ts`;
`app/taskContext.ts`.

**Verified 2026-08-10.** `tasks/operationsCore.test.ts` + `tasks/operations.test.ts`
(ranking unchanged + winner hydration), `app/taskContext.test.ts` (Goal
precedence, time arithmetic, NOTE filtering, grammar), `components/ui/NextCard.test.tsx`
(Goal described/fallback/absent, combined/time-only/notes-only stats, latest-note
preview, zero suppression, fresh state, `now`-state suppression), `wasp compile`.

**Done?** Shipped + verified. The transparent "why this?" shipped under the
`focus-why-transparent` spec (done 2026-06-27). The matcher itself is the MVP
priority sort; the moment-aware extension is `focus-engine-v2` (gated, not built).

**This is the wedge.** The roast's finding: the matcher is the only real moat
and currently the weakest shipped part. `focus-engine-v2` + the manual-matcher
test are what close that gap.
