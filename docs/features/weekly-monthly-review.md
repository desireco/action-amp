---
slug: weekly-monthly-review
title: "Today, Week + Month Reviews"
feature_area: review
status: shipped
spec: weekly-monthly-review
verified: 2026-08-08
---

# Today, Week + Month Reviews

**What.** Three distinct completion debriefs over the same underlying history:
Today closes the day, Week aligns effort and aging work, and Month celebrates
Goal progress and chooses direction. Logbook remains the chronological record.

**Routes.** `/app/review` resolves from the user's enabled cadences;
`/app/review/today`, `/app/review/week`, and `/app/review/month` accept a local
calendar date through `?for=`. Review periods use the browser IANA time zone;
weeks run Monday–Sunday and month boundaries follow the local calendar.

**Evidence.** Completed Goals receive the strongest calm treatment, followed
by completed Projects and every completed Task. Tasks retain Outcome,
Goal/Project, Lens, and completion-time context. Week/Month can filter by Lens
without splitting the ritual, and count completed actions by Lens. Recorded
focus time is derived from overlapping completed Task sessions.

**Cadence differences.** Today has one optional memory prompt and a Close today
action. Week and Month lead with up to five completed Medium/Large actions,
then retain the complete accomplishment history. Week adds effort shape and two
alignment prompts. Month adds weekly slices, three direction prompts, and an
optional active Goal emphasis for next month.

**Persistence.** Optional answers autosave into `Review`, keyed by user,
cadence, and period start. Week and Month require no finish action and remain
editable. Close today records a stable accomplishment snapshot; current-day
work remains live until updated.

**Preferences.** Settings → Preferences → Reviews independently toggles Today,
Week, and Month; all default on. Disabled routes redirect to the first enabled
cadence, then Logbook. Disabling never deletes completion data or saved reviews.

**Guardrails.** Available to every account. No reminders, AI summaries,
arbitrary ranges, export, team reporting, streaks, scores, badges, confetti,
red-dot nags, or judgmental period comparisons.

**Implementation.** `webapp/src/reviews/`, `webapp/schema.prisma`, migration
`20260808120000_review_rhythms`, Review routes/operations in `main.wasp.ts`, and
preference/navigation integration in `webapp/src/app/`.

**Spec + prototype.** `docs/specs/weekly-monthly-review.md` and
`docs/mockups/review-rhythms.html`.
