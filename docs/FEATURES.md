# ActionAmp — Feature Reference

> **Status: HISTORICAL REFERENCE ONLY.** Kept for the F-numbered cross-reference
> scheme still used in code/specs (e.g. `getTopTask` is commented "F10";
> `TodayPage` enforces "F12"). The F-numbered list itself predates the
> 2026-07-04/05 weekend and is **not** reconciled to recent shipments
> (Variant F focus redesign, task notes + completion log, Upcoming top-level
> nav, goal-planning lifecycle, custom lenses, capture grammar v2, triage
> Classify step).
>
> **For "does feature X exist / what does it do?"** use the per-feature catalog
> at [`docs/features/`](features/) — 1 file per feature, 1:1 with specs,
> code-verified, and the source of truth. **This catalog wins over FEATURES.md**
> on existence/status questions; FEATURES.md wins only on the F-number scheme.
>
> **For *where* things live** (areas, modes, routing), `WORKFLOW.md` is
> canonical and overrides this doc. This doc describes *what* each feature does,
> not where it sits.

---

## 0. The core loop

Every other todo app optimizes step 1. ActionAmp optimizes step 3.

```
  1. CAPTURE        2. CLARIFY        3. FOCUS          4. DO            5. COMPLETE
  (instant)         (triage inbox)    (what now?)       (one thing)      (close the loop)
   thought →        when? where?      pick one,         single-item      satisfying done,
   inbox            how long?         hide the rest     view             light momentum
```

The product bet: **overwhelm happens at step 3, not step 1.** The home screen is the *chooser*, not the *list*. See `PRODUCT.md` and `SUCCESS.md` for the thesis and the testable bets.

---

## 1. Capture — thought → inbox in under 2 seconds

| # | Feature | Status | Notes |
|---|---|---|---|
| **F1** | Global quick-add (`⌘K`) | ✅ Shipped | `CapturePopover.tsx`. Floating input from anywhere; stays on current screen. |
| **F2** | Natural-language parsing | ✅ Shipped | `parseCapture.ts`. `tomorrow` → date, `#x` → project, `@x` → tag, `!2` → priority, `~20m` → size. Tokens show as inline chips. |
| **F3** | Inbox | ✅ Shipped | Everything lands here unassigned until triaged. The only "queue" concept. |
| **F4** | Capture-with-context (`Shift+Enter`) | 🟡 Phase 2 | Full editor from the palette (notes, subtasks, date pickers). |
| **F5** | Email-in capture | 🟡 Phase 2 | Per-user inbox address; forwarding creates an item. |

**Non-goals:** voice (handled by OS dictation into the text field), general
file attachments *(Phase 2)*. One image from an Android/Chrome PWA share is
supported as an Inbox attachment.

---

## 2. Clarify — triage the inbox

Goal: move items *out* of the inbox into a place the focus engine can use. This is the only list-y screen — intentionally a temporary staging area, not a home.

| # | Feature | Status | Notes |
|---|---|---|---|
| **F6** | Inbox review (triage wizard) | ✅ Shipped (reworked) | **No longer one-key dispatch.** A per-item *specification wizard*: Context → Type → Spec → Complete. See `TRIAGE.md` §4. The old `1/2/3/4/Del` keymap is obsolete; `Del` is now lossless **Archive** (kept in Logbook). |
| **F7** | Bulk clarify | 🟡 Phase 2 | Multi-select + assign goal/lens/date in one keystroke. |

**The model** (GTD + PARA flavor — full detail in `DATA-MODEL.md`, structural authority in `WORKFLOW.md`):

- **Inbox** — unprocessed. · **Today** — committed to today *(capped — see F12)*.
- **Upcoming** — dated future. · **Someday** — no date, not forgotten, not nagging.
- **Lens** — active life-context switch (Work / Me; custom lenses are Pro — F26).
- **Goals** — organizing layer (replaces PARA's "Areas"): active outcomes.
- **Projects** — multi-step outcomes (live under a Goal).
- **Tags** — cross-cutting: `~15m`, `~1h`, `low-energy`, `high-energy`, `#errands`, `#phone`. **The focus engine leans on these.**

---

## 3. Focus — "Next?" (the soul of the app)

The home screen (`/app`). Every other app opens to a list. ActionAmp opens to a *decision*.

| # | Feature | Status | Notes |
|---|---|---|---|
| **F8** | "Next" view (default home) | ✅ Shipped | `NextPage.tsx` + `NextCard.tsx`. Surfaces one item (default 1, max 3), hides the rest. |
| **F9** | Moment bar | 🔵 Mockup | `mockups/moment-bar.html` only. Not in the live app. Set time-available + energy + optional lens. |
| **F9b** | Task attributes (Priority + Size) | ✅ Shipped | Priority `Low/Normal/Important` (primary focus sort); Size `S/M/L/XL` (secondary). Set inline from keyboard. |
| **F9c** | XL prompts break-down | ✅ Shipped | Setting XL prompts "break it down?" → convert to Project / add subtasks / dismiss. |
| **F10** | Focus matcher | ✅ Shipped (reworked) | `getTopTask` in `tasks/operations.ts`. **Priority-first, transparent.** Candidate pool is `Today + Upcoming` with a `dueDate ≤ now` (or null) guard — not "Today/overdue only" as the original plan said. A freshly-triaged Upcoming task surfaces on Next; a snoozed task auto-resurfaces when due. One-line "why this?" under the suggestion. See `WORKFLOW.md` §5.2. |
| **F11** | "Not now" behaviors | ✅ Shipped | `SnoozeSheet.tsx`. Snooze (1h/3h/tomorrow/weekend), → Someday, skip-once. |

---

## 4. Do — single-item execution

| # | Feature | Status | Notes |
|---|---|---|---|
| **F12** | Today cap | ✅ Shipped | `TodayPage.tsx` (`TODAY_CAP = 5`). A 6th requires bumping one out. Configurable. A *feature*, not a limit — forces the "what actually matters today" decision. |
| **F13** | Focus mode (single-task view) | ✅ Shipped | `FocusMode.tsx`. Full-screen single task + notes; no sidebar/list/counts. |
| **F14** | Optional timer | 🟡 Phase 2 | Pomodoro-style. *(Some F14 references in code mean "in-progress persists," which is shipped — the timer itself is not.)* |
| **F15** | Subtasks | 🟡 Phase 2 | Checklist within a task. Completing all subtasks does *not* auto-complete the parent. |

---

## 5. Complete & reflect

| # | Feature | Status | Notes |
|---|---|---|---|
| **F16** | Satisfying completion | ✅ Shipped | `CompletionCircle.tsx`. Check animation, optimistic removal, soft confirmation. |
| **F17** | Momentum | ⛔ Banned | **Removed by design.** Streaks/badges/guilt-trip counters are banned by `PRODUCT.md` and `DESIGN-SYSTEM.md`. References are historical only. |
| **F18** | Logbook | ✅ Shipped | `/app/logbook`. Completed items archive here (Things-style). Searchable, not in your face. |
| **F19** | Weekly review | 🔵 Spec | `specs/weekly-monthly-review.md` (ready, not built). Gentle nudge to clear Inbox + pick tomorrow's top 3. |

---

## 6. Navigation & keyboard (first-class)

**Principle:** every primary action has a keyboard shortcut; the mouse is optional. `?` shows the cheatsheet; hover hints on buttons.

| Shortcut | Action | Source |
|---|---|---|
| `⌘K` | Quick capture (from anywhere) | F1 |
| `Space` | Open "Next" (home) | — |
| `?` | Shortcut cheat sheet | F21 |
| `J` / `K` | Move selection down / up | — |
| `Enter` | Open selected item | — |
| `⌘Enter` / `D` | Mark done | F16 |
| `E` | Edit | — |
| `H` | Snooze / hide ("not now") | F11 |
| `T` | Set time-available · `G` | Set energy | F9 (when built) |
| `F` | Enter focus mode | F13 |
| `P` | Pin to top of Today | — |
| `Esc` | Close / back | — |

> The triage keymap lives in `TRIAGE.md` §4 (Context → Type → Spec → Complete wizard), not here.

| # | Feature | Status | Notes |
|---|---|---|---|
| **F20** | Command palette (`⌘\`) | 🔵 Spec | `specs/command-palette-search.md` (ready, not built). Fuzzy jump/run/find over everything. |
| **F21** | Keyboard hints | ✅ Shipped | `ShortcutCheatsheet.tsx`. `?` overlay; discoverable shortcuts. |

---

## 7. Cross-cutting

| # | Feature | Status | Notes |
|---|---|---|---|
| **F22** | Full-text search | 🟡 Phase 2 | Across items, notes, Logbook. No dedicated search op yet. |
| **F23** | Offline-capable | 🟡 Phase 2 | Capture & complete offline; sync on reconnect (React Query cache helps). |
| **F24** | Dark mode + calm default | ✅ Shipped | `[data-theme="dark"]` via Settings → Preferences. See `DESIGN-SYSTEM.md` §3. |
| **F25** | Multi-device sync | 🟡 Phase 2 | Web now; Wasp architecture gets us cross-device later. |
| **F26** | Custom Lenses | ✅ Shipped | `/app/settings/lenses`. Pro-only CRUD beyond the seeded Work/Me pair. See `specs/custom-lenses.md`. |

---

## 8. Status legend

| Mark | Meaning |
|---|---|
| ✅ Shipped | Built and live in `webapp/src/`. |
| 🔵 Spec | Spec exists (`docs/specs/`), ready/draft, not yet built. |
| 🟡 Phase 2 | Explicitly deferred; no spec yet. |
| ⛔ Banned | Removed by design (violates PRODUCT.md calm principles). |

**What changed since the original v1 draft:** F6 reworked from one-key dispatch → specification wizard; F10 candidate pool expanded (Today+Upcoming, not Today/overdue only); F17 (momentum) banned outright; F26 (custom lenses) added; structural claims (3 modes / 5 areas / where things live) moved to `WORKFLOW.md`. Open decisions from §9 of the original are all resolved — home = Next, Today cap = 5 default, matcher = priority-first, timer = Phase 2.
