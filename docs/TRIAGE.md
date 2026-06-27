# ActionAmp — Triage

> Status: CANONICAL — 2026-06-22 (keymap); 2026-06-23 (structural cross-ref).
> Authority for: the triage loop, the co-author UI, the keyset.
> **Structural authority (where triage sits in the app) has moved to
> `WORKFLOW.md` §2.2** (2026-06-23). This doc remains canonical for the triage
> keymap and the co-author UI mechanics; it cross-references WORKFLOW.md for
> area/mode placement.
>
> Sources: `DATA-MODEL.md` §3, `FEATURES.md` §2 (F6/F7), `INTERACTION.md` §3
> (TRIAGE mode), `mockups/triage-coauthor.html` (canonical layout),
> `webapp/src/app/InboxTriagePage.tsx` (current impl).
>
> **Decisions locked 2026-06-22:** `⌘/` invokes capture (primary) ·
> `⌘K` kept as silent alias for capture · `?` and `⌘?` toggle the shortcut
> cheatsheet (same physical key as capture: `?` = Shift+`/`) ·
> `[`/`]` = size down/up · `-`/`=` = priority down/up. See §7.2, §7.6.
>
> **Decisions locked 2026-06-23** (see `WORKFLOW.md` §5):
>
> - Triage inherits the active lens (no force-choice).
> - Triage never auto-clutters Work — the default Task outcome is Upcoming
>   (the bench); committing to Today is explicit. Demoting to Someday is, too.

---

## 1. What triage is

Capture dumps raw thoughts into the Inbox. **Triage is the GTD "clarify" step:**
walk the inbox one item at a time and decide what each thing *becomes*. It is
the only screen in the app that looks list-y, and it's deliberately a temporary
staging area, not a home.

The model (DATA-MODEL.md §3): every `InboxItem` is **polymorphic at rest,
concrete after triage.** Triage transforms it into a Task / Project / Resource
and **deletes the original InboxItem** — the transformed entity *is* the record.

> Triage is **co-authoring the spec**, not just dispatching. The card shows the
> raw text + NL-parsed editable properties; the user confirms/edits what the
> thing becomes. (Decision, 2026-06-16. See `BACKLOG.md`.)

---

## 2. The loop

```
  Entry:  click Inbox count · press I (from Normal) · navigate to /app/inbox/review
          ─────────────────────────────────────────────────────────────
   Per item:
     ┌─────────────────────────────────────────────┐
     │  [3 of 7]  ━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░  │  progress
     │                                              │
     │  What is this?                               │
     │  ┌──────────────────────────────────────┐   │
     │  │ Email Sarah re: Q3 invoice tomorrow  │   │  ← title (editable inline)
     │  │ captured 14 min ago                  │   │
     │  │ becomes: [Task] [Project] [Resource] │   │  ← type picker
     │  │                                       │   │
     │  │  WHEN    Tomorrow           ▾        │   │  ← vertical spec list
     │  │  SIZE    M                  ▾        │   │     (tap a row to expand)
     │  │  PRIORITY Normal            ▾        │   │
     │  │  PROJECT  General           ▾        │   │
     │  │                                       │   │
     │  │  → Tomorrow · M · Normal · General   │   │  ← confirm summary (plain English)
     │  │                            [ Confirm ]│   │
     │  └──────────────────────────────────────┘   │
     │                                              │
     │  ← prev   type: Task · Project · Resource · Archive →  │  ← wizard steps
     │           (Context → Type → Spec → Complete)           │
     └─────────────────────────────────────────────────────────┘
          ↓ (exit animation encodes the decision →/←/↑/↓)
   Next item appears.
          ─────────────────────────────────────────────────────────────
  Exit:   Esc · Q · empty inbox → "Inbox zero. Go do something."
```

Built in `webapp/src/inbox/TriagePage.tsx`. Card component:
`components/ui/TriageCard.tsx`. Transform action:
`inbox/operations.ts :: triageInboxItem`.

---

## 3. The five outcomes

What an InboxItem can become (DATA-MODEL.md §3). One input shape, five outputs.

| Decision | Result | Example |
|---|---|---|
| quick action | **Task** (standalone, dated) | "Email Sarah" → Today |
| big outcome | **Project** (text becomes the Project name) | "Plan Q3 launch" → new Project |
| step in existing work | **Task** inside an existing **Project** | "Draft press release" → "Q3 launch" |
| reference, not action | **Resource** (link/note) under a **Project or Goal** | "Competitor PDF" → "Q3 launch" |
| supports a bigger goal | **Task/Project** linked to a **Goal** | "Write blog" → Goal: "Grow audience" |
| I will not do now | **Archive** — the note is kept (status=ARCHIVED), not deleted | "Maybe later idea" → Logbook |

> **Archive is lossless (decided 2026-06-25).** The old "Trash" decision deleted
> the InboxItem outright — but people are reluctant to lose a note for declining
> to act on it, and capture should never be punishing. Archive instead marks the
> item `ARCHIVED` + stamps `archivedAt`; it leaves the inbox (which filters
> `UNPROCESSED`) and surfaces in the **Logbook's Archived section**, where a
> Restore action returns it to the inbox for re-triage. The Logbook is the
> catch-all record of things no longer active: completed tasks, past projects,
> and archived notes alike.

**Promotion paths** (an item isn't locked in): Task→Project (the XL nudge),
Resource→Task, Task→Resource, Task→Someday, Archive→Inbox (via Restore).

---

## 4. The co-author UI (the canonical pattern) — BUILT

From `mockups/triage-coauthor.html`. This same pattern is reused in the
expanded capture editor (`mockups/capture-palette.html`) — capture and triage
are **one surface at different commitment levels.**

> **Status 2026-06-25:** the co-author spec list is now built. Triage is a
> deliberate **per-item wizard**, not a one-key dispatch. The single-card
> dispatch buttons (Task/Today/File-in/Resource/Trash) are gone; every item is
> specified through the steps below and committed with a final **Complete**.
> See `webapp/src/inbox/TriagePage.tsx`.

The wizard (per item):

1. **Context (Lens)** — a radio, pre-filled with the active lens. The user
   must **Continue** to ratify it. *(Reverses WORKFLOW.md §5.5's inherit-active
   default — triage now asks, explicitly. The active lens is still the
   pre-selection, so the common case is one Continue.)*
2. **Type** — what does this become? **Task** (default) · **Project** ·
   **Resource** (a Note) · **Archive** (lossless — kept, recoverable). *Goal is
   not a type-chooser outcome* — goals are filed *into*, never created at
   triage (§9.3).
3. **Spec** — the property rows, per type (see table below).
4. **Complete** — commits the spec; gated until the lens is confirmed and
   (for Task/Resource) a filing target is set.

The spec rows are **inline-expanding**: tap a row → the options expand beneath
it (no floating popover, no separate sheet — *except* Project/Goal/Parent,
which open the existing bottom-sheet picker because the list can be long and
benefits from numbered rows). Value tinting: teal = When/Today, amber =
Important/XL, violet = Project/Goal, gray = default.

- **Title row** — the raw captured text (editable inline in the mockup; in the
  built wizard it's read-only on the card for now).
- **Confirm summary** — reads back the commitment in plain English:
  `→ Tomorrow · M · Normal · General`. No metadata-chip soup.
- **Undo toast** — 4s window after dispatch *(still spec'd, not yet built)*.

**Spec rows per type:**

| Type | Rows |
|---|---|
| Task | When · Size · Priority · Project (file into) · Goal (link) |
| Project | Goal (supports, optional) · Due |
| Resource (Note) | Parent (Project/Goal) · Kind (Link/Note) |

> "Goal" appears as a **spec row** (link an existing goal) on Task and Project,
> not as a type the item can *become*. Triage never creates a Goal.

---

## 5. Defaults (never auto-Today)

Locked 2026-06-16 (DATA-MODEL.md §8), revised 2026-06-25 (When default). The
inbox is a staging area, not a commitment. **Triaging never auto-clutters
Today** — the user must actively promote a task to Today.

| Property | Default | Notes |
|---|---|---|
| When | **Upcoming** | actionable, lands on the bench — never Today by default. Demote to Someday explicitly. |
| Size | **M** | |
| Priority | **Normal** | |
| Project | **General** (= no `projectId`) | scoped per Lens, not global |
| Goal | none | |
| Lens | the active Lens | every entity requires one |

Parser pre-fills any token the user typed at capture (`tomorrow`, `!3`, `~XL`,
`#ship`) — defaults only fill the gaps.

---

## 6. Platform scope

Mobile and desktop split by **job**, not by feature-count.

**Mobile = capture-first.** You're on the move; the only job is *get the
thought out of your head*. The bottom sheet (FAB or pull-down) does that in
tap + type + send. Priority and project assignment are *available* but never
required, never in the way. **No triage walkthrough, no expanded editor, no
command state on mobile.** Capture lands in the Inbox; triage happens later,
on desktop.

**The capture field grows, never scrolls sideways.** LOCKED 2026-06-22 —
same element on every platform: starts as one line, wraps to a second on
overflow, grows up to ~4 lines, then scrolls internally. Endless horizontal
lines are hostile on mobile and ugly on desktop. One textarea, two contexts.

**Desktop = context-aware, not complex.** A keyboard and more time let us
offer more — rapid-fire capture, Shift+Enter expanded editor, `/` command
state, the co-author spec list, the full keyset. But the UI stays calm
(PRODUCT.md: whitespace is the point). "More sophisticated" = *the context
lets us offer more*, never *the surface is heavier*.

| Surface | Mobile | Desktop |
|---|---|---|
| Capture | Bottom sheet (FAB / pull-down). Text + optional chips. | Full palette: rapid-fire, Shift+Expand, `/` commands |
| Property editing | Inline chips only (tap to remove). No spec list. | Co-author spec list (triage + expanded capture) |
| Triage | Not surfaced — do it on desktop. | Full walkthrough (§2) |
| Keyboard shortcuts | n/a (no keyboard) | Full keyset (§7) |
| Defaults | Identical — Upcoming / M / Normal / General (§5) | Identical |

The defaults don't change by platform. Mobile just doesn't surface the levers
(beyond what NL parsing catches at capture time).

---

## 7. Keyboard map (canonical — all modes, reconciled)

> **Design principle.** The app is modal (INTERACTION.md §1). Bare keys belong
> to the active mode; property editing happens in contexts where you're *not*
> typing, so bare keys are free there. Capture's NL sigils (`!` `~` `#`) cover
> the *while-typing* case; the shortcuts below cover *not-typing*.

### 7.1 Why not `⌘S` / `⌘L` / `⌘P`

Browser/OS conflicts make `⌘<letter>` a minefield:

| Proposed | Claimed by |
|---|---|
| `⌘S` | Save Page |
| `⌘L` | Focus address bar (Chrome/FF/Safari) |
| `⌘P` | **Print** (hardest to override) |
| `⌘D` | Bookmark — *already used for theme toggle in the app* (latent conflict) |

Every common `⌘<letter>` is taken. The only modifier browsers leave alone is
`⌥` (Option/Alt). We don't need it — bare keys are better (see below).

### 7.2 Global (work in every mode, even while typing)

**`⌘/` to open capture is LOCKED 2026-06-22** (primary invoke).
**`⌘K` stays as a silent alias** — locked 2026-06-22, zero-cost, preserves
muscle memory.
**`⌘?` (Cmd+Shift+/) toggles the cheatsheet** — locked 2026-06-22, paired
with bare `?`. Mnemonic: capture (`⌘/`) and help (`⌘?`) share the same
physical key — `?` is Shift+`/`.

| Key | Action | Notes |
|---|---|---|
| `⌘/` | **Open capture palette** | LOCKED primary invoke |
| `⌘K` | Open capture (silent alias) | LOCKED — keep for muscle memory |
| `Esc` | Close topmost overlay / return to Normal | always works |
| `?` · `⌘?` | Toggle shortcut cheatsheet | LOCKED — `⌘?` = Cmd+Shift+/ (same key as `⌘/`) | |
| `Space` | Go to What Now (home) | suppressed on buttons |

### 7.3 Normal mode (browsing)

| Key | Action |
|---|---|
| `1` `2` `3` | Plan / Do / Review (mode) |
| `Z` / `X` | Zoom out / in (scope: Task ↔ Project ↔ Goal) |
| `L` | Cycle Lens (Work / Me) |
| `I` | Enter Triage (if inbox non-empty) |
| `S` | Switch task (opens confirm) |
| `←` / `→` | Peek past / future |
| `Enter` | Start working (when a task is focused) |

### 7.4 Triage mode

**Dispatch (what it becomes):**

| Key | Action |
|---|---|
| `1` | Task · **Today** |
| `2` | Task · Upcoming |
| `3` | Task · Someday |
| `T` | Cycle type: Task → Project → Resource |
| `P` | Becomes Project (direct) |
| `R` | Becomes Resource (opens parent picker) |
| `G` | Assign/link Goal |
| `Del` / `Backspace` | Archive (lossless — kept, recoverable from the Logbook) |

**Navigation:**

| Key | Action |
|---|---|
| `←` / `→` | Previous / next Inbox item |
| `Esc` / `Q` | Done triaging |

**Property adjust (the new scheme — §7.6):**

| Key | Action |
|---|---|
| `[` / `]` | Size down / up |
| `-` / `=` | Priority down / up |
| `H` | Set When (cycles Today → Upcoming → Someday) |

### 7.5 Capture mode

**`⌘Enter` to close is LOCKED 2026-06-22.** It's the escape hatch that makes
rapid-fire (`Enter` = capture + keep open) safe — you never get trapped in
the loop. Standard "commit and send" pattern (Slack, email).

| Key | Action |
|---|---|
| `⌘/` · `⌘K` · click | Open |
| `Enter` | Capture + keep open (rapid-fire) — clears input, stacks "✓ captured" |
| `⌘Enter` | **Capture + close** (the "done capturing" key) |
| `Shift+Enter` | Expand to full co-author editor (desktop) |
| `/` (first keystroke) | Command prefix — `/daily review`, `/focus`, `/switch Work` *(Phase 2)* |
| `Esc` | Close without saving |
| *(while typing)* | NL sigils: `#` link project/goal · `@` context tag · `!` priority · `~` size · date words |
| *(expanded, not typing)* | `[` `]` size · `-` `=` priority (same as triage) |

**First-class properties in capture: `#` (project/goal) and `@` (context).**
Priority (`!`) and size (`~`) are still parsed but are expanded-editor
territory, not the quick-capture essentials. Choosing *where this goes* beats
choosing *how urgent/big it is* — that's triage's job. Locked 2026-06-22.

### 7.6 Property keys — size & priority

**LOCKED 2026-06-22.** These work whenever a task/card/chip is focused **and
you're not in a text field** — i.e. triage, expanded-capture editor, task
selected in a list.

| Key | Action | Mnemonic |
|---|---|---|
| `[` | size smaller (XL→L→M→S) | brackets enclose *less* |
| `]` | size larger (S→M→L→XL) | brackets enclose *more* |
| `-` | priority lower (Important→Normal→Low) | minus = less |
| `=` | priority higher (Low→Normal→Important) | plus = more |

Chosen over `⌘S`/`⌘L`/`⌘P` (§7.1): zero browser conflicts, no chord (faster),
symmetric (both directions, not an overshootable cycle), identical across
triage + expanded capture + task lists. Mirrors the *while-typing* language —
`!`/`~` in text, `[`/`]`/`-`/`=` out of text.

### 7.7 Working mode (intentionally tiny)

| Key | Action |
|---|---|
| `Esc` / `Space` | Pause |
| `D` | Done |
| `⌘/` | Capture (the one exception — focus-protector) |

That's it. Zoom, mode-switch, lens — all suppressed. The world is this task.

---

## 8. What's built vs. unbuilt

**Built** (`webapp/src/`):

- ✅ Inbox list + triage walkthrough (`inbox/TriagePage.tsx`)
- ✅ Triage card (`components/ui/TriageCard.tsx`)
- ✅ **Co-author spec list in triage** — DONE 2026-06-25. Triage is now a
  deliberate per-item wizard (lens → type → spec → Complete), with
  inline-expanding property rows ported from `triage-coauthor.html`. Priority
  and Size set in the spec step are carried to the created task (they override
  any parsed capture token — see `inbox/operations.ts :: triageInboxItem`).
- ✅ Type dispatch (Task/Project/Resource/Archive) + exit animations
- ✅ Resource/Note parent picker (file under a Project or Goal)
- ✅ Transform action (`inbox/operations.ts :: triageInboxItem`)
- ✅ Global `⌘K` / `/` capture (to be rebased to `⌘/`)

**Unbuilt (gap vs. this doc):**

- ❌ Property keys `[` `]` `-` `=` (§7.6) — the wizard uses tap-to-expand rows
  instead, but the keyset is still spec'd for power users.
- ❌ `H` (set When), `T` (cycle type), `G` (assign Goal) as triage shortcuts
  (the wizard replaces one-key dispatch; these may resurface as step shortcuts).
- ❌ `⌘/` rebind (currently `⌘K`/`/`)
- ❌ `I` (enter triage from Normal)
- ❌ Undo toast (4s window) — spec'd, not in code
- ❌ Mode indicator `— TRIAGE —` (bottom-left, VIM-style)
- ❌ Inline title edit on the triage card (the wizard shows the text read-only;
  the contenteditable affordance from the mockup isn't ported yet)

---

## 9. Open questions

All shortcut decisions are locked. Remaining questions are product/UX, not
keyset:

1. **Inline title edit + dispatch conflict.** The mockup makes the title
   `contenteditable`; pressing `1/2/3/P/R` while editing the title would both
   type *and* dispatch. Decided in mockup: Enter commits the edit (blurs),
   dispatch keys only fire when title isn't focused. **Confirm before porting.**
2. **Resource filing UX.** Resource requires a parent (Project/Goal). Currently
   opens a separate picker sheet. Should the parent just be a spec row inline
   like everything else? *(Lean: yes — one surface.)*
3. **Goal assignment during triage** — free-text pick vs. must-already-exist.
   Goals are first-class; do we allow "create Goal on the fly" from triage?
   *(Lean: no — Goals are deliberate. Capture-as-new-goal feels too cheap.)*
4. **Bulk triage (F7).** Spec'd as Phase 2. Keep parked?
