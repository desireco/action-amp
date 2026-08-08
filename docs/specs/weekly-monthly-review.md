---
feature: weekly-monthly-review
status: done
spec_owner: discover
build_owner: build
priority: P3
kind: spec

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mgsfa # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:45:22Z
---

# Feature: Today, Week + Month Reviews

> Approved plan and implementation record, 2026-08-08. The filename and
> feature slug stay unchanged for GitHub Projects sync continuity.

## Product decision

Review is not another report and not a renamed Logbook.

- **Logbook** answers: “What happened, and when?” It remains the complete,
  reverse-chronological record.
- **Today review** answers: “What did I finish today, and can I let today end?”
- **Week review** answers: “Which meaningful actions moved work forward?”
- **Month review** answers: “Which goals moved or landed, and what deserves my
  attention next?”

All three reviews use the same completion data, but each has a different
information hierarchy and reflection depth. Today has a closing action; Week
and Month autosave without requiring completion. They must not be implemented
as one generic report with a different date range.

## Why this change

Review is currently the least-built ActionAmp area. Its only shipped surface is
Logbook: useful as history, weak as reflection. A person who feels they achieved
nothing should be able to open Review and see concrete evidence of every task,
project, and goal they completed.

The feature must also respect ActionAmp’s central promise. Review should reduce
mental load, not create another recurring obligation. Every cadence is optional.
No overdue-review badge, streak, score, nag, or shame state exists.

## Experience principles

1. **Evidence before metrics.** Lead with named accomplishments. Counts are
   supporting context, never the hero.
2. **Every completed task remains inspectable.** Grouping and collapsing may
   reduce density, but no task disappears into an aggregate.
3. **Goals receive the strongest celebration.** A completed Goal is rare and
   meaningful. Show it before task counts, using warm emphasis and generous
   space—not confetti or gamification.
4. **Reflection stays optional.** Users can complete a review without writing.
   Existing task Outcome notes supply useful reflection automatically.
5. **Review recognizes accomplishment, not cleanup work.** Week and Month lead
   with completed Medium/Large actions rather than unresolved commitments.
6. **No comparison as judgment.** Previous-period numbers may provide context,
   but never “better,” “worse,” red/green arrows, records, or rankings.
7. **Completion data is never deleted by settings.** Disabling a cadence hides
   its ritual; Logbook and saved past reviews remain intact.

## Information architecture

### Routes

- `/app/review` — preference-aware redirect to the first enabled cadence, then
  Logbook when all three are disabled.
- `/app/review/today?for=2026-08-08`
- `/app/review/week?for=2026-08-03`
- `/app/review/month?for=2026-08-01`
- `/app/logbook` — unchanged historical record.

`for` is a local calendar date. Server range calculation must use the user’s
IANA time zone and be tested across daylight-saving boundaries.

### Desktop navigation

Review group order:

1. Today
2. Week
3. Month
4. Logbook

Disabled cadences disappear. Logbook cannot be disabled. Review items do not
show attention counts or “due” dots.

### Mobile navigation

Mobile dock keeps one **Review** item. It opens `/app/review`, which forwards to
the first enabled cadence in Today → Week → Month order. If all cadences are
disabled, it opens Logbook. No intermediate Review home adds an extra tap.

### Scope across Lenses

Cadence reviews are universal
across Lenses, like Today. Accomplishments should not be split into separate
Work and Me rituals. Rows retain their Lens identity and Week/Month can filter
by Lens inside the page. Logbook remains scoped as it is today.

This structural exception is recorded in `docs/WORKFLOW.md` and cascaded to
`INTERACTION.md`, `PAGES.md`, `DATA-MODEL.md`, feature catalog, and roadmap.

## Shared review frame

Every cadence uses a common frame while keeping distinct content:

- cadence label + human-readable period;
- previous/next period controls;
- “Check-in” and “In progress” labels for an unfinished day/week/month;
- completed Goal celebration, when present;
- completed Project recognition, when present;
- complete task evidence with Outcome text when available;
- completed Task counts by Lens in Week and Month;
- optional context-sensitive response fields: check-in while underway,
  retrospective reflection after completion;
- autosave for every response field, with check-in and reflection stored
  separately;
- a closing action and “Reviewed” state for Today only.

Keyboard baseline:

- `[` / `]` — previous/next period;
- `J` / `K` — move through visible groups or prompts;
- `Enter` — open selected item or activate selected choice;
- `E` — edit reflection;
- `R` — close the current open Today review;
- `Esc` — leave edit state without losing saved content.

Shortcuts must not fire while typing in an input or textarea.

## Today review — closure

### Job

Provide a two-to-three-minute end-of-day landing. Recognize everything finished
today, preserve the user’s own Outcome words, then allow the day to feel closed.

### Default period

Current local day. Previous/next navigation supports revisiting another day.
Reviewing before midnight is allowed and marked “Today · in progress.”

### Screen order

1. **Day header** — “Today” plus full date.
2. **Goal landed** — only when a Goal completed that day. Large, quiet card:
   “You completed a goal” + Goal name + its description when present.
3. **Projects completed** — compact recognition cards.
4. **Tasks completed** — every completed task, grouped by Lens then Project.
   Each row shows title, completion time, and Outcome when present.
5. **Optional check-in** while Today remains open: how it is going, what is
   going well, what is challenging, and what deserves attention for the rest
   of today.
6. **Close today** — marks this review complete and replaces the visible
   check-in prompts with one retrospective prompt: “What do you want to
   remember from today?” It does not roll tasks over,
   change Next, or force tomorrow planning.

### Celebration behavior

- If one task was completed, name that task; do not say “only one.”
- If many tasks were completed, show the full list. Groups may start collapsed
  after eight rows, with explicit “Show all N tasks.”
- Completed Goal uses amber-soft human emphasis; task completion uses teal.
- One short completion transition may reveal “Today is recorded.” Respect
  `prefers-reduced-motion`. No sound in v1.

### Empty day

Copy: “Nothing completed today. You can still leave a note and close the day.”

The review remains completable. No capture CTA, productivity advice, or implied
failure.

### What Today review does not do

- no stuck or overdue list;
- no comparison with yesterday;
- no tomorrow planning checklist;
- no requirement to add Outcome text to each task.

## Week review — alignment

### Job

Show where effort accumulated across seven days, connect completed tasks to
Projects and Goals, then resolve a small number of loose commitments.

### Period

Monday 00:00 through Sunday 23:59:59 in the user’s time zone. Default is the
current week, clearly labeled “in progress” until Sunday ends. Past weeks remain
navigable.

### Screen order

1. **Week header** — date range, completed/in-progress status.
2. **Goals landed** — all Goals completed in the week, before counts.
3. **What moved** — Goal → Project → Task hierarchy. Every completed task is
   present. Standalone projects and tasks appear in honest “No goal” and
   “General” groups.
4. **Effort shape** — neutral supporting summary: tasks completed per Goal,
   Projects completed, focus time when TaskSession data exists. No score or
   previous-week verdict.
5. **Actions completed** — up to five completed Medium/Large Tasks, with Large
   first and the most recent within each size. Show title, project/goal context,
   completion date, and Outcome when present.
6. **Completed actions by Lens** — count every completed Task in the period,
   grouped by Lens. The in-page Lens filter scopes these counts.
7. **Optional response**, selected automatically by period state:
   - current-week check-in: “How is this week going?”, “What is going well?”,
     “What is challenging?”, and “What deserves attention for the rest of this
     week?”;
   - past-week reflection: “What moved forward?” and “What should change next
     week?”.

Check-in and retrospective fields persist independently. When the week ends,
the earlier check-in remains saved while the visible prompts switch to review.

Week has no Close or Finish action. Saved responses remain editable.

### Progressive disclosure

Goal and Project groups show meaningful headings and counts. Groups may
collapse, but the page must expose “Show all N completed tasks.” Search and
Logbook remain available for chronology.

### Empty week

Lead with: “No completed work in this week.” Then show any saved Outcomes or
reflection only if present. The decision section may still help, but it never
becomes a scolding cleanup list.

## Month review — direction

### Job

Zoom out from activity. Celebrate completed Goals, show which Goals absorbed
effort, and help the user choose what deserves attention next month.

### Period

Calendar month in the user’s time zone. Default is the current month, labeled
“in progress” until its final day ends.

### Screen order

1. **Month header** — month and year.
2. **Goals completed** — primary celebration. Each Goal receives its own
   spacious card with linked completed Projects and task total.
3. **Progress by Goal** — Goals with meaningful activity, ordered by completed
   work rather than current manual project order. Each shows completed Projects,
   every completed task behind an expanded/collapsed group, and Outcome excerpts.
4. **Work outside Goals** — standalone Projects and General tasks, visible but
   visually secondary. Never label them wasted or unaligned.
5. **Month shape** — week-by-week slices showing when work landed. This is
   context, not a heat map and not a streak calendar.
6. **Actions completed** — up to five completed Medium/Large Tasks, with Large
   first and the most recent within each size. This provides a deliberate
   accomplishment summary before the complete history.
7. **Completed actions by Lens** — count every completed Task in the month,
   grouped by Lens. The in-page Lens filter scopes these counts.
8. **Optional response**, selected automatically by period state:
   - current-month check-in: “How is this month going?”, “What is going well?”,
     “What is challenging?”, and “What deserves attention for the rest of this
     month?”;
   - past-month reflection: “What are you proud of?”, “What did this month teach
     you?”, and “What deserves attention next month?”.
9. **Choose next-month emphasis** — available only for a finished month as an
   optional single Goal selection. This does
   not silently reorder Projects or override the Next matcher; it is stored as
   review reflection until a separate planning decision defines product effect.

Month has no Close or Finish action. Saved responses remain editable.

### Completed-task guarantee

Large months need progressive disclosure, not omission. The Goal/Project groups
must eventually reveal every completed task with title, completion date, and
Outcome. Export is outside v1; Logbook remains chronology source.

### Empty month

Copy: “No completed work recorded for this month.” Reflection and next-month
emphasis remain available. No corrective CTA.

## Settings → Preferences → Reviews

Add a **Reviews** section to the existing Preferences page. Controls auto-save
independently:

- `Today review` — default on;
- `Week review` — default on;
- `Month review` — default on.

Supporting copy: “Choose which reflection rhythms appear in Review. Turning
one off hides it; it does not remove completed work or past reviews.”

Behavior:

- disabling hides cadence from desktop Review nav and redirect resolution;
- disabling current route redirects to next enabled cadence, then Logbook;
- re-enabling restores route and saved review history;
- Logbook is always available and has no toggle;
- toggles affect no task, project, goal, Outcome, or completion timestamp;
- no notification/time controls in v1. Review reminders require a separate
  opt-in design and are not implied by enabling a cadence.

## Persistence and data contract

### User preferences

Add three booleans to `User`:

- `todayReviewEnabled Boolean @default(true)`
- `weekReviewEnabled Boolean @default(true)`
- `monthReviewEnabled Boolean @default(true)`

Expose them through `getAppData`. Save through one validated action:
`saveReviewPreferences({ today, week, month })`.

### Saved review

Guided reflection needs persistence. Add:

```text
Review
  id
  userId
  cadence       DAILY | WEEKLY | MONTHLY
  periodStart   DateTime
  periodEnd     DateTime
  timeZone      String
  answers       Json
  snapshot      Json
  completedAt   DateTime?
  createdAt
  updatedAt
  unique(userId, cadence, periodStart)
```

`answers` uses a runtime-validated shape per cadence. Active-period keys
(`howGoing`, `goingWell`, `challenges`, `currentAttention`) coexist with each
cadence's retrospective keys; switching state never overwrites either set. For Today,
`snapshot` stores the visible accomplishment evidence when the day is closed:
task/project/goal IDs, names, Outcomes, hierarchy labels, Lens labels, and
completion timestamps. This prevents a past review from losing its story when
an item is later reopened, renamed, moved, or deleted.

Week and Month remain live and need no closing action. If more work completes,
their accomplishment evidence updates while saved answers remain. If more work
completes after Today was closed, page shows the new completion count without
reopening its saved responses.

### Read operation

`getReview({ cadence, for, timeZone })` returns:

- normalized period boundaries and status;
- saved Review draft/completion state;
- completed Goals, Projects, and every Task in range;
- hierarchy and Lens metadata needed for grouping;
- task Outcomes and relevant TaskUpdate/TaskSession summaries;
- Task size for selecting weekly/monthly Medium/Large highlights;
- count of current-day completions newer than Today’s saved snapshot.

Authorization always keys on authenticated `userId`. Time zone must be a valid
IANA identifier. Range helpers receive an injectable clock and have DST tests.

### Write operations

- `saveReviewDraft({ cadence, periodStart, timeZone, answers })`
- `completeReview({ cadence: DAILY, periodStart, timeZone, answers })`

Writes are idempotent through the unique period key. Client autosaves answers
after a short debounce and shows a quiet Saved/Error state.

### Read-only CLI report

`actionamp review week|month` reads the shared review core through the
PAT-protected `GET /api/cli/review` route. Default scope remains universal
across Lenses; `--lens-id` is explicit and never inherited from CLI config.
`--previous` and `--for YYYY-MM-DD` select the period. `--json` returns named
evidence, totals, action counts by Lens, up to five L/M highlights, focus time,
explicit `in_progress`/`finished` state, separate saved `checkIn` and
`reflection`, and monthly Goal emphasis. No CLI review write or close
operation exists.

## Interactive prototype

`docs/mockups/review-rhythms.html` is the interactive, disposable design
artifact used to validate the three rhythms, settings, dark mode, and responsive
layout before the production UI was finalized.

It uses current ActionAmp tokens and shell, with four switchable states:

1. **Today** — six completed tasks across two Lenses, one completed Goal,
   Outcome excerpts, current-period check-in, Close today.
2. **Week** — eighteen tasks grouped by Goal/Project, one Goal completion,
   five Medium/Large accomplishment highlights, context-sensitive prompts.
3. **Month** — two Goal completions, several Project groups, four weekly
   slices, up to five Medium/Large accomplishment highlights, active check-in.
4. **Review settings** — three live toggles demonstrating nav removal and
   all-disabled fallback to Logbook.

Prototype interactions:

- switch cadence and period;
- expand/collapse completed-task groups;
- open Outcome details;
- type reflection and see Saved state;
- close Today and switch from check-in to retrospective reflection;
- toggle cadences in Settings and see Review nav adapt;
- light/dark and desktop/mobile layouts;
- reduced-motion behavior.

Prototype questions resolved during implementation:

1. Does completed-Goal celebration feel meaningful without becoming loud?
2. Can users distinguish Today closure, Week alignment, and Month direction in
   five seconds?
3. Is every completed task findable without making Month feel like a list app?
4. Do the Medium/Large highlights make meaningful accomplishment visible fast?
5. Does mobile’s direct jump to the first enabled cadence remain understandable
   without a Review home?

## Implementation record

### Phase 0 — product shape

- [x] Universal-across-Lenses review, all-on defaults, and availability to every
      account are locked in this spec.

### Phase 1 — prototype

- [x] Built the interactive artifact above.
- [x] Verified desktop/mobile, light/dark, dense states, settings adaptation,
      decision actions, and autosave behavior in a headless browser.
- [x] Incorporated prototype findings into the production hierarchy and copy.

### Phase 2 — canonical documentation

- [x] Updated `WORKFLOW.md` first for universal Review cadence scope.
- [x] Cascaded `INTERACTION.md`, `PAGES.md`, `DATA-MODEL.md`, feature catalog,
      and roadmap.

### Phase 3 — data foundation

- [x] Added Review cadence enum/model and three User preference fields.
- [x] Created and applied the migration through the Wasp workflow.
- [x] Added period/time-zone helpers with normal, leap-month, 23-hour, and
      25-hour boundary coverage.
- [x] Added read/write operations, ownership guards, JSON validation,
      snapshot/update logic, focus-session clipping, and tests.

### Phase 4 — settings and navigation

- [x] Added live Reviews controls to Preferences.
- [x] Adapted desktop Review navigation and mobile fallback.
- [x] Added preference-aware `/app/review` redirect and route guards.
- [x] Tested all eight enabled/disabled combinations.

### Phase 5 — cadence UI

- [x] Built the shared frame and distinct Today, Week, and Month experiences.
- [x] Reused existing Markdown and entity lifecycle operations.
- [x] Added keyboard behavior, responsive layout, dark mode, reduced motion,
      empty states, and dense-state disclosure.

### Phase 6 — verification and release docs

- [x] Unit and component coverage includes boundary math, scope, preferences,
      drafts, snapshots, post-review completions, all-task rendering, redirects,
      and keyboard suppression.
- [x] Wasp migration, compile, production build, and focused tests pass.
- [x] Code review findings were fixed and release documentation was updated.
- [ ] Live-app E2E was not run because no ActionAmp development server was
      active and this repository forbids starting one without explicit approval.
      The standalone prototype received browser interaction and responsive QA.

## Done conditions

- [x] Today, Week, Month, and Logbook are distinct Review destinations.
- [x] Each cadence can be enabled or disabled independently in Preferences.
- [x] Logbook remains available regardless of settings.
- [x] Every completed task in selected period is inspectable.
- [x] Completed Projects and Goals are recognized; completed Goals receive the
      strongest calm celebration.
- [x] Today supports closure; Week and Month foreground 3–5 completed
      Medium/Large actions when available.
- [x] Check-in and reflection are optional, autosaved separately, and revisitable.
- [x] Closed Today review preserves a stable accomplishment snapshot.
- [x] Week and Month responses autosave without a Close or Finish action.
- [x] No streaks, badges, scores, red-dot nags, confetti, or guilt copy.
- [x] Review UI supports keyboard, mobile, dark mode, and reduced motion.
- [x] Time-zone/DST boundaries are correct and tested.
- [x] Disabling a cadence never deletes review or completion data.

## Explicit non-goals for v1

- reminders, email, or push notifications for reviews;
- AI-written summaries or inferred reflection;
- sharing/exporting reviews;
- arbitrary date ranges or custom cadence schedules;
- team reviews or manager reporting;
- productivity scores, streaks, records, heat maps, or leaderboards;
- silently changing Next, Today, Goal order, or Project order from reflection;
- rewriting Logbook.

## Decisions locked for v1

1. **Universal scope:** all-Lens review with Lens grouping/filter.
2. **Defaults:** Today, Week, and Month enabled for existing and new users.
3. **Entitlement:** all accounts receive v1.
4. **Week boundary:** Monday–Sunday; locale-configurable start deferred.
5. **Month emphasis:** selected active Goal is reflection only; it does not
   affect matcher or planning.
