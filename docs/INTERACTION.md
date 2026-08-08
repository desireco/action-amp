# ActionAmp — Interaction Model (Modal Architecture)

> Status: CANONICAL — 2026-08-07 (centered focus-session redesign; overlay
> patterns folded in from `modal-approach.md`).
> The thesis: **every task manager optimizes states (lists, cards).
> ActionAmp optimizes transitions. The interaction model is modal.**
> Visual DNA is Things (calm, minimal, lively). The _behavior_ is unlike any of them.
>
> This doc is now the single home for **both** the modal mode architecture
> (§§1–8) and the four overlay patterns (§9) — `modal-approach.md` was merged
> in 2026-07-05 and removed.

---

## 1. The philosophy: modal, not menu

ActionAmp is a **modal interface**, in the tradition of VIM / Emacs / Helix / Tmux.

- **Menu apps** (every other task manager): navigation is a sidebar of nouns
  (Inbox / Today / Projects / Goals). Every screen is interchangeable list-views
  with different data. The chrome is constant; the content varies.
- **Modal apps**: navigation is a _state_. You are _in_ a mode. Each mode has its
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

The whole bet is _focus_. Modal UIs _enforce_ focus: in Working mode, almost
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

| Axis      | Question it answers                                 | Desktop                   | Mobile                     |
| --------- | --------------------------------------------------- | ------------------------- | -------------------------- |
| **MODE**  | What am I doing? (Plan / Do / Review)               | bottom dial + `1` `2` `3` | swipe horizontally on card |
| **SCOPE** | What level am I looking at? (Task / Project / Goal) | zoom dock + `Z` / `X`     | pinch in/out               |

**Mode × Scope = the whole navigation space.** A 3×3 grid of cognitive positions.
Past/future is a third, implicit axis (side rails on desktop, swipe-from-edge on mobile).

The sidebar of nouns is dead. There is no Inbox page, no Projects page — those
are _mode × scope_ positions. Inbox = (Triage mode × Task scope). Projects list
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
  - `⌘K` — Capture mode (works in text fields — the focus-protector)
  - `⇧C` — Capture (typing-safe convenience; same as ⌘K)
  - `⌘\` — Command mode
  - `/` — Search mode (same popover, search-first empty state; disabled while typing)
  - `⌘L` — toggle the Lens switcher (segmented ≤3 lenses; chip + popover ≥4). Works in text fields like the other ⌘-chords.
  - `⇧I` / `⇧N` / `⇧T` / `⇧G` / `⇧P` / `⇧R` — jump to Inbox / Next / Today / TriaGe / Planning / Review
  - `←` / `→` — peek past / future
  - `?` — show keyset
  - `Enter` — start working (when a task is focused)
- **Mobile:** tap card = focus; pinch = zoom; swipe horizontal = mode; long-press = working.
- **Chrome:** full HUD — top bar (brand/lens/breadcrumb/theme), side rails, bottom dial + zoom + capture.
- **Indicator:** `NORMAL` (or hidden — it's the default).

### Review cadence navigation

Review has three direct debrief routes: Today, Week, and Month. Desktop shows
each enabled cadence under the always-open Review nav group; `⇧R` opens the
first enabled cadence. Mobile keeps one Review dock destination with the same
preference-aware resolution, falling back to Logbook when every cadence is
disabled. Inside a review, `[` / `]` move periods, `J` / `K` move through
evidence, `E` focuses reflection, and `R` records or updates the review. Form
fields suppress these single-key commands.

### WORKING mode (the sanctuary) — centered focus session, revised 2026-08-07

- **Purpose:** you are doing the thing. The card is the world.
- **Entry:** click **Start** / `Enter` from Normal (task focused). Navigates
  to the dedicated `/app/focus` route (not an overlay).
- **Exit:** `Esc` (pauses), **Complete** (was "Done"; opens an inline optional
  completion reflection), **Take a break** (pauses).
- **Keyset (intentionally tiny):**
  - `Esc` or `Space` — pause
  - `D` — open the inline completion reflection
  - `⌘K` — **capture (the one exception)** — protects focus from stray thoughts
  - That's it. Zoom, mode-switch, lens — all suppressed. The world is this task.
- **Sub-states:** `working → session complete → working` for repeat focus
  sessions on the same Task; `working → paused` exits focus; Task completion is
  a separate explicit action.
- **Centered focus-session ring.** The detached top-left clock and ambiguous
  completion circle are gone. One large centered ring counts down the user's
  25- or 45-minute preference and contains Pause/Resume. The ring means focus
  time only — never Task completion. Finishing the countdown closes a
  `TaskSession` with `completed=true`; it does not mark the Task done. A small
  timer symbol and count inside the ring show how many completed focus sessions
  have been recorded for this Task.
- **Centered action hierarchy.** Large Task title and durable clarification
  follow the ring. Labeled **Add note**, **Pause**, and **Complete task** actions
  sit below.
- **One inline composer.** The notes thread is always visible; its composer
  appears on demand rather than permanently. Add note opens the progress-note
  prompt. Complete opens the same notes-area surface with **How did it go?**, an
  optional Outcome field, **Keep working**, and **Complete task**. No completion
  modal or backdrop interrupts the task. Notes write a `TaskUpdate` with
  `kind=NOTE`; completion writes `kind=COMPLETED` (see
  `task-notes-completion-log.md`).
- **Mobile:** long-press the card → enters working. Tap the timer control =
  pause/resume. Task completion remains a labeled action; no completion gesture
  is required for discoverability.
- **Chrome:** **all chrome hidden** (not dimmed — gone). Only the centered timer,
  Task content, explicit actions, notes thread + summoned composer, and exit.
- **Indicator:** `WORKING` (teal) or `PAUSED` (amber).

### CAPTURE mode (`⌘K`)

- **Purpose:** dump a thought into the universal Inbox, fast, from anywhere.
- **Entry:** `⌘K` (even inside Working mode — the focus-protector).
- **Exit:** `Enter` (saves to Inbox, returns to prior mode) / `Esc` (cancels).
- **Keyset:** type freely; NL parsing chips appear inline; `Tab` cycles field focus.
- **Mobile:** pull-down-from-top gesture (iOS-standard) or FAB.
- **Chrome:** a floating palette over whatever's underneath; background dims.
- **Indicator:** `CAPTURE`.

### TRIAGE mode (Inbox review)

- **Purpose:** GTD clarify — one Inbox item at a time, decide what it becomes.
- **Entry:** click Inbox count / `I` from Normal.
- **Exit:** `Esc` / `Q` (done triaging) / empty inbox.
- **Wizard flow** (replaces the old single-card dispatch): **Classify → Spec →
  Ready**. The old `1/2/3 = Task Today/Upcoming/Someday` and `P/G/R`
  dispatch keys are gone. Type chooser is one-line rows with a leading icon;
  Lens is large styled pills. See `TRIAGE.md` §7.4 for the canonical keymap.
- **Keyset (step-aware):**
  - **Classify:** `1` Task · `2` Project · `3` Resource · `/` Lens picker · `Enter` continue · `Del`/`Backspace` Archive
  - **Spec:** `[`/`]` size · `-`/`=` priority · (shared `PropertyChips` editor)
  - **Navigation:** `←`/`→` prev/next Inbox item · `Esc` Spec→Classify or leave triage · `Q` done
- **Mobile:** swipe-right = dispatch to Today, swipe-left = Someday, long-press = full menu.
- **Chrome:** one Inbox card center-stage, dispatch hints around it, progress dot ("3 of 7").
- **Indicator:** `TRIAGE`.

### COMMAND mode (`⌘\`)

- **Purpose:** fuzzy power-user escape hatch — jump/run anything.
- **Entry:** `⌘\`.
- **Exit:** `Enter` (run) / `Esc` (cancel).
- **Keyset:** type fuzzy query; ↑↓ navigate; Enter runs.
- **Mobile:** no hidden long-press command entry. The visible search control opens the same touch-usable component in Search intent; Command remains a hardware-keyboard accelerator.
- **Chrome:** palette overlay.
- **Indicator:** `COMMAND`.

### SEARCH mode (`/`)

- **Purpose:** find user-owned records across every Lens and lifecycle state.
- **Entry:** `/` from Normal mode; the visible search button is the pointer/touch equivalent.
- **Exit:** `Enter` (open result) / `Esc` (cancel).
- **Keyset:** type query; ↑↓ navigate; Enter opens. `/` never steals text from an input/editor.
- **Chrome:** same palette overlay as Command, with search-first empty copy rather than command rows.
- **Indicator:** `SEARCH`.

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
-- COMMAND --       (teal, while command palette open)
-- SEARCH --        (teal, while search palette open)
-- NORMAL --        (hidden by default — it's the default)
```

Style: monospace, 11px, dim — present but not loud. Like VIM's mode line.

---

## 5. Desktop → mobile gesture map

The whole point: **the modes survive the loss of a keyboard.** The triggers
translate to thumbs.

| Action                       | Desktop                      | Mobile                                                                                                |
| ---------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Zoom out (Task→Project→Goal) | `Z` / click breadcrumb crumb | two-finger swipe left / tap breadcrumb crumb                                                          |
| Zoom in                      | `X` / click breadcrumb crumb | two-finger swipe right / tap breadcrumb crumb                                                         |
| Switch to Plan mode          | `1`                          | swipe right on card                                                                                   |
| Switch to Review mode        | `3`                          | swipe left on card                                                                                    |
| Start working                | `Enter` / Start              | long-press card                                                                                       |
| Pause/resume                 | `Esc` / `Space`              | tap the timer control                                                                                 |
| Complete Task                | `D` / Complete task          | tap the labeled Complete task action                                                                  |
| Capture                      | `⌘K`                         | pull-down from top / FAB (FAB stays in working mode as a quiet ghost — the focus-protector exception) |
| Switch task                  | `S`                          | swipe-left-and-hold / "next" affordance                                                               |
| Switch Lens                  | `⌘L`                         | tap lens chip / segmented control                                                                     |
| Peek past / future           | `←` / `→`                    | swipe from left/right screen edge                                                                     |
| Cancel / exit                | `Esc`                        | tap outside / back gesture                                                                            |

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

| File                                         | What it demonstrates                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/mockups/focus-f-final.html`            | Legacy Variant F prototype (2026-07-05). Superseded by the centered countdown and inline completion-reflection revisions documented above.                       |
| `docs/mockups/focus-redesign.html`           | Comparison canvas of all six focus redesign variants (A–F).                                                                                                      |
| `docs/mockups/mode-zoom-unified.html`        | Pre-Variant-F spine prototype (Mode × Zoom, breathing halo). **Superseded** by `focus-f-final.html` for the focus surface; still illustrative for the zoom dial. |
| `docs/mockups/approach-a-zoom-pan.html`      | Pure zoom exploration (A).                                                                                                                                       |
| `docs/mockups/approach-b-focus-blur.html`    | Focus/blur exploration (B).                                                                                                                                      |
| `docs/mockups/approach-c-time-adaptive.html` | Time-adaptive exploration (C) — the mode dial origin.                                                                                                            |

---

## 8. Open questions

1. **Should Working mode have a "pause reason"?** **RESOLVED (lean: no)** —
   silent pause, optional note. Don't interrogate. The completion note
   (Variant F) is the place for reflection, not the pause.
2. **Switch during working?** **RESOLVED 2026-07-05 (lean: yes)** — Variant F's
   inline completion reflection covers the related completion checkpoint.
   Mid-task switch keeps its separate confirmation behavior.
3. **Visual/selection mode** (VIM-style multi-select for bulk triage)? Phase 2.
4. **Mobile long-press vs swipe-up for entering work?** Long-press is shipped.

---

## 9. Overlay patterns (merged from `modal-approach.md` 2026-07-05)

The app uses **four overlay patterns**. Each has a specific job. Don't mix them.

| #   | Pattern                 | When                                | Dismissal                     |
| --- | ----------------------- | ----------------------------------- | ----------------------------- |
| 01  | **Full-screen overlay** | Immersive flows that own the screen | Esc / explicit close          |
| 02  | **Capture popover**     | Quick input, never blocks flow      | Esc / backdrop click / submit |
| 03  | **Bottom sheet**        | Mobile-first actions, thumb zone    | Esc / swipe down / backdrop   |
| 04  | **Confirm dialog**      | Destructive / irreversible (rare)   | Explicit choice only          |

All four share the same **shell mechanics** (backdrop, focus, scroll-lock,
motion) — see §9.5.

### 9.1 Full-screen overlay

Takes over the entire viewport. No app chrome visible behind it. Used when the
user has committed to a focused flow.

**Used by:**

- **Triage** — the per-item co-author wizard (`/app/inbox/review`)
- **Focus** — single-task do-only view (`/app/focus`, Variant F)
- **Onboarding coach** — walkthrough (`mobile-coach.html`)

**Anatomy:** top row (close button + progress when sequential) · center (the
primary content) · bottom (action cluster when applicable).

**Dismissal:** Esc or explicit close. Backdrop is opaque — the underlying app
state is irrelevant to the flow.

**Motion:** content rises in (`translateY(10px) → 0`, 500ms,
`--aa-ease-out-quart`). Exit reverses at ~60% duration.

### 9.2 Capture popover

Centered card over a dimmed backdrop. Lightweight — the user hasn't left their
context. Used for quick capture and inline edits.

**Used by:**

- **⌘K Capture** — the universal quick-add
- **Quick edit** — inline field edits that need room
- **Search / command palette** (shipped; desktop and touch browser-verified)

**Anatomy:** centered card (max-width 480px) · auto-focus input · footer with
submit hint (`⏎ to save`).

**Dismissal:** Esc, backdrop click, or submit. The backdrop click is
intentional — capture should never trap the user.

**Motion:** backdrop fades in 150ms; card scales 0.96 → 1 with
`--aa-ease-spring` for a confident arrival.

### 9.3 Bottom sheet

Mobile-first. Slides up from the bottom edge, anchored in the thumb zone. Used
for action menus and the "Not now" snooze flow.

**Used by:**

- **"Not now" snooze** — 1h / 3h / tomorrow / weekend / Someday
- **Action menus** — row-level actions on tasks/projects
- **Filter / sort** — list controls
- **Project / Goal pickers** — long lists benefit from numbered rows

**Anatomy:** anchored to bottom (full-width mobile, max-width 480px desktop) ·
top grabber handle · large tap targets (≥44px) · dimmed backdrop above.

**Dismissal:** Esc, swipe down (drag handle past 25% height), or backdrop click.

**Motion:** slides up `translateY(100%) → 0`, 300ms, `--aa-ease-out-quart`.
Drag tracks finger 1:1 during gesture; release commits or cancels.

### 9.4 Confirm dialog

Small centered card. **Rare** — only for irreversible destruction. The user
must make an explicit choice; backdrop click does NOT dismiss.

**Used by:**

- **Delete account** (Settings)
- **Discard unsaved changes**
- **Permanently delete** (from Logbook trash)

**Anatomy:** small card (max-width 400px) · clear title stating the action ·
body explaining the consequence · two buttons (destructive rose
`Button variant="danger"`, cancel `Button variant="secondary"`).

**Dismissal:** only via the buttons. Backdrop click is inert. Esc maps to Cancel.

**Motion:** same as capture popover but without the spring — a flat fade +
slight scale, so it feels serious, not playful.

### 9.5 Shared shell mechanics

All four overlays share these behaviors. The shared overlay component encodes
them once.

**Backdrop**

- Color: `oklch(0.2 0.02 230 / 0.4)` — cool-tinted dim, never pure black.
- Click dismisses **non-blocking** overlays (capture, bottom sheet). Inert for
  **blocking** overlays (confirm).

**Focus management**

- On open: focus moves to the overlay's first interactive element.
- While open: focus is **trapped** inside (Tab cycles within the overlay).
- On close: focus returns to the element that opened it.

**Scroll lock**

- `body { overflow: hidden }` while any overlay is open. Prevents background
  scroll bleed-through.

**Keyboard**

- **Esc** closes every overlay (maps to Cancel for confirm dialogs).
- **Tab / Shift+Tab** cycle focus within the overlay.
- Overlay-specific shortcuts are scoped — only active while that overlay is open.

**Motion**

| Phase          | Property         | Duration      | Easing                                        |
| -------------- | ---------------- | ------------- | --------------------------------------------- |
| Backdrop enter | opacity 0 → 1    | 150ms         | `--aa-ease-out`                               |
| Content enter  | translateY/scale | 250–500ms     | `--aa-ease-out-quart` (or spring for capture) |
| Exit (both)    | reverse          | ~60% of enter | `--aa-ease-out`                               |

All motion respects `prefers-reduced-motion: reduce` (snaps to final state, ~0ms).

**z-index scale**

| Layer                             | z-index |
| --------------------------------- | ------- |
| App content                       | 0       |
| Sidebar / floating shell controls | 10      |
| Capture popover                   | 40      |
| Bottom sheet                      | 40      |
| Confirm dialog                    | 100     |
| Full-screen overlay               | 100     |
| Toast / coach mark                | 1000    |

Higher = more blocking. Confirm and full-screen share the top app layer; toasts
and coach marks float above everything.

### 9.6 Decision guide

> "I need to show the user something over the current view."

1. **Is it a destructive/irreversible action?** → Confirm dialog (9.4)
2. **Is it an immersive flow they've committed to?** → Full-screen overlay (9.1)
3. **Is it quick input that shouldn't block?** → Capture popover (9.2)
4. **Is it a mobile action menu?** → Bottom sheet (9.3)

If none of these fit, it probably isn't an overlay — it's a page, a row
expansion, or inline UI. Default to inline; reach for an overlay only when the
content genuinely needs to take focus.
