# ActionAmp — Workflow

> Status: CANONICAL — 2026-06-23
> Authority for: the app's area structure, what lives where, and how items move
> between areas. When this document conflicts with `FEATURES.md`, `PAGES.md`,
> `DATA-MODEL.md`, or `TRIAGE.md` on *structure* (areas, contexts, destinations),
> **this document wins** and those are due for update.
>
> See "Decisions locked" (§5) for the resolved structural calls and
> "Code work implied" (§7) for the follow-up build items.
> When this document conflicts with `FEATURES.md`, `PAGES.md`,
> `DATA-MODEL.md`, or `TRIAGE.md` on *structure* (areas, contexts, destinations),
> **this document wins.**

## 1. The mental model

ActionAmp has **three modes** — Work, Planning, Review — plus one pervasive
feature, **Capture**, that crosses all of them. Everything except Capture lives
inside a **context** (the Work/Me Lens): items enter a context only through
triage.

```
                            ┌──────────────────────────┐
                            │  CAPTURE  (pervasive)    │
                            │  ⌘K / ⌘/ from anywhere   │
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

  Context = Work or Me lens. Scopes Tasks, Projects, Goals, Resources.
  Capture + Inbox are NOT scoped — they're universal.
```

Items only flow **left to right**: capture → inbox → triage → a context. Nothing
appears in Work/Planning/Review except by coming through triage.

## 2. The five areas

### 2.1 Capture (Inbox) — pervasive

- The **only** area that exists across every context and every mode.
- `⌘K` / `⌘/` opens the capture popover from anywhere. Enter commits, stays
  open for rapid-fire.
- Destination is the **Inbox**, which is **universal** (not scoped to a lens).
- Natural-language parsing (date/tag/priority/size tokens) shows chips before
  Enter so you see what it understood.
- Capture never asks "where does this go?" — that's triage's job. Capture is
  about speed (target: thought → inbox in under 2 seconds).

### 2.2 Triage — the transfer

- Walks the inbox one item at a time. For each item, decide **what it becomes**
  and **where it lands**, through a deliberate **per-item specification wizard**
  (`inbox/TriagePage.tsx`; see `TRIAGE.md` §4 for the canonical pattern).
- Outcomes: Task / Project / Resource / **Archive** (lossless — the note is
  kept, not deleted; recoverable from the Logbook).
- Filing targets are scoped — triaging an item into a Project or Goal places it
  in the **Lens confirmed on the wizard's Context step** (§5.5).
- Triage never auto-clutters the Work area: a triaged Task defaults to
  **Upcoming** (the bench), which surfaces on What Now only if undated or due
  (§5.2). Committing to Today is an explicit choice; demoting to Someday is, too.
- The single-card one-key dispatch (`1/2/3/P/R/Del`) is **gone** — replaced by
  the wizard steps (Context → Type → Spec → Complete). The old keymap survives
  only as step shortcuts where noted in `TRIAGE.md` §7.

### 2.3 Work Area — doing, right now

- Where **Now / Next** lives. The home screen (`/app`) is a chooser, not a list.
- Two surfaces:
  - **What Now** — the single focus task. State machine:
    `Next → (Start) → Now → (Done | Defer | Pause) → Next`. The Now state
    (`Task.startedAt`) persists across navigation.
  - **Today** — the committed-for-today list, capped at 5 (F12). The cap is a
    feature, not a limit — it forces the "what actually matters today" decision.
- **Eliminating:** the separate "Upcoming" area. Time-deferred tasks will roll
  up into Today on their day (decision on the exact mechanism pending — §5).
- This is the only area with a focus mode (`F`) and a Now state.

### 2.4 Planning Area — organizing

- Where **Projects** and **Goals** live, and where you organize tasks across
  time horizons.
- Projects: multi-step outcomes, always in a context. May sit under a Goal.
- Goals: the organizing layer (active outcomes, e.g. "Run a 10k"), always in a
  context.
- **Someday** lives here (pending confirmation — §5): items with no date and no
  commitment, kept for "when I'm ready." A planning concept, not a working one.
- Creating Projects and Goals happens here (not in triage — triage *files into*
  them; Shift+P / last-picker-row is the one bridge, which navigates here).

### 2.5 Review / Reporting Area — reflection

- Statistics and reports: how many tasks completed today/this week, what's
  stuck, what's been deferred repeatedly.
- The **Logbook** is the catch-all record of things no longer active:
  completed tasks, past projects, and **archived notes** ("I will not do now"
  from triage — kept lossless, restorable to the inbox). This area is the
  *view over it* (counts, trends, streaks — kept calm, no guilt-trip red dots).
- Currently the least-built area — net-new work. (See `BACKLOG.md`.)

## 3. Context (Lens) scoping

- Every Task / Project / Goal / Resource belongs to exactly one **Lens**
  (Work or Me). The active lens scopes every Work / Planning / Review view.
- **Inbox and Capture are NOT scoped** — they're universal. A captured thought
  has no lens until triage assigns one (implicitly via the active lens, or
  explicitly if we adopt force-choice — §5).
- Switching lenses swaps the entire Work / Planning / Review content; the Inbox
  count in the sidebar stays the same regardless of lens.

## 4. The three modes

The three modes are framings, not separate apps. Each maps to an area cluster:

| Mode   | Primary area | What you do there |
|--------|--------------|-------------------|
| **Work** | Work Area (§2.3) | Execute: pick the Next task, start it, finish it. |
| **Planning** | Planning Area (§2.4) | Organize: arrange projects, goals, Someday. |
| **Review** | Review Area (§2.5) | Reflect: metrics, completion history, stuck items. |

Capture (§2.1) is available in all three. Triage (§2.2) is the transfer gate
between Capture and any of them.

## 5. Decisions locked (2026-06-23)

These were the open structural calls. All resolved:

1. **Upcoming is not a top-level area.** No `/upcoming` route, no sidebar nav
   item. `UPCOMING` survives as a **Task status** (the snooze flow sets it) and
   is reachable as a **view from inside Today** (a "see upcoming" toggle that
   lets you promote tasks onto today). Mental model: Upcoming = the bench; Today
   = the court. You pull from the bench deliberately for the *Today* list, but a
   bench task with no future due date is also a Next candidate on What Now (§5.2)
   — triage should put real work in front of you, not hide it behind a toggle.
2. **What Now's Next candidate pool = Today + Upcoming (revised 2026-06-25).**
   `getTopTask` selects `status ∈ {TODAY, UPCOMING}` **and** (`dueDate` is null
   or `dueDate ≤ now`), in the active Lens, not done. So a freshly triaged task
   (Upcoming, no due) surfaces as Next immediately; Today stays un-cluttered.
   The due-guard preserves snooze: a snoozed task (Upcoming + future `dueDate`)
   stays off What Now until its time arrives — at which point it auto-resurfaces
   (the behavior §7 had deferred). *(Previously locked 2026-06-23 as "Today
   only"; reversed because a triaged task should be actionable, not invisible —
   the Someday default change in `TRIAGE.md` §5 made Today-only the wrong
   default-pool pairing.)* Someday is never a Next candidate.
3. **Someday lives in the Planning Area.** It's a "maybe later" organizing
   concept, not a working one. The `/someday` page moves under Planning in the
   nav/route cluster.
4. **Work Area = What Now (Now/Next chooser) + Today (committed list).** No
   third surface. What Now shows the single focus task with its Next→Now state
   machine; Today shows the committed-for-today list with the 5-item cap.
5. **Triage lens assignment = an explicit step (revised 2026-06-25).** Triage
   now opens on a **Context (Lens)** step: a radio pre-filled with the active
   lens, which the user confirms with Continue before proceeding. *(Previously
   locked 2026-06-23 as "inherit the active lens, no extra step"; reversed
   because triage is a deliberate specification flow, not a speed dispatch —
   see `TRIAGE.md` §4. The active lens is still the default pre-selection, so
   the common case is one Continue.)* The output entity still lands in whatever
   Lens the user confirms.
6. **Focus switch = expanding-section nav (one section open at a time).** The
   sidebar has two orthogonal switches at the top:
   - **Context switch** (Lens: Work / Me) — always available, orthogonal to
     focus. "Which life context am I in?"
   - **Focus switch** (Work / Plan / Review) — an expanding-section nav. Only
     one section is expanded at a time; expanding one collapses the others.
     This delivers the "when you're in a view, you don't see other things"
     property with plain nav state (no routing-layer change).
   - Expanding **Work** shows: What Now, Today.
   - Expanding **Plan** shows: Projects, Goals, Someday.
   - Expanding **Review** shows: Logbook, reports (when built).
   - **Capture stays pinned outside both switches** — it's pervasive.
   - This is **soft focus now**. A future **hard focus** (each mode as a
     distinct full-screen layout) is the north star, flagged in `BACKLOG.md`.

## 6. Document cascade

The following were updated to match this doc (commit alongside):

- `FEATURES.md` — status note flags it as predating the triage/modes refactor;
  defers to WORKFLOW.md on structure. The F-numbered feature list stays useful
  for feature-level reference.
- `PAGES.md` — route map reorganized into Work / Planning / Review clusters;
  Upcoming demoted (no top-level route/nav item; reachable from Today);
  Someday relocated to Planning.
- `DATA-MODEL.md` — status note confirms InboxItem stays unscoped; Task status
  enum keeps `UPCOMING` (used by snooze; surfaced from Today, not as an area);
  the §4 "where things live" list aligns with the 5-areas model.
- `TRIAGE.md` — already aligns on the keymap (canonical as of 2026-06-22); no
  structural change, just a cross-reference to WORKFLOW.md §2.2.

## 7. Code work implied (flagged in `BACKLOG.md`, not built here)

- **Focus-switch nav** — AppShell sidebar refactor: mode sections (Work/Plan/
  Review) as expanding accordions, one open at a time; Lens switch above;
  Capture pinned outside. No route changes.
- **Upcoming → Today toggle** — add a "see upcoming" affordance on the Today
  page that surfaces `status=UPCOMING` tasks (scoped to the active lens) for
  promotion onto today.
- **Drop the Upcoming nav entry + route** — remove `/app/upcoming` from the
  sidebar and `main.wasp.ts` (keep `getTasks` able to query `UPCOMING` for the
  Today toggle; just no dedicated page/area).
- **Someday nav relocation** — move the Someday entry under the Plan section of
  the new focus-switch nav (route stays `/app/someday`).
- **(Done 2026-06-25)** `getTopTask` scope — widened from `status=TODAY` to
  `status ∈ {TODAY, UPCOMING}` with a `dueDate ≤ now` (or null) guard, so a
  triaged-to-Upcoming task surfaces on What Now and a snoozed task auto-resurfaces
  when its snooze expires. See §5.2.
