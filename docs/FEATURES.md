# ActionAmp — Feature Spec

> Status: DRAFT v1 — feature-level reference.
> **Structural authority has moved to `WORKFLOW.md`** (2026-06-23). Where this
> doc describes *areas, modes, or where things live* (the §0 loop framing, the
> Upcoming/Someday placement in §2, the Today-vs-Next split), it predates the
> 3-modes / 5-areas model and is superseded. The F-numbered feature list below
> remains useful as feature-level reference (what each feature does); it does
> not describe *where* features live.
>
> Key structural changes (see `WORKFLOW.md` §5):
>
> - **Upcoming is not a top-level area** — no `/upcoming` route/nav item; it's a
>   status reachable from Today.
> - **Someday lives in the Planning Area** (not its own top-level area).
> - **Work Area = Next (Now/Next) + Today** only.
> - **Three focus modes** (Work / Plan / Review) surfaced as an expanding-section
>   nav; Capture is pervasive.
>
> **Additional staleness (2026-06-25 triage/matcher rework — not yet rewritten
> below; defer to the canonical docs):**
>
> - **F6's keymap is obsolete.** Triage is no longer one-key dispatch
>   (`1/2/3/4/Del`). It's a per-item **specification wizard** (Context → Type →
>   Spec → Complete). See `TRIAGE.md` §4. The `Del → trash` outcome is now
>   **Archive** (lossless, kept in the Logbook).
> - **F10's candidate pool is obsolete.** `getTopTask` no longer selects
>   "Today/overdue" only — it selects `Today + Upcoming` with a `dueDate ≤ now`
>   (or null) guard, so a freshly-triaged Upcoming task surfaces on Next and
>   a snoozed task auto-resurfaces when due. See `WORKFLOW.md` §5.2. The triage
>   Task default is now **Upcoming**, not Someday (`TRIAGE.md` §5).
>
> Inspirations: Things (calm, refined, Inbox→Today model), TickTick (flexible, fast).
> Wedge: **the list is demoted; "what now" is the home screen.** See §3.
> Model authority: `DATA-MODEL.md` + `METHODOLOGY.md` (GTD + PARA flavor, Goals
> replace Areas, Work/Me switch = **Lens**).

---

## 0. The core loop

Every other todo app optimizes step 1. ActionAmp optimizes step 3.

```
  1. CAPTURE        2. CLARIFY        3. FOCUS          4. DO            5. COMPLETE
  (instant)         (triage inbox)    (what now?)       (one thing)      (close the loop)
   thought →        when? where?      pick one,         single-item      satisfying done,
   inbox            how long?         hide the rest     view             light momentum
```

The product bet: **overwhelm happens at step 3, not step 1.** ADHD brains don't fail to capture; they fail to choose. So the home screen is the *chooser*, not the *list*.

---

## 1. Capture

Goal: thought → inbox in under 2 seconds, never leaving the keyboard.

- **F1. Global quick-add** — `Cmd+K` opens a floating input from *anywhere* in the app. Type, `Enter`, done. Stays on the current screen.
- **F2. Natural-language parsing** (Things/TickTick style) — `Email Sarah re: invoice tomorrow #deep-work [[work]] !2 ~20m`
  - `tomorrow` → due date · `#deep-work` → tag · `[[work]]` → lens override (resolved at triage on `kind` for seeded, name for custom) · `!2` → priority · `~20m` → size (time tokens map to S/M/L/XL, e.g. <15m=S, <1h=M, <2h=L, >2h=XL). Project intent is matched from free text by the resolver (no sigil) — "Email Sarah about MVP" suggests the MVP project.
  - Parsed tokens show as chips inline before you hit Enter (so you see what it understood).
  - Grammar v2 (locked 2026-07-04): `#` is a tag, `@` is time only, `[[lens]]` is the explicit lens override (TRIAGE.md §7.5). An explicit `today`/`tonight` token pre-fills When = Today at triage. See `docs/specs/capture-grammar.md`.
- **F3. Inbox** — everything lands here unassigned until clarified. The Inbox count is the only "queue" concept.
- **F4. Capture-with-context** — `Shift+Enter` from quick-add opens the full editor (notes, subtasks, due date pickers) without leaving the palette.
- **F5. Email-in capture** *(Phase 2)* — a per-user inbox address so forwarding an email creates an item.

**Non-goals:** voice (handled by OS dictation into the text field), file attachments *(Phase 2)*.

---

## 2. Clarify (triage the inbox)

Goal: get items *out* of the inbox and *into* a place where the focus engine can use them. This is the only screen that looks list-y — and it's intentionally a temporary staging area, not a home.

- **F6. Inbox review mode** — walk the inbox one item at a time (not as a wall of rows): show one item, tap a key to dispatch it, next item appears.
  - `1` → Today · `2` → Upcoming (pick date) · `3` → Someday · `4` → Project (pick) · `Del` → trash
- **F7. Bulk clarify** — for when you do want the list: multi-select, assign goal/lens/date in one keystroke.

**The model (GTD + PARA flavor — full detail in `DATA-MODEL.md`):**

- **Inbox** — unprocessed.
- **Today** — things you've committed to doing today. *(See F12: this is capped.)*
- **Upcoming** — dated future items.
- **Someday** — no date, not forgotten, not nagging.
- **Lens** — the active life-context switch (Work / Me). Everything is scoped by it.
- **Goals** — the organizing layer (replaces PARA's "Areas"): active outcomes like "Run a 10k".
- **Projects** — multi-step outcomes (live under a Goal).
- **Tags** — cross-cutting: `~15m`, `~1h`, `low-energy`, `high-energy`, `#errands`, `#phone`. **The focus engine leans on these.**

---

## 3. Focus — "Next?" (the soul of the app)

This is the home screen. Every other app opens to a list. We open to a *decision*.

### F8. "Next" view (default home)

Given the current moment, surface **one** item — or a deliberately tiny set (default 1, max 3) — and *hide everything else*. The rest of your list still exists; you just don't see it right now.

Anatomy of the view:

```
┌─────────────────────────────────────┐
│  Right now                           │
│  ~30 min available · low energy      │  ← moment you set (or it infers)
│                                      │
│         📧 Email Sarah re: invoice    │  ← THE thing
│         Work · due tomorrow · 15 min  │
│                                      │
│   [ Do this ]   [ Not now ]  [ ⋯ ]   │
└─────────────────────────────────────┘
```

### F9. Moment bar

You tell ActionAmp the moment you're in:

- **Time available** — `15m / 30m / 1h / 2h+` (or "until X o'clock")
- **Energy** — `low / medium / high`
- Optionally **Lens** — "only Work stuff right now" (switches the active Lens)
One keystroke each. Defaults can be inferred from time-of-day (mornings = high energy, post-lunch = low) — overridable.

### F9b. Task attributes (Priority + Size)

Every Task carries two simple attributes that the focus engine reads:

- **Priority** — `Low / Normal / Important` (3 levels). *(Primary sort key for focus.)*
- **Size** — `S / M / L / XL`. *(Secondary signal; also a nudge — see F9c.)*
Set inline from the keyboard while triaging or editing. No 1–10 scales, no analysis paralysis.

### F9c. XL prompts a break-down

Setting a Task to **XL surfaces a prompt: "This is big — break it down?"**

- → **Convert to a Project** (the task becomes the Project; you add the steps), or
- → **Add subtasks** to keep it a Task, or
- → **Keep as-is** (you can dismiss; it's a nudge, not a block).
XL work shouldn't sit silently as a single Task. This is the same path as the Task→Project promotion in the data model.

### F10. The focus matcher (MVP = priority-first, transparent)

Candidates = Tasks in the **active Lens** that are Today/overdue. Rank by:

1. **Priority** — Important > Normal > Low *(primary sort)*
2. **Size** as secondary signal (smaller first within a priority tier — quick wins)
3. Due/overdue as a hard pre-filter

That's the MVP. Time-available, energy, and tags are **refinement layers added later**, on top of priority + size.

**Transparent by design** — a one-line "why this?" under the suggestion ("Important · due today · S"). The algorithm is never a black box; users can always see *why* and override.

### F11. "Not now" behaviors

- `H` (snooze) — push 1h / 3h / tomorrow / weekend. Item leaves the focus queue until then.
- `→ Someday` — deprioritize without dating.
- `Skip once` — it'll come back tomorrow.

---

## 4. Do (single-item execution)

### F12. Today is capped

**Today maxes out at N items (default 5, configurable).** To add a 6th, you must bump one out. This is a *feature*, not a limit — it forces the "what actually matters today" decision that ADHD brains avoid. *(Configurable; can be turned off for people who hate it.)*

### F13. Focus mode (single-task view)

From any item, `F` enters full-screen single-task mode: the task, its notes, an optional timer, and *nothing else*. No sidebar, no list, no counts. Exiting returns to "Next".

### F14. Optional timer

- Pomodoro-style (default 25/5, configurable).
- Optional ambient tick / completion sound.
- Timer running = item is "in progress" (visible if you navigate away, but the app won't pester).

### F15. Subtasks

Checklist within a task. Completing all subtasks does *not* auto-complete the parent (Things got this right — you decide when it's done).

---

## 5. Complete & reflect

- **F16. Satisfying completion** — check animation, item leaves the list immediately (optimistic), soft confirmation.
- **F17. Momentum** — *light* streak / "X done today" counter. No badges, no levels, no guilt-trip red dots. Optional; off by default if you find it punishing.
- **F18. Logbook** — completed items archive here (Things-style). Searchable, not in your face.
- **F19. Weekly review prompt** *(Phase 2)* — gentle nudge: "Clear your Inbox (4), pick tomorrow's top 3."

---

## 6. Navigation & keyboard (first-class)

**Principle:** every primary action has a keyboard shortcut; the mouse is optional, not required. Shortcuts are discoverable (`?` shows them; hover hints on buttons).

| Shortcut | Action |
|---|---|
| `Cmd+K` | Quick capture (from anywhere) |
| `Space` | Open "Next" (home) |
| `?` | Shortcut cheat sheet |
| `J` / `K` | Move selection down / up |
| `Enter` | Open selected item |
| `Cmd+Enter` / `D` | Mark done |
| `E` | Edit |
| `H` | Snooze / hide ("not now") |
| `1` `2` `3` | Assign Today / Upcoming / Someday (in clarify) |
| `T` | Set time-available · `G` | Set energy (cycles low→med→high) |
| `F` | Enter focus mode (single-task view) |
| `P` | Pin to top of Today |
| `Cmd+\` | Command palette (fuzzy: jump, run any action, find item) |
| `Esc` | Close / back |

- **F20. Command palette** (`Cmd+\`) — fuzzy search over *everything*: items, projects, goals, lenses, views, and actions ("start timer", "set energy low"). Power-user escape hatch.
- **F21. Keyboard hints** — holding `?` (or `Cmd`) overlays the shortcut on every visible control (à la Gmail/Linear).

---

## 7. Cross-cutting

- **F22. Full-text search** — across items, notes, completed (Logbook).
- **F23. Offline-capable** — capture & complete work offline; syncs when back. (Wasp's React Query cache makes this natural.)
- **F24. Dark mode** + calm default theme. Refined typography, generous whitespace (the Things DNA).
- **F25. Multi-device sync** — web now; the architecture (Wasp) gets us here for free later.

---

## 8. MVP cut vs. Phase 2

**MVP (the smallest thing that proves the wedge):**

- F1 quick-add, F2 NL parsing (basic), F3 Inbox
- F6 Inbox review + the model (Today/Upcoming/Someday/Lens/Goals/Projects/Tags)
- **F8 Next view + F9 moment bar + F9b/F9c attributes + F10 priority-first matcher** ← the bet
- F12 Today cap, F13 focus mode (no timer yet), F15 subtasks
- F16 completion, F18 Logbook
- F20 command palette, F21 keyboard hints, the shortcut set
- F22 search, F24 dark mode
- Email + social auth

**Phase 2:**

- F4 full editor in palette, F5 email-in
- F7 bulk clarify
- F14 timer (or pull into MVP if cheap)
- F17 momentum, F19 weekly review
- AI-tuned focus suggestions (learn from what you pick/skip)
- F23 offline, native mobile

---

## 9. Open decisions (need your call)

1. **Home screen = "Next"** (my strong rec) vs. opening to Today-as-list. *This is the central bet — push back if it feels wrong.*
2. **Today cap of 5** — enforce by default (you can change/disable), or don't cap at all?
3. **Focus matcher = priority-first** for MVP (decided: sort by priority; time/energy/tags are later refinements). *Open: is "AI suggest" ever core, or always Phase 2? (lean: always Phase 2.)*
4. **Timer** — MVP or Phase 2?
