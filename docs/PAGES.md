# ActionAmp — Pages & Routes

> Status: route + page reference. Code-verified against `main.wasp.ts`
> 2026-08-08.
> **Structural authority has moved to `WORKFLOW.md`** (2026-06-23). The nav is
> reorganized into three **focus-mode sections** (Work / Plan / Review) as an
> expanding-section nav (one open at a time), with the **context switch (Lens)**
> above it and Capture pinned outside both.
>
> All authenticated app routes use the `/do` prefix (e.g. `/do`, `/do/inbox`,
> `/do/tasks/:permalink`). The page-by-page descriptions below stay accurate
> for each route's contents; the chrome mockup (§0) shows the post-2026-06-23
> focus-switch sidebar.

---

## 0. The layout chrome (authenticated Life-area pages)

Persistent UI that frames every page:

```
┌─────────────────────────────────────────────────────────┐
│  [ActionAmp]          [⌘K capture]                 [⚙]  │  ← top bar
├──────────┬──────────────────────────────────────────────┤
│ LENS     │                                              │
│ ○ Work   │                                              │
│ ● Me     │           (page content)                     │
│          │                                              │
│ ─────    │                                              │
│ ⌁ Work   │  (expanding-section nav: one open at a time) │
│   ⚡ Next │                                              │
│   ☀ Today│                                              │
│ ▽ Plan   │                                              │
│   ▦ Upcom│                                              │
│   ▤ Projs│                                              │
│   ◎ Goals│                                              │
│   ◌ Somed│                                              │
│ ◇ Review │                                              │
│   ⏱ Log  │                                              │
│ ─────    │                                              │
│ ▣ Inbox  │  (Capture is pinned outside both switches)   │
└──────────┴──────────────────────────────────────────────┘
```

- **Lens switch** at the top of the sidebar — changes scope. There is no
  checklist shell mode (removed 2026-08-18 — simple lists are Projects).
- **Focus switch** (Work / Plan / Review) is an expanding-section nav — only one
  section open at a time. Capture (`⌘K`) and Inbox stay pinned outside both.
- Active page highlighted. Counts (Inbox `(4)`) live-update.

---

## 1. Primary pages (sidebar nav)

These are the main destinations. Scoped surfaces use the active Lens;
universal surfaces aggregate all lenses.

### P1. Next → `/do`

**The home page. The wedge.** Not a list — a chooser. (FEATURES F8/F10.)

- Shows 1 (max 3) Tasks ranked by priority → size → due.
- Context line ("Important · due today · S"), Start / Not now / ⋯ actions.
- **Focus affordance** — `Start` navigates to `/do/focus` (D4) and starts
  the task (sets `Task.startedAt`).
- **Three rationale layers, in order, never conflated** (locked 2026-08-10;
  implementation pending — see `specs/focus-goal-context.md`):
  1. **Matcher "why now"** (shipped). The existing `composeWhy` line from the
     actual ranking factors, with amber emphasis. Unchanged.
  2. **Goal rationale "why at all"** (pending). Renders **only in the `next`
     candidate state**, directly after the matcher rationale. Resolution:
     `task.project.goal` → legacy `task.goal` → none. With a described Goal:
     `Why does this matter?` / trimmed description / `Goal · <name>` (quiet
     violet). With a description-less Goal: `Why does this matter?` /
     `Toward <Goal name>.` (no duplicate attribution). With no resolved Goal:
     nothing. Never manufactured from Project/Task text, priority, due date,
     or matcher/work history.
  3. **Paused-work continuity** (pending). Renders **only in the `next`
     candidate state**, after Goal rationale (or directly after matcher
     rationale when no Goal exists). Derived from closed sessions and NOTE
     updates only. Stats row omits zero segments and uses correct
     singular/plural; worked time sums valid closed sessions (`endedAt >
     startedAt`), rounds to the nearest whole minute, and renders `<1 min
     worked` for positive sub-minute work. Notes count trimmed non-empty NOTE
     updates only; `COMPLETED` rows excluded. Newest valid NOTE surfaces as a
     passive two-line `Latest note` preview — no link/editor/disclosure/thread
     on Next. A fresh Task, or one with no valid history, renders no continuity
     block, no empty row, no prompt.
  - The **`now` state** (work in progress) does **not** show the paused-work
    summary — live execution context belongs in Focus. Matcher and Goal
    rationale behavior in the `now` state is unchanged from prior code.
  - All added context stays subordinate to the Task title and actions, narrower
    in visual weight, and must not cause horizontal overflow at mobile widths.
- Empty state: if no Today items → gentle prompt to triage Inbox or plan Today.
- If Inbox is untriaged and Today is empty → nudge toward triage.

### P2. Inbox → `/do/inbox`

The universal queue. (FEATURES F3.) Shows untriaged InboxItems as a list.

- Sort: newest first (capture order).
- Each row: text + parsed-token chips (date/tag/priority detected).
- Row actions: open, triage (→ P2b), delete.
- Queue header: count + "Start triage" button → enters review mode. Empty state
  keeps the same bounded queue surface and points back to universal `⌘K` capture.

### P2b. Inbox Triage → `/do/inbox/review`

Per-item co-author wizard (DATA-MODEL §3, TRIAGE.md §4). The
single-card one-key dispatch is **gone**. Three steps per item:

Choosing **List item** replaces the Lens pills with a Simple-list Project
picker and the structured Type + Spec flow with an editable one-step
**Add to list** confirmation.

- **Classify** — Type chooser (one-line rows w/ leading icon: Task / Project /
  Resource / Archive) + Lens pills. A resolved Project supplies both Project +
  Lens and skips standalone lens selection by default.
- **Spec** — property rows via the shared `PropertyChips` editor. Shortcuts:
  `[`/`]` size · `-`/`=` priority · `/` Lens picker.
- **Ready** — commits the spec; the InboxItem is transformed and removed.
- Progress dot: "3 of 7 triaged."

### P3. Today → `/do/today`

**Planning view** of today's commitments — distinct from Next (which is _doing_).

- List of Tasks due today/overdue, grouped by Goal.
- Enforces the **Today cap** (FEATURES F12): adding a 6th requires bumping one out.
- Drag to reorder priority. Inline size/priority editors.
- "Done today" section scoped to `status === "TODAY"` only (locked 2026-07-05).
- Cross-links to `/do/upcoming` from the hero.

### P4. Upcoming → `/do/upcoming`

The forward-planning view of `status=UPCOMING` tasks (the bench).

- Top-level Plan nav item (locked 2026-07-05; the Today same-page swap toggle
  was dropped the same day in favor of one surface per intent).
- Date-bucketed (Overdue / This week / Next week / Later / Unscheduled),
  rose-tinted overdue, inline notes, per-row promote-to-Today.
- Cross-links back to `/do/today` from the hero.

### P4a. This week → `/do/week`

The global Monday–Sunday schedule, linked from Today's hero.

- Groups incomplete dated `TODAY` and `UPCOMING` tasks by weekday across
  accessible Lenses; rows retain Lens provenance.
- A planning surface only: it never replaces Today's cap or the Week review.
- Empty state directs the user to schedule a task from its detail page.

### P5. Someday → `/do/someday`

No-date, not-forgotten, not-nagging Tasks. (GTD "Someday/Maybe".) Lives under
the Plan section of the focus-switch nav.

- Grouped by Goal (or flat). Lighter visual weight.
- Promote to Today/Upcoming when ready.

### P6. Projects → `/do/projects`

All Projects in the active Lens, with Goal alignment shown on each card.

- Each row: name, progress (X/Y tasks done), due date if any, next-action preview.
- "No next action" badge if a Project has no actionable Task — a GTD health nudge.

### P7. Goals → `/do/goals`

All Goals in the active Lens, with project roll-up. Full lifecycle (locked
2026-07-05): complete / reopen / edit / delete / re-link; `Project.order`
sequences projects under each goal ("Next: <name>").

- Each Goal: linked Projects (ordered), aggregate progress, current focus project.
- Create/edit Goal inline.

### P8. Review cadences → `/do/review/today`, `/do/review/week`, `/do/review/month`

Three distinct completion debriefs: Today closes the day, Week recognizes
meaningful movement, and Month celebrates Goal progress and chooses direction.
An unfinished day/week/month presents a check-in; a past or closed period
presents retrospective reflection. Both answer sets autosave independently.
Each keeps every completed Task inspectable, recognizes completed Projects and
Goals, and supports optional saved responses. Reviews span all Life-area Lenses;
Week/Month can filter inside the page. `/do/review` resolves to the first
enabled cadence, then Logbook when all are disabled.

### P9. Logbook → `/do/logbook`

Completed + archived items. (PARA "Archive" / FEATURES F18.)

- Grouped by completion date and discoverable through the sitewide palette.
- **Completed Goals surface here** since 2026-07-05, with a Reopen affordance.
- No editing — restore or permanently delete only.
- List Items are excluded; completion remains inside the Simple-list Project.

### P10. Simple-list Project → `/do/projects/:permalink` (type `SIMPLE_LIST`)

A Simple-list Project opens its checklist in place of the task sections
(the `/do/list` route and the checklist shell mode were removed 2026-08-18).

- Direct add creates a List Item in the project; no Capture or Inbox record.
- Active items precede completed items. Each row supports toggle, rename,
  and delete.
- The normal shell stays: universal Inbox, triage, and Capture remain
  reachable. No goal, due date, completion lifecycle, tasks, or resources —
  archive and delete still work.

---

## 2. Detail pages

### D1. Project detail → `/do/projects/:permalink`

- Header: name, parent Goal, due date, status. Editable inline (lifecycle
  shipped 2026-07-05: complete / reopen / edit / delete / re-link).
- **Tasks** list (the focus candidates) — sortable, inline-edit.
- **Resources** list (links + notes / bookmarks) — add/edit/open.
- Convert Task → Project (XL break-down path). Promote Resource → Task.
- "Next action" highlighted. **Move-to-Project** affordance on each task row.

### D2. Goal detail → `/do/goals/:permalink`

- Header: name, description ("the why").
- Linked Projects (ordered by `Project.order`), with progress.
- **"Next: <name>"** line surfaces the first non-done Project under this Goal.
- Aggregate roll-up: % complete across linked Projects.
- Lifecycle actions: complete / reopen / edit / delete / re-link.

### D3. Task detail → `/do/tasks/:permalink`

Task permalink page (shipped 2026-07-05). Full-field chip-popover editing via
the shared `PropertyChips` editor (priority, size, due, project, goal, tags).
Notes thread rendered as a thread + composer (writes a `TaskUpdate`,
`kind=NOTE`). Completed task detail becomes feedback-only.

### D4. Focus → `/do/focus`

Single-task execution route (FEATURES F13, Variant F). The task, its centered
countdown ring, explicit Note/Pause/Complete actions, inline composer, and
_nothing else_.

- Entered from Next's one-tap "Start" or any task row's focus affordance.
- Minimal chrome — sidebar hidden.
- **Goal rationale** (locked 2026-08-10; implementation pending — see
  `specs/focus-goal-context.md`). Same resolution and copy rules as P1 Next:
  `task.project.goal` → legacy `task.goal` → none. With a described Goal:
  `Why does this matter?` / trimmed description / `Goal · <name>` (quiet
  violet). With a description-less Goal: `Why does this matter?` /
  `Toward <Goal name>.` With no resolved Goal: nothing. Placed directly below
  the Task title and above editable Task details, in the existing centered
  content column. No card, icon, link, disclosure, animation, badge, or action.
  - Focus **does not repeat** the matcher "why now" rationale or the
    paused-work continuity summary. Its timer and activity thread already
    provide live and historical execution context.
- Confirm-on-complete appends a `kind=COMPLETED` `TaskUpdate`; `Task.completedAt`
  stamps; `status` is left untouched.
- `TaskSession` rows (startedAt/endedAt) are maintained across start/pause/
  complete so the clock total is honest.
- Esc returns to origin.

---

## 3. Overlay flows (not routes — modal/palette UX)

These aren't pages but are core surfaces:

- **O1. Quick-add palette** (`⌘K`) — floating input, NL parsing, chips preview. (F1/F2.)
- **O2. Command palette + sitewide search** (`⌘\` Command; `/` Search) — one shared Pro popover for safe commands, cross-Lens entity jumps, and text results across Tasks, Projects, Goals, Resources, and Inbox records. (F20/F22 shipped and browser-verified.)
- **O3. Shortcut cheatsheet** (`?` / `⌘?`) — overlay of all shortcuts. (F21.)
- **O4. Search** — `/` enters Search intent inside O2's shared popover; no separate page or Logbook-only box. (F22; see `specs/command-palette-search.md`.)
- **O5. XL break-down prompt** — modal when a Task is set to XL. (F9c.)

---

## 4. Auth pages

| Route                 | Page         | Notes                                               |
| --------------------- | ------------ | --------------------------------------------------- |
| `/login`              | Login        | email + social (Google OAuth client config pending) |
| `/signup`             | Signup       | email + social                                      |
| `/password-reset`     | Reset        | email only                                          |
| `/email-verification` | Verify email | email only                                          |

Post-auth redirect → `/do` (Next).

---

## 5. Settings → `/do/settings`

- **Account** — email, password, linked social accounts, delete account.
- **Preferences** — theme (dark default), Today cap (default 5, or off), confirmation sounds, momentum toggle.
- **Lenses** (`/do/settings/lenses`) — Pro-only CRUD for lenses: add/rename/recolor/edit-purpose/delete. FREE gets `<ProGate>`. Seeded two are renameable/recolorable and never deletable. Simple lists are not lens configuration (removed 2026-08-18) — they are Projects created from the Projects page.
- **Billing** (`/do/settings/billing`) — Stripe-managed subscription surface.
- **Shortcuts** — view/customize keyboard map.

---

## 6. Route map (for `main.wasp.ts`)

```
Authenticated app routes (all under /do):
  /do                                    Next (home, the chooser)
  /do/focus                              Focus (Variant F, single-task)
  /do/inbox                              Inbox
  /do/inbox/review                       Triage walkthrough (Classify → Spec → Complete)
  /do/today                              Today (planning)
  /do/today/:permalink                   Next on a selected task
  /do/week                               This week (scheduling)
  /do/upcoming                           Upcoming (top-level Plan nav item)
  /do/someday                            Someday
  /do/projects                           Projects list
  /do/projects/:permalink                Project detail
  /do/goals                              Goals list
  /do/goals/:permalink                   Goal detail
  /do/tasks/:permalink                   Task permalink (full-field editor)
  /do/review                             Preference-aware Review redirect
  /do/review/today                       Today review (?for=local date)
  /do/review/week                        Week review (?for=local date)
  /do/review/month                       Month review (?for=local date)
  /do/logbook                            Logbook (completed + archived + completed goals)
  /do/settings                           Settings
  /do/settings/billing                   Billing
  /do/settings/lenses                    Lenses (Pro CRUD)

Onboarding:
  /welcome                                Onboarding (server-flag-gated)

Public (auth=false):
  /                                       Landing
  /about                                  About
  /founding-100                           Founding 100 CTA
  /founding-100/welcome                   Founding 100 welcome (post-checkout)
  /roadmap                                Public roadmap
  /terms                                  Terms
  /privacy                                Privacy
  /design-system                          Design system page

Auth:
  /login  /signup  /password-reset  /email-verification
```

---

## 7. Resolved decisions (historical)

These were open calls during scaffold; all resolved. Kept as a record of _why_
the routes are shaped the way they are.

1. **Today vs. Next** → two pages. Next (`/do`) = the chooser (doing); Today
   (`/do/today`) = the list (planning, cap enforcement). Different moments.
2. **Triage** → dedicated walkthrough page (`/do/inbox/review`). The GTD
   "clarify" ritual deserves focus.
3. **Project/Goal detail** → full pages (shareable URLs, deep-linkable,
   back-button friendly).
4. **Focus mode** → dedicated route (`/do/focus`), not an overlay. Decided
   2026-07-05 with the Variant F redesign.
5. **Task permalinks** → `/do/tasks/:permalink`. Added 2026-07-05.
