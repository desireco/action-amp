# ActionAmp — Triage

> Status: CANONICAL — 2026-06-22
> Authority for: the triage loop, the co-author UI, the keyset.
> Sources: `DATA-MODEL.md` §3, `FEATURES.md` §2 (F6/F7), `INTERACTION.md` §3
> (TRIAGE mode), `mockups/triage-coauthor.html` (canonical layout),
> `webapp/src/app/InboxTriagePage.tsx` (current impl).
>
> **Decisions locked 2026-06-22:** `⌘/` invokes capture (primary) ·
> `⌘K` kept as silent alias for capture · `?` and `⌘?` toggle the shortcut
> cheatsheet (same physical key as capture: `?` = Shift+`/`) ·
> `[`/`]` = size down/up · `-`/`=` = priority down/up. See §7.2, §7.6.

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
     │  ← prev   1 Today  2 Upcoming  3 Someday →   │  ← dispatch keys
     │           P Project  R Resource  Del trash   │
     └─────────────────────────────────────────────┘
          ↓ (exit animation encodes the decision →/←/↑/↓)
   Next item appears.
          ─────────────────────────────────────────────────────────────
  Exit:   Esc · Q · empty inbox → "Inbox zero. Go do something."
```

Built in `webapp/src/app/InboxTriagePage.tsx`. Card component:
`components/ui/TriageCard.tsx`. Dispatch buttons: `DispatchButton.tsx`.
Transform action: `inbox/operations.ts :: triageInboxItem`.

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
| (discard) | **Trash** | — |

**Promotion paths** (an item isn't locked in): Task→Project (the XL nudge),
Resource→Task, Task→Resource, Task→Someday, anything→Trash/Archive.

---

## 4. The co-author UI (the canonical pattern)

From `mockups/triage-coauthor.html`. This same pattern is reused in the
expanded capture editor (`mockups/capture-palette.html`) — capture and triage
are **one surface at different commitment levels.**

- **Title row** — the raw captured text, `contenteditable`, persists on blur.
- **Type picker** — three buttons: Task / Project / Resource. Selecting swaps
  which spec rows show below.
- **Vertical spec list** — each row = one property (WHEN / SIZE / PRIORITY /
  PROJECT / GOAL). Tap to expand options *inline* (no floating popover).
  Value tinting: teal = When, amber = Important/XL, violet = Project/Goal,
  gray = default.
- **Confirm summary** — reads back the commitment in plain English:
  `→ Tomorrow · M · Normal · General`. No metadata-chip soup.
- **Undo toast** — 4s window after dispatch.

**Spec rows per type:**

| Type | Rows |
|---|---|
| Task | When · Size · Priority · Project · Goal |
| Project | Goal · Due |
| Resource | Parent (Project/Goal) · Kind (Link/Note) |

---

## 5. Defaults (never auto-Today)

Locked 2026-06-16 (DATA-MODEL.md §8). The inbox is a staging area, not a
commitment. **Triaging never auto-clutters Today** — the user must actively
promote a task to Today.

| Property | Default | Notes |
|---|---|---|
| When | **Someday** | never Today by default |
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
| Defaults | Identical — Someday / M / Normal / General (§5) | Identical |

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
| `Del` / `Backspace` | Trash |

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

- ✅ Inbox list + triage walkthrough (`app/InboxTriagePage.tsx`)
- ✅ Triage card + dispatch buttons (`components/ui/TriageCard.tsx`, `DispatchButton.tsx`)
- ✅ Type dispatch (1/2/3/P/R/Del) + exit animations
- ✅ Resource parent picker (`ResourcePickerSheet`)
- ✅ Transform action (`inbox/operations.ts :: triageInboxItem`)
- ✅ Global `⌘K` / `/` capture (to be rebased to `⌘/`)

**Unbuilt (gap vs. this doc):**

- ❌ **Co-author spec list in triage** — current triage dispatches *directly*;
  it does NOT show the vertical property editor. The mockup has it, the code
  doesn't. **This is the biggest gap.** (`triage-coauthor.html` → port)
- ❌ Property keys `[` `]` `-` `=` (§7.6)
- ❌ `H` (set When), `T` (cycle type), `G` (assign Goal) as triage shortcuts
- ❌ `⌘/` rebind (currently `⌘K`/`/`)
- ❌ `I` (enter triage from Normal)
- ❌ Undo toast (4s window) — spec'd, not in code
- ❌ Mode indicator `— TRIAGE —` (bottom-left, VIM-style)

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
