# ActionAmp — Pages & Routes

> Status: route + page reference.
> **Structural authority has moved to `WORKFLOW.md`** (2026-06-23). The nav is
> reorganized into three **focus-mode sections** (Work / Plan / Review) as an
> expanding-section nav (one open at a time), with the **context switch (Lens:**
> **Work/Me) above it and Capture pinned outside both.**
>
> Key changes from the route map below (see `WORKFLOW.md` §5–§7):
>
> - **`/app/upcoming` is a top-level Planning route/nav item** (framing
>   flipped 2026-07-05, reversing the 2026-06-23 demotion). It's the
>   forward-planning view of `status=UPCOMING` tasks; the Today "see upcoming"
>   toggle stays as a separate same-page swap surface.
> - **Someday (`/app/someday`) relocates under the Plan section.**
> - The **Next / Today** split stays, both under Work.
>
> The page-by-page descriptions below stay accurate for each route's contents;
> only the *grouping* and the Upcoming framing are superseded.

> Status: DRAFT v1
> Authority: derived from `DATA-MODEL.md` + `FEATURES.md`.
> Lens (Work/Me) is a **global switch in the chrome**, not a page — it scopes every page below.

---

## 0. The layout chrome (every authenticated page)

Persistent UI that frames every page:

```
┌─────────────────────────────────────────────────────────┐
│  [ActionAmp]          [⌘K capture]   [⌘\ palette]  [⚙]  │  ← top bar
├──────────┬──────────────────────────────────────────────┤
│ LENS     │                                              │
│ ○ Work   │                                              │
│ ● Me     │           (page content)                     │
│          │                                              │
│ ─────    │                                              │
│ ⚡ What   │                                              │
│   Now    │                                              │
│ ▣ Inbox  │                                              │
│ ☀ Today  │                                              │
│ ▦ Upcom. │                                              │
│ ◌ Someday│                                              │
│ ▤ Projects│                                             │
│ ◎ Goals  │                                              │
│ ─────    │                                              │
│ ⏱ Logbook│                                             │
└──────────┴──────────────────────────────────────────────┘
```

- **Lens switch** at the top of the sidebar — changes scope of *everything* below it.
- **Quick-add** (`⌘K`) and **command palette** (`⌘\`) accessible from the top bar on every page.
- Active page highlighted. Counts (Inbox `(4)`) live-update.
- Collapsible sidebar for focus mode.

---

## 1. Primary pages (sidebar nav)

These are the main destinations. All scoped to the active Lens.

### P1. Next  →  `/`

**The home page. The wedge.** Not a list — a chooser. (FEATURES F8/F10.)

- Shows 1 (max 3) Tasks ranked by priority → size → due.
- Context line ("Important · due today · S"), Do / Not now / ⋯ actions.
- Empty state: if no Today items → gentle prompt to triage Inbox or plan Today.
- If Inbox is untriaged and Today is empty → nudge toward triage.

### P2. Inbox  →  `/inbox`

The universal queue. (FEATURES F3.) Shows untriaged InboxItems as a list.

- Sort: newest first (capture order).
- Each row: text + parsed-token chips (date/tag/priority detected).
- Row actions: open, triage (→ P2b), delete.
- Header: "Triage" button → enters review mode.

### P2b. Inbox Triage  →  `/inbox/review` *(MVP — walk-through mode)*

One InboxItem at a time, decide what it becomes (FEATURES F6, DATA-MODEL §3):

- `1` Task (Today) · `2` Task (Upcoming, pick date) · `3` Task (Someday)
- `P` → new/existing Project · `G` → link to Goal
- `R` → Resource (pick parent Project/Goal) · `Del` → trash
- Progress dot: "3 of 7 triaged."

### P3. Today  →  `/today`

**Planning view** of today's commitments — distinct from Next (which is *doing*).

- List of Tasks due today/overdue, grouped by Goal.
- Enforces the **Today cap** (FEATURES F12): adding a 6th requires bumping one out.
- Drag to reorder priority. Inline size/priority editors.
- "Done today" section collapsed at bottom.

### P4. Upcoming  →  `/upcoming`

Dated future items. (FEATURES §2 model.)

- Grouped by date (Tomorrow / This week / Next week / Later) then by Goal.
- Tasks + dated Projects.

### P5. Someday  →  `/someday`

No-date, not-forgotten, not-nagging Tasks. (GTD "Someday/Maybe".)

- Grouped by Goal (or flat). Lighter visual weight.
- Promote to Today/Upcoming when ready.

### P6. Projects  →  `/projects`

All Projects in the active Lens, with Goal alignment shown on each card.

- Each row: name, progress (X/Y tasks done), due date if any, next-action preview.
- "No next action" badge if a Project has no actionable Task — a GTD health nudge.

### P7. Goals  →  `/goals`

All Goals in the active Lens, with project roll-up. *(First-class in MVP.)*

- Each Goal: linked Projects, aggregate progress, current Focus project.
- Create/edit Goal inline.

### P8. Logbook  →  `/logbook`

Completed + archived items. (PARA "Archive" / FEATURES F18.)

- Searchable. Grouped by completion date.
- No editing — restore or permanently delete only.

---

## 2. Detail pages

### D1. Project detail  →  `/projects/:permalink`

- Header: name, parent Goal, due date, status.
- **Tasks** list (the focus candidates) — sortable, inline-edit.
- **Resources** list (links + notes / bookmarks) — add/edit/open.
- Convert Task → Project (XL break-down path). Promote Resource → Task.
- "Next action" highlighted.

### D2. Goal detail  →  `/goals/:permalink`

- Header: name, description ("the why").
- Linked Projects (with progress).
- Aggregate roll-up: % complete across linked Projects.
- Edit/delete Goal.

### D3. Task focus mode  →  `/tasks/:id/focus` *(or full-screen overlay)*

Single-task execution view (FEATURES F13). The task, its notes, optional timer, and *nothing else*.

- Entered via `F` from anywhere a Task is shown.
- Minimal chrome — sidebar hidden.
- Esc returns to origin.

---

## 3. Overlay flows (not routes — modal/palette UX)

These aren't pages but are core surfaces:

- **O1. Quick-add palette** (`⌘K`) — floating input, NL parsing, chips preview. (F1/F2.)
- **O2. Command palette** (`⌘\`) — fuzzy jump/run over everything. (F20.)
- **O3. Shortcut cheatsheet** (`?`) — overlay of all shortcuts. (F21.)
- **O4. Search** (`/` or via palette) — full-text results overlay across items/notes/logbook. (F22.)
- **O5. XL break-down prompt** — modal when a Task is set to XL. (F9c.)

---

## 4. Auth pages (from scaffold; social to be added)

| Route | Page | Notes |
|---|---|---|
| `/login` | Login | email + social (Google etc.) |
| `/signup` | Signup | email + social |
| `/request-password-reset` | Request reset | email only |
| `/password-reset` | Reset | email only |
| `/email-verification` | Verify email | email only |

Post-auth redirect → `/` (Next).

---

## 5. Settings  →  `/settings`

Tabbed or single-scroll *(decide later)*:

- **Account** — email, password, linked social accounts, delete account.
- **Preferences** — theme (dark default), Today cap (default 5, or off), confirmation sounds, momentum toggle.
- **Lenses** *(Phase 2)* — add/rename/reorder Work/Me and custom Lenses.
- **Shortcuts** *(Phase 2)* — view/customize keyboard map.

---

## 6. Route map (for `main.wasp.ts`)

```
MVP routes (auth-required except auth pages):
  /                          Next (home)
  /inbox                     Inbox
  /inbox/review              Triage walkthrough
  /today                     Today (planning)
  /upcoming                  Upcoming
  /someday                   Someday
  /projects                  Projects list
  /projects/:id              Project detail
  /goals                     Goals list
  /goals/:id                 Goal detail
  /tasks/:id/focus           Task focus mode
  /logbook                   Logbook
  /settings                  Settings
  /login  /signup  /request-password-reset  /password-reset  /email-verification

Phase 2:
  /search (if not overlay)   /settings/lenses   /settings/shortcuts
```

---

## 7. Open decisions (need your call)

1. **Today vs. Next — two pages or one?** My proposal: **two.** Next (`/`) = the chooser (doing); Today (`/today`) = the list (planning, cap enforcement). They serve different moments. *Alternative: collapse into one page with a toggle.* ← lean: keep separate.
2. **Triage = dedicated walkthrough page (`/inbox/review`) or inline in the inbox list?** I lean **dedicated walkthrough** for MVP — it's the GTD "clarify" ritual and deserves focus. *Alternative: triage buttons inline on each inbox row.*
3. **Project/Goal detail = full pages or expand-in-place panels?** Lean **full pages** (shareable URLs, deep-linkable, back-button friendly). *Alternative: Things-style inline expand.*
4. **Focus mode = route (`/tasks/:id/focus`) or full-screen overlay?** Lean **overlay** (feels more "mode", no nav jank). Either works.
5. **Settings = tabs or one scroll?** Minor — decide later.
