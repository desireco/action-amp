# ActionAmp — Workflow

> Status: CANONICAL — 2026-06-23
> Authority for: the app's area structure, what lives where, and how items move
> between areas. When this document conflicts with `FEATURES.md`, `PAGES.md`,
> `DATA-MODEL.md`, or `TRIAGE.md` on _structure_ (areas, contexts, destinations),
> **this document wins** and those are due for update.
>
> See "Decisions locked" (§5) for the resolved structural calls and
> "Code work implied" (§7) for the follow-up build items.
> When this document conflicts with `FEATURES.md`, `PAGES.md`,
> `DATA-MODEL.md`, or `TRIAGE.md` on _structure_ (areas, contexts, destinations),
> **this document wins.**

## 1. The mental model

ActionAmp has **three modes** — Work, Planning, Review — plus one pervasive
feature, **Capture**, that crosses all of them. Everything except Capture lives
inside a **context** (the Work/Me Lens): items enter a context only through
triage.

```
                            ┌──────────────────────────┐
                            │  CAPTURE  (pervasive)    │
                            │  ⌘K from anywhere        │
                            └────────────┬─────────────┘
                                         ▼
                                  ┌────────────┐
                                  │   INBOX    │  (unscoped — universal)
                                  └─────┬──────┘
                                        │  TRIAGE
                                        ▼
            ┌─────────────────┬─────────┴──────┬─────────────────┐
            ▼                 ▼                ▼                 ▼
        TASK              PROJECT           RESOURCE          (archive —
       (in a context)    (in a context)    (in a context)     kept, lossless)

  Context = a Lens (Work/Me default + user-defined on Pro). Scopes Tasks,
  Projects, Goals, Resources. Capture + Inbox are NOT scoped — universal.
```

Items only flow **left to right**: capture → inbox → triage → a context. Nothing
appears in Work/Planning/Review except by coming through triage.

## 2. The five areas

### 2.1 Capture (Inbox) — pervasive

- The **only** area that exists across every context and every mode.
- `⌘K` opens the capture popover from anywhere. **Enter** commits and
  closes (the common case — one thing on your mind, then back to work);
  **⌘Enter** commits and keeps the popover open to add another (rapid-fire).
  (Keymap reversed 2026-06-30 — see TRIAGE.md §7.5.)
- Destination is the **Inbox**, which is **universal** (not scoped to a lens).
- Natural-language parsing shows chips before Enter so you see what it
  understood. Grammar (locked 2026-07-04, §5.9): `#` tags · `@` time only ·
  `!`/`~` priority/size · `[[lens]]` explicit cross-lens override. Projects
  have no sigil — the resolver matches them from free text (a matched project
  carries its Project + Lens into triage Classify). See `docs/specs/done/capture-grammar.md`.
- Capture never asks "where does this go?" — that's triage's job. But capture
  _can_ hint: `[[work]]` / `[[personal]]` / `[[custom]]` preselects the Lens on
  triage's Classify step, and a matched Project can supply both Project and
  Lens. Capture is about speed (target: thought → inbox in under 2 seconds).

### 2.2 Triage — the transfer

- Walks the inbox one item at a time. For each item, decide **what it becomes**
  and **where it lands**, through a deliberate **per-item specification wizard**
  (`inbox/TriagePage.tsx`; see `TRIAGE.md` §4 for the canonical pattern).
- Outcomes: Task / Project / Resource / **Archive** (lossless — the note is
  kept, not deleted; recoverable from the Logbook).
- Filing targets are scoped — triaging an item places it in the **Lens selected
  or inferred on the wizard's Classify step** (§5.5). If a concrete Project is
  resolved, that Project supplies both the Project and Lens destination and the
  standalone lens picker is skipped by default.
- Triage never auto-clutters the Work area: a triaged Task defaults to
  **Upcoming** (the bench), which surfaces on Next only if undated or due
  (§5.2). Committing to Today is an explicit choice; demoting to Someday is, too.
- The single-card one-key dispatch (`1/2/3/P/R/Del`) is **gone** — replaced by
  the wizard steps (Classify → Spec → Ready). The old keymap survives only
  as step shortcuts where noted in `TRIAGE.md` §7.

### 2.3 Work Area — doing, right now

- Where **Now / Next** lives. The home screen (`/app`) is a chooser, not a list.
- Two surfaces:
  - **Next** — the single focus task. State machine:
    `Next → (Start) → Now → (Done | Defer | Pause) → Next`. The Now state
    (`Task.startedAt`) persists across navigation.
  - **Today** — the global committed-for-today list (across all lenses), capped
    at the user's `todayCap` (default 5, range 3–12, set in Preferences). The
    cap is a feature, not a limit — it forces the "what actually matters today"
    decision. Each row carries a trailing lens pill so the lens it came from is
    visible without partitioning the list. (Reversed 2026-07-21, §5.11.)
- **One Upcoming surface.** `UPCOMING` is the Task status for the bench —
  what's not yet committed to Today but still on the radar. It lives on a
  single page, `/app/upcoming` under Planning (locked 2026-07-05; re-reversed
  later that day to drop the same-page swap toggle that briefly coexisted
  with it). Date-bucketed (Overdue / This week / Next week / Later /
  Unscheduled), rose-tinted overdue, inline notes, per-row promote-to-Today.
  Today and Upcoming cross-link to each other from their heroes — Today's
  hero links to `/app/upcoming` (with the bench count), Upcoming's links
  back to `/app/today`. No same-page swap; one page per intent.
- **Done today is scoped to Today** (locked 2026-07-05). The "Done today"
  section on `/app/today` only shows tasks whose `status === "TODAY"` — not
  any task completed since midnight. Completion (from focus mode) leaves
  `status` untouched, so an Upcoming task finished via focus stays
  `status=UPCOMING` and is correctly excluded from Today's Done section.
- **Daily rollover (locked 2026-06-30).** At the start of each new calendar
  day, incomplete **Today** tasks roll to **Upcoming** so Today starts fresh
  — a deliberate re-commitment, not a backlog. Lazy: runs on app load (in
  `getAppData`), idempotent within a day via
  `User.lastTodayRolloverAt`. Done tasks are left alone; `startedAt` (the
  Now state) is preserved.
- This is the only area with a focus mode. Focus is a **dedicated route**
  (`/app/focus`, `FocusRoute` in `main.wasp.ts`) entered from Next's one-tap "Start"
  or any task row's focus affordance. The centered-session redesign (locked
  2026-08-07) removes the detached margin clock. One large centered countdown
  ring carries the user's 25- or 45-minute focus-session preference and the
  pause/resume control. Task title, task clarification, and explicit Note / Pause /
  Complete actions follow in one centered decision path. A completed countdown
  closes and marks its `TaskSession` complete without completing the Task; another
  focus session can begin on the same Task. Completing the Task still appends a
  `kind=COMPLETED` row to the task's `TaskUpdate` thread while leaving
  `status` untouched (so Today's Done section stays accurate). See
  `docs/features/focus-mode.md` + `docs/features/task-notes-completion-log.md`.
- A **Now** state (`Task.startedAt`) persists across navigation.

### 2.4 Planning Area — organizing

- Where **Projects** and **Goals** live, and where you organize tasks across
  time horizons.
- Projects: multi-step outcomes, always in a context. May sit under a Goal.
  **Lifecycle is fully editable** (locked 2026-07-05): complete / reopen /
  edit / delete / re-link, with explicit ordering under a Goal
  (`Project.order`) — the first non-done project surfaces as "Next: <name>".
- Goals: the organizing layer (active outcomes, e.g. "Run a 10k"), always in a
  context. **Same lifecycle as Projects** — complete / reopen / edit / delete /
  re-link; completed Goals surface in the Logbook with a Reopen affordance.
- **Someday** lives here (pending confirmation — §5): items with no date and no
  commitment, kept for "when I'm ready." A planning concept, not a working one.
- Creating Projects and Goals happens here (not in triage — triage _files into_
  them; Shift+P / last-picker-row is the one bridge, which navigates here).

### 2.5 Review / Reporting Area — reflection

- **Today, Week, and Month reviews** turn completion history into three distinct
  reflection rhythms: daily closure, weekly alignment, and monthly direction.
  Each shows completed Goals first, completed Projects, and every completed
  Task with its Outcome. Week and Month highlight up to five completed
  Medium/Large actions before the full history and count all completed actions
  by Lens. A period still underway is a **check-in**: how it is going, what is
  going well, what is challenging, and what deserves attention before it ends.
  A finished period is a **review**: accomplishments, learning, and direction.
  Check-in and review answers are stored separately so hindsight never
  overwrites what the user observed while work was happening. Month offers a
  next-month Goal emphasis only after the month ends. Every response autosaves.
- Cadence reviews are universal across Lenses, like Today. Rows keep Lens
  provenance and Week/Month offer an in-page Lens filter. This is the deliberate
  exception to the active-Lens rule; a person should not need separate rituals
  to understand one day, week, or month.
- Review preferences independently hide Today, Week, or Month. All default on;
  disabling a cadence deletes nothing. No reminders, scores, streaks, badges,
  red-dot nags, or guilt comparisons.
- The **Logbook** is the catch-all record of things no longer active:
  completed tasks (each carrying a `kind=COMPLETED` `TaskUpdate` since
  2026-07-05), past projects, **completed goals** (since 2026-07-05, with
  Reopen), and **archived notes** ("I will not do now" from triage — kept
  lossless, restorable to the inbox). This area is the _view over it_ (counts,
  trends — kept calm, no guilt-trip red dots, no streaks).
- Current Today alone offers **Close today**. Closing switches it from check-in
  to finished-day reflection and preserves a stable accomplishment snapshot so later edits,
  moves, reopenings, or deletion do not erase that day's historical view. Week
  and Month stay live and need no closing action. See
  `docs/specs/weekly-monthly-review.md`.

## 3. Context (Lens) scoping

- Every Task / Project / Goal / Resource belongs to exactly one **Lens**
  (a Work/Me default, plus any number of user-defined lenses on Pro). The
  active lens scopes every Work / Planning view and the Logbook.
- **Inbox, Capture, Today, and cadence Reviews are NOT scoped** — they're universal. A captured
  thought has no lens until triage assigns one (implicitly via the active lens,
  or explicitly if we adopt force-choice — §5). Today is universal so the day's
  commitment can be made across all lenses at once (reversed 2026-07-21, §5.11);
  each Today or Review row carries Lens provenance so it stays visible without
  partitioning the ritual.
- Switching lenses swaps Work, Planning, and Logbook content. Inbox, Today,
  and cadence Review content stay the same; Week/Month can filter inside the page.
- **The switcher is adaptive.** At ≤3 lenses the sidebar shows the segmented
  control (today's `<LensSwitch>`); at ≥4 it collapses to a single chip that
  opens a keyboard-navigable popover (`⌘L`, `↑↓`/`↵`/`/`/`esc`). The swap is
  pure presentational state on lens count — no routing change.
- **Lenses carry a stable `kind` handle** (`PERSONAL` / `WORK` for the seeded
  two, `CUSTOM` for user-defined). The entitlement guard branches on kind, not
  the user-facing name, so renaming "Work" → "Studio" can't escape FREE gating.
  Active-lens client state is keyed by lens id (not name) for the same reason.
- **Each Lens carries an identity color** (stored on `Lens.color` as a palette
  key: Work = `indigo`, Me = `emerald`, plus 6 curated hues for user-defined
  lenses — see `styles/tokens.css`). The active lens's hue is mirrored onto
  `<html data-lens>` and surfaces immersively — a faint background wash, the
  lens-switch dot + rail, the lens-scoped nav rail (Next/Projects/Goals/
  Someday/Logbook), the NextCard context label, and the Triage context-step.
  Today is universal but still shows lens identity: each row carries a trailing
  lens pill in the lens's hue. This is **identity, not decoration**, and it
  never borrows the reserved hues: teal = system/state (CTAs, links, the
  completion circle), amber = Important, violet = projects/goals, rose =
  errors. Inbox and Capture stay neutral — they have no lens. See
  `styles/tokens.css` (`--aa-lens-*`, `--aa-active-lens-*`).
- **Lens configuration is Pro-only.** Creating, renaming, recoloring,
  editing-purpose, and deleting lenses all require Pro (the Settings → Lenses
  tab is `<ProGate>`'d for FREE). FREE gets the seeded two: Me usable, Work
  visible-but-locked (selecting it shows the gate). Pro is soft-capped at
  `PRO_LIMITS.lenses`. The seeded two are renameable/recolorable but never
  deletable — they're the stable handles. See `docs/specs/done/custom-lenses.md`.

## 4. The three modes

The three modes are framings, not separate apps. Each maps to an area cluster:

| Mode         | Primary area         | What you do there                                  |
| ------------ | -------------------- | -------------------------------------------------- |
| **Work**     | Work Area (§2.3)     | Execute: pick the Next task, start it, finish it.  |
| **Planning** | Planning Area (§2.4) | Organize: arrange projects, goals, Someday.        |
| **Review**   | Review Area (§2.5)   | Reflect: metrics, completion history, stuck items. |

Capture (§2.1) is available in all three. Triage (§2.2) is the transfer gate
between Capture and any of them.

## 5. Decisions locked (2026-06-23)

These were the open structural calls. All resolved:

1. **Upcoming is one top-level Planning page.** (History: locked 2026-06-23
   as "not a top-level area"; reversed 2026-07-02 to keep the route; reversed
   again 2026-07-05 to promote it into the Plan nav _with_ a same-page
   Today swap toggle; simplified later 2026-07-05 to **drop the toggle**
   — one surface per intent was clearer than two surfaces rendering the same
   `UPCOMING` data in different shapes.) `UPCOMING` is the Task status — the
   bench. The `/app/upcoming` page lives under Planning (date-bucketed,
   rose-tinted overdue, per-row promote-to-Today). Today and Upcoming
   cross-link from their heroes; no same-page swap. Mental model: Upcoming =
   the bench; Today = the court. A bench task with no future due date is also
   a Next candidate on Next (§5.2) — triage should put real work in front of
   you, not hide it behind a toggle.
2. **Next's Next candidate pool = Today + Upcoming (revised 2026-06-25).**
   `getTopTask` selects `status ∈ {TODAY, UPCOMING}` **and** (`dueDate` is null
   or `dueDate ≤ now`), in the active Lens, not done. So a freshly triaged task
   (Upcoming, no due) surfaces as Next immediately; Today stays un-cluttered.
   The due-guard preserves snooze: a snoozed task (Upcoming + future `dueDate`)
   stays off Next until its time arrives — at which point it auto-resurfaces
   (the behavior §7 had deferred). _(Previously locked 2026-06-23 as "Today
   only"; reversed because a triaged task should be actionable, not invisible —
   the Someday default change in `TRIAGE.md` §5 made Today-only the wrong
   default-pool pairing.)_ Someday is never a Next candidate.
3. **Someday lives in the Planning Area.** It's a "maybe later" organizing
   concept, not a working one. The `/someday` page moves under Planning in the
   nav/route cluster.
4. **Work Area = Next (Now/Next chooser) + Today (committed list).** No
   third surface. Next shows the single focus task with its Next→Now state
   machine; Today shows the committed-for-today list with the `todayCap` cap
   (default 5, range 3–12; global across lenses per §5.11).
5. **Triage lens assignment lives in Classify (revised 2026-07-04).** Triage
   now opens on **Classify**, a combined Type + Destination step. Lens remains
   visible and reversible, but no longer gets its own standalone step. The
   active lens is the fallback default. `[[lens]]` preselects a Lens and still
   shows the lens choices. A concrete resolved Project is stronger: it supplies
   both `projectId` and `lensId`, and Classify shows `Destination: Project ·
Lens` while skipping the standalone lens picker by default. See
   `docs/specs/done/triage-classify-step.md`.
6. **Sidebar nav = flat links + always-open labeled groups (locked
   2026-07-22).** The expanding-section focus switch (one section open at a
   time) is gone — it added a click before anything was visible and
   auto-collapsed sections unpredictably on route changes. Plan and Review
   now render their items directly under static uppercase labels. History:
   locked 2026-06-23 as a "soft focus" expanding-section nav; the Work
   section was flattened to a "Do" link on 2026-07-21 (Work/Work name
   collision, single-child wrapper was an extra click); the whole switch was
   removed on 2026-07-22 in favor of always-open groups.
   - **Context switch** (Lens: Work / Me) — always available, orthogonal to
     nav. "Which life context am I in?"
   - **Universal nav**: Inbox + Today (always visible, span every lens —
     §3, §5.11). Today moved here from the Work section on 2026-07-21 when
     it went global.
   - **Do** — flat star-icon link to `/app` (Next, the What-Now chooser).
   - **Plan** group — Upcoming, Projects, Goals, Someday.
   - **Review** group — enabled Today, Week, and Month cadences, then Logbook.
   - Mobile dock stays as-is (Inbox / Do / Plan / Review / Lens); the
     dock items now highlight via route matching against the section's
     routes (not the now-removed focus-section state).
   - A future **hard focus** (each mode as a distinct full-screen layout)
     remains the north star, parked in `docs/ROADMAP.md` §Icebox.
7. **Today rolls over daily (locked 2026-06-30).** At the start of each new
   calendar day, every incomplete **Today** task flips to **Upcoming** so Today
   starts fresh each morning — a deliberate re-commitment, not a backlog.
   - **Lazy trigger:** runs inside `getAppData` on app load (no cron job, no
     new infra — works in dev and prod). Idempotent within a day via
     `User.lastTodayRolloverAt` (the day-boundary check short-circuits).
   - **Scope:** all incomplete `status=TODAY, isDone=false` tasks, regardless
     of `dueDate`. Done tasks are left alone (they keep their status for the
     Logbook). `startedAt` (the Now state) is **preserved**, so an interrupted
     focus task resurfaces as #1 on Next even though it's now Upcoming.
   - **No effect on Next:** `getTopTask` already pools Today + Upcoming
     (§5.2), so rolled tasks stay focus candidates — this is a list/view
     concern, not a focus-engine concern. Resolves the pending note in §2.3.
   - **No effect on counts either (updated 2026-07-09):** the Today nav badge
     and the per-lens pill now draw from the **same shared actionable pool** as
     Next (`tasks/activePool.ts` — status ∈ {TODAY, UPCOMING}, not done, due
     null/now), so rolling TODAY→UPCOMING no longer flips them to 0 overnight.
     Only the Today **page** (the strict committed list, `status === TODAY`)
     resets each morning. This closed a recurring drift where a task showed on
     Next ("due today") while the badge read 0 and the pill was empty. The
     badge key is `counts.active` / `activeByLens` (not `today`) to stay honest
     that it's the pool, not the committed list.
8. **Custom lenses are user-defined + Pro-only (locked 2026-07-03).** A Lens is
   no longer a hardcoded Work/Me binary — a paying user can create, name, give
   a purpose, and color additional lenses; the active-lens switcher becomes
   adaptive (segmented ≤3, chip + popover ≥4). Three structural calls:
   - **`LensKind` is the stable handle.** The seeded two are tagged `WORK`/
     `PERSONAL` on the model; user-defined are `CUSTOM`. The entitlement guard
     branches on kind, not the name, so renaming "Work" → "Studio" can't
     escape FREE gating. Active-lens client state is keyed by lens id (not
     name) for the same reason.
   - **Lens configuration is Pro-only across the board.** FREE gets the seeded
     two (Me usable, Work visible-but-locked) and can configure nothing; Pro
     gets full CRUD + custom lenses, soft-capped at `PRO_LIMITS.lenses = 8`.
     The seeded two are renameable/recolorable but never deletable.
   - **Delete is two-mode (delete or reassign), user picks at delete time.**
     No archive infrastructure — reassign moves content to a chosen lens;
     delete hard-removes (cascade via FK). Goal name-collision on reassign is
     caught (409) because Goal has `@@unique([userId, name])`.
     See `docs/specs/done/custom-lenses.md` + `docs/reviews/custom-lenses.md`.
9. **Capture grammar v2 + lens token (locked 2026-07-04).** The capture NL
   grammar keeps `#` as a project-first sigil while cleaning up `@` and lens
   intent. Three structural calls:
   - **First `#` is project; later `#` tokens are tags; `@` is time only.**
     Keeps the 2026-06-22 `#` project affordance while removing `@` context
     tags. `@` is freed for its one natural job (when);
     `@today`/`@tomorrow`/`@tonight` were already special-cased and stay. See
     `docs/specs/done/capture-grammar.md`.
   - **`[[lens]]` is the explicit lens override.** A new token for the rare
     cross-lens capture (in Work, think of a personal errand). Resolves on
     `kind` for seeded lenses (`[[work]]`/`[[personal]]`/`[[me]]` survive
     renames — same property as the entitlement guard), exact name for custom.
     Unknown tokens stay literal text, so it can't false-positive on pasted
     wiki-link syntax.
   - **Projects are explicit via first `#`, with free-text fallback.** Project
     intent is matched from the first `#` token or from free text against the
     active lens's projects (or the `[[ ]]`-overridden lens's) —
     whitespace/sentence-boundary, longest match wins. The project's lens is
     the bridge from capture to lens. `[[ ]]` precedence beats project-inferred
     lens (explicit beats inference — if they disagree, the project hint does
     not match).
   - **§5.5 stays intact, with Classify replacing Context.** `[[ ]]` and
     project-inferred context remain visible and reversible. Concrete Project
     resolution can skip standalone lens selection because the Project already
     supplies the Lens, but Classify still shows the actual destination before
     dispatch.
10. **Focus is a dedicated route; tasks carry an activity log (locked
    2026-07-05; centered-session layout revised 2026-08-07).** Two structural
    calls from the focus redesign + the
    task-notes-completion-log spec:
    - **`/app/focus` is its own route**, not an overlay. Entered from Next's
      one-tap "Start" or any task row's focus affordance; `NextPage` and
      `ProjectDetailPage` `navigate("/app/focus")` into it. The screen carries
      one centered 25/45-minute countdown ring, explicit Note / Pause / Complete
      actions, and one inline notes-area composer. Choosing Complete reveals a
      brief optional Outcome reflection in that same composer; no modal interrupts
      the focus surface. `TaskSession`
      (`startedAt`/`endedAt`/`plannedMinutes`/`completed`) records focus segments;
      timer completion is distinct from Task completion.
    - **`TaskUpdate.kind` (NOTE | COMPLETED) is the activity-log
      discriminator.** Notes are appended any time; completion appends a
      `kind=COMPLETED` row. `Task.completedAt` stays as the existing
      completion timestamp (Today/Logbook read it); the typed row carries the
      user's optional completion note for Review. This is the focused slice
      of `work-area-merged` — route merging and NOT_DOING/archive are still
      out of scope.
11. **Today is universal, not lens-scoped (locked 2026-07-21).** Today stops
    being scoped to the active lens and becomes global like Inbox and Capture.
    The `/app/today` list and its Done-today section now span all accessible
    lenses; each row carries a trailing lens pill so provenance stays visible
    without partitioning the list.
    - **Rationale:** Today is a commitment device for _the day_ — lens is
      context, not a partition. A day-commitment cut by lens is two smaller
      commitments that never have to compete with each other, which defeats
      the cap's "what actually matters today" forcing function. Inbox already
      proved the universal pattern.
    - **The cap is global and user-tunable.** `User.todayCap` (default 5,
      range 3–12, set in Preferences) replaces the hardcoded `TODAY_CAP = 5`.
      Going global flips the cap from "5 per lens" to "`todayCap` total" — so
      a 2-lens user who previously had 10 slots now has `todayCap`; the
      tunable range (up to 12) is the escape valve. This is a real behavior
      change for multi-lens users, recorded here deliberately.
    - **Entitlement is preserved via an accessible-lens filter**, not removed:
      the global Today query filters `lensId ∈ getAccessibleLensIds(user)`
      (FREE → one lens, Pro → all). A downgraded user no longer sees Today
      tasks from now-inaccessible lenses. The per-task `assertLensAllowed`
      guard is replaced by this set filter; FREE users with a single
      accessible lens see no behavioral difference except the cap going global.
    - **Today moved out of the Work nav section into the universal nav**,
      alongside Inbox. Previously Today lived under the expanding Work section
      (Decision 6), so switching to Plan collapsed Work and Today vanished
      from the sidebar. With Today global that was wrong — a universal page
      shouldn't disappear when you change mode. It now sits at the top of the
      sidebar below Inbox, always visible regardless of which section is
      expanded. `sectionForPath` returns null for `/app/today` so landing on
      it no longer forces the Work section open. (Mobile dock unchanged for
      now — it has its own slot constraints; Today stays reachable there via
      the Next page link.)
    - **What stays lens-scoped:** Next/What Now (`/app`, the focus engine and
      `getTopTask`), Upcoming (`/app/upcoming`), Someday, Projects, Goals,
      Logbook. So the Today → Upcoming cross-link still lands in the active
      lens, as before.
    - **Per-lens Today counts are gone from the switcher.** The lens
      switcher used to show a per-lens Today badge (Work 4, Me 4) sourced from
      a `todayByLens` map in `getAppData`. With Today global, that number no
      longer reflects what the page shows (a user would see Work 4 + Me 4 in
      the switcher but `todayCap` merged rows on the page), so the badge, the
      `todayByLens` map, and its underlying `groupBy` were removed entirely.
      The switcher now shows lens identity only (name + color + purpose).
    - **Rollover is unaffected.** The daily `TODAY → UPCOMING` rollover
      (§5.7) was already global (`where: { userId, status: "TODAY" }` — no
      lens filter), so no change there.

## 6. Document cascade

The following were updated to match this doc (commit alongside):

- `FEATURES.md` — status note flags it as predating the triage/modes refactor;
  defers to WORKFLOW.md on structure. The F-numbered feature list stays useful
  for feature-level reference.
- `PAGES.md` — route map reorganized into Work / Planning / Review clusters;
  Someday relocated to Planning. (Upcoming's framing flipped 2026-07-05: it
  is a top-level Planning route/nav item, not demoted — see §5.1.)
- `DATA-MODEL.md` — status note confirms InboxItem stays unscoped; Task status
  enum keeps `UPCOMING` (used by snooze; surfaced as the `/app/upcoming`
  Planning page and the Today swap toggle); the §4 "where things live" list
  aligns with the 5-areas model.
- `TRIAGE.md` — aligns the step-aware Classify keymap with WORKFLOW.md §2.2
  and §5.5.
- `DATA-MODEL.md` (added 2026-07-03) — documents `LensKind`, `Lens.purpose`,
  and the Work/Me → user-defined evolution; the §4 "where things live" list
  aligns with the 5-areas model.
- `TRIAGE.md` §Classify step (revised 2026-07-04) — notes that Lens choices
  live inside Classify, go adaptive (popover) when there are many lenses, and
  are skipped by default when a concrete Project already supplies Project +
  Lens.
- `TRIAGE.md` §5 + §7.5 (added 2026-07-04) — supersede the 2026-06-22 `#`/`@`
  sigil decision; `#` is now tags, `@` is time only, `[[lens]]` is the explicit
  lens override, projects are resolver-driven. Capture grammar v2 per
  `docs/specs/done/capture-grammar.md`.
- `DATA-MODEL.md` (added 2026-07-04) — documents `InboxItem.parsedLens`; v5
  note records grammar v2.
- `docs/features/capture.md` + `docs/features/inbox-triage.md` (added
  2026-07-04) — grammar block rewritten; resolver pre-fill behavior noted.
- `docs/features/upcoming-someday.md` (revised 2026-07-05) — Upcoming framed
  as a single Planning page (`/app/upcoming`) that cross-links with Today
  (no same-page swap toggle). Aligns with §5.1.
- `PAGES.md` + `DATA-MODEL.md` (revised 2026-07-05) — Upcoming framing flipped
  from demoted to promoted-into-Planning, matching §5.1.
- `DATA-MODEL.md` (revised 2026-07-05) — v6 note documents `TaskUpdate.kind`
  discriminator, `TaskSession`, and `Project.order`, matching §5.10 +
  goal-planning.
- `TRIAGE.md` §7.4 + §8 (revised 2026-07-05) — Classify lens UI is pills +
  one-line type rows (not positional A/S/D/F slots); property keys
  `[` `]` `-` `=` are now built (shared `PropertyChips` editor).
- `FEATURES.md` + `PAGES.md` + `DATA-MODEL.md` (revised 2026-07-21) — Today
  moved from lens-scoped to universal, matching §5.11. `DATA-MODEL.md` also
  documents the new `User.todayCap` column. One-line tweaks only; no
  structural changes beyond what §3 already records.

## 7. Code work implied by these decisions

All items in this section have shipped (focus-switch nav, Upcoming → Today
toggle, Upcoming as a top-level Plan nav item, Someday nav relocation,
`getTopTask` scope). The decision history for each is in §5 above and in
`docs/reviews/` sign-offs; this section is no longer tracked as an open list.
