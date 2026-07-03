# ActionAmp — Interaction Model (Modal Architecture)

> Status: CANONICAL — 2026-06-16
> The thesis: **every task manager optimizes states (lists, cards).
> ActionAmp optimizes transitions. The interaction model is modal.**
> Visual DNA is Things (calm, minimal, lively). The *behavior* is unlike any of them.

---

## 1. The philosophy: modal, not menu

ActionAmp is a **modal interface**, in the tradition of VIM / Emacs / Helix / Tmux.

- **Menu apps** (every other task manager): navigation is a sidebar of nouns
  (Inbox / Today / Projects / Goals). Every screen is interchangeable list-views
  with different data. The chrome is constant; the content varies.
- **Modal apps**: navigation is a *state*. You are *in* a mode. Each mode has its
  own keyset, its own visible chrome, its own affordances. To do something, you
  first enter the mode where that thing is possible. Movement between modes is
  the navigation.

This is why ActionAmp feels nothing like Things/Todoist/Asana once you use it:
the chrome changes around you, the rules change, the keys change. You're not
clicking through pages — you're **shifting modes**.

### Load-bearing consequence: modes are renderings, not pages

Plan / Do / Review are **three renderings of the same Mode × Scope card
position**, not three separate pages. At Task scope:

- **Plan mode** = Today list card (arrange commitments)
- **Do mode** = Next hero (one task, working state)
- **Review mode** = debrief (look back)

Switching modes re-renders the card; it doesn't navigate to a new screen. This
keeps the architecture pure: every surface lives at a Mode × Scope coordinate,
and the data underneath is the same — only the presentation changes.

### Why modal fits the product thesis
The whole bet is *focus*. Modal UIs *enforce* focus: in Working mode, almost
nothing else is possible, because almost nothing else should be. The interface
becomes a guardrail for the cognitive state we want the user in.

### The cost we accept
Modal UIs have a learning curve. Mitigations:
- **Normal mode is fully mouse-usable** — non-keyboard users aren't locked out.
- **Visible mode indicator** (bottom-left, like VIM's `-- INSERT --`).
- **`?` shows the current mode's keyset** — always discoverable.
- **Soft failures** — invalid keys don't error; they no-op or flash the hint.
- **Esc is universal exit** — always returns to Normal mode.

---

## 2. The two axes (the spine)

Navigation is two orthogonal movements, not a sidebar:

| Axis | Question it answers | Desktop | Mobile |
|---|---|---|---|
| **MODE** | What am I doing? (Plan / Do / Review) | bottom dial + `1` `2` `3` | swipe horizontally on card |
| **SCOPE** | What level am I looking at? (Task / Project / Goal) | zoom dock + `Z` / `X` | pinch in/out |

**Mode × Scope = the whole navigation space.** A 3×3 grid of cognitive positions.
Past/future is a third, implicit axis (side rails on desktop, swipe-from-edge on mobile).

The sidebar of nouns is dead. There is no Inbox page, no Projects page — those
are *mode × scope* positions. Inbox = (Triage mode × Task scope). Projects list
= (Plan mode × Project scope). Etc.

---

## 3. The modes — full definition

Each mode below specifies: **purpose**, **entry**, **exit**, **keyset**,
**mobile gestures**, **chrome behavior**, **mode indicator text**.

### NORMAL mode (default)
- **Purpose:** browse, choose, orient. The home base.
- **Entry:** Esc from anywhere; app launch; completing/cancelling any sub-mode.
- **Exit:** any other mode's entry trigger.
- **Keyset:**
  - `Z` / `X` — zoom out / in (scope)
  - `1` `2` `3` — Plan / Do / Review (mode)
  - `S` — Switch task (opens confirm)
  - `⌘K` / `⌘/` — Capture mode
  - `⌘\` — Command mode
  - `L` — cycle Lens (Work / Me)
  - `g` `i/n/t/p/r` — jump to Inbox / Next / Triage / Planning / Review (two-key chord)
  - `←` / `→` — peek past / future
  - `?` — show keyset
  - `Enter` — start working (when a task is focused)
- **Mobile:** tap card = focus; pinch = zoom; swipe horizontal = mode; long-press = working.
- **Chrome:** full HUD — top bar (brand/lens/breadcrumb/theme), side rails, bottom dial + zoom + capture.
- **Indicator:** `NORMAL` (or hidden — it's the default).

### WORKING mode (the sanctuary)
- **Purpose:** you are doing the thing. The card is the world.
- **Entry:** click **Do this** / `Enter` from Normal (task focused).
- **Exit:** `Esc` (pauses), **Done ✓** (completes), **Take a break** (pauses).
- **Keyset (intentionally tiny):**
  - `Esc` or `Space` — pause
  - `D` — done
  - `⌘K` / `⌘/` — **capture (the one exception)** — protects focus from stray thoughts
  - That's it. Zoom, mode-switch, lens — all suppressed. The world is this task.
- **Sub-states:** `working ⇄ paused → done`. Paused = amber pulse, timer frozen. Done = checkmark fills.
- **Mobile:** long-press the card → enters working. Tap the circle = pause/resume. Swipe-down = done.
- **Chrome:** **all chrome hidden** (not dimmed — gone). Only the task card, timer, feelings, note, and the exit controls.
- **Indicator:** `WORKING` (teal) or `PAUSED` (amber).

### CAPTURE mode (`⌘K` / `⌘/`)
- **Purpose:** dump a thought into the universal Inbox, fast, from anywhere.
- **Entry:** `⌘K` or `⌘/` (even inside Working mode — the focus-protector).
- **Exit:** `Enter` (saves to Inbox, returns to prior mode) / `Esc` (cancels).
- **Keyset:** type freely; NL parsing chips appear inline; `Tab` cycles field focus.
- **Mobile:** pull-down-from-top gesture (iOS-standard) or FAB.
- **Chrome:** a floating palette over whatever's underneath; background dims.
- **Indicator:** `CAPTURE`.

### TRIAGE mode (Inbox review)
- **Purpose:** GTD clarify — one Inbox item at a time, decide what it becomes.
- **Entry:** click Inbox count / `I` from Normal.
- **Exit:** `Esc` / `Q` (done triaging) / empty inbox.
- **Keyset (the dispatch keys):**
  - `1` → Task (Today) · `2` → Task (Upcoming) · `3` → Task (Someday)
  - `P` → new/existing Project · `G` → link to Goal
  - `R` → Resource (under Project/Goal)
  - `Del` / `Backspace` — trash
  - `←` / `→` — previous / next Inbox item
- **Mobile:** swipe-right = dispatch to Today, swipe-left = Someday, long-press = full menu.
- **Chrome:** one Inbox card center-stage, dispatch hints around it, progress dot ("3 of 7").
- **Indicator:** `TRIAGE`.

### COMMAND mode (`⌘\`)
- **Purpose:** fuzzy power-user escape hatch — jump/run anything.
- **Entry:** `⌘\`.
- **Exit:** `Enter` (run) / `Esc` (cancel).
- **Keyset:** type fuzzy query; ↑↓ navigate; Enter runs.
- **Mobile:** not applicable (mouse/keyboard power-user feature); long-press brand mark as equivalent.
- **Chrome:** palette overlay.
- **Indicator:** `COMMAND`.

### ZOOM mode (Goal/Project scope)
- **Purpose:** see the bigger picture — what is this task part of?
- **Entry:** `Z` from Normal (task focused); click a breadcrumb crumb.
- **Exit:** `X` (zoom back in) / `Esc` / click task.
- **Keyset:** same as Normal + `Enter` on a Project/Goal **re-anchors** the whole view there (you're now "based" at that scope — dedicated review).
- **Mobile:** pinch out = zoom out; tap a card = re-anchor.
- **Chrome:** breadcrumb prominent (orientation), ancestor cards visible above task.
- **Indicator:** `ZOOM: PROJECT` / `ZOOM: GOAL`.

---

## 4. The mode indicator

Bottom-left, where the hint pill lives now. Subtle but always visible:

```
-- WORKING --       (teal, when in working mode)
-- PAUSED --        (amber)
-- CAPTURE --       (teal, while palette open)
-- TRIAGE -- 3/7    (teal, with progress)
-- NORMAL --        (hidden by default — it's the default)
```

Style: monospace, 11px, dim — present but not loud. Like VIM's mode line.

---

## 5. Desktop → mobile gesture map

The whole point: **the modes survive the loss of a keyboard.** The triggers
translate to thumbs.

| Action | Desktop | Mobile |
|---|---|---|
| Zoom out (Task→Project→Goal) | `Z` / click breadcrumb crumb | two-finger swipe left / tap breadcrumb crumb |
| Zoom in | `X` / click breadcrumb crumb | two-finger swipe right / tap breadcrumb crumb |
| Switch to Plan mode | `1` | swipe right on card |
| Switch to Review mode | `3` | swipe left on card |
| Start working | `Enter` / Do this | long-press card |
| Pause/resume | `Esc` / `Space` | tap circle |
| Mark done | `D` / Done ✓ | swipe-down on card |
| Capture | `⌘K` / `⌘/` | pull-down from top / FAB (FAB stays in working mode as a quiet ghost — the focus-protector exception) |
| Switch task | `S` | swipe-left-and-hold / "next" affordance |
| Cycle Lens | `L` | tap lens chip |
| Peek past / future | `←` / `→` | swipe from left/right screen edge |
| Cancel / exit | `Esc` | tap outside / back gesture |

**Two-finger swipe (left = out / right = in) through Task→Project→Goal is the
signature mobile gesture.** Nobody else has it. It makes the hierarchy model
physical without fighting the browser's native pinch-zoom.

---

## 6. Accessibility & the modal learning curve

Modal UIs can exclude. We don't want that.

- **Normal mode is fully mouse-usable.** A user who never touches a key can use
  the whole app — click cards, click dial, click zoom dock, click buttons.
  Keys are accelerators, not requirements.
- **`?` shows the current mode's keyset** in a cheatsheet overlay.
- **Mode indicator is always visible** — you always know where you are.
- **Invalid actions no-op softly.** Pressing `Z` in Working mode doesn't error;
  it flashes the indicator ("still working — Esc to pause") and discards.
- **Esc is universal exit.** Always returns to Normal. Always.
- **`prefers-reduced-motion`** disables all transitions; modes still switch,
  just instantly. Content remains legible.

---

## 7. Reference prototypes

| File | What it demonstrates |
|---|---|
| `docs/mockups/mode-zoom-unified.html` | The spine: Mode × Zoom, working state with breathing halo, feelings, session timeline, switch confirm, focus lock. **The canonical desktop prototype.** |
| `docs/mockups/approach-a-zoom-pan.html` | Pure zoom exploration (A). |
| `docs/mockups/approach-b-focus-blur.html` | Focus/blur exploration (B). |
| `docs/mockups/approach-c-time-adaptive.html` | Time-adaptive exploration (C) — the mode dial origin. |

---

## 8. Open questions

1. **Should Working mode have a "pause reason"?** Lean: no — silent pause, optional note. Don't interrogate.
2. **Switch during working?** Currently idle-only. Should mid-task Switch require the confirm modal? Lean: yes.
3. **Visual/selection mode** (VIM-style multi-select for bulk triage)? Phase 2.
4. **Mobile long-press vs swipe-up for entering work?** Needs the mock to decide.
