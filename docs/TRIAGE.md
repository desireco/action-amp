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
> **Decisions locked 2026-06-30:** `⌘K` invokes capture · `?` and `⌘?`
> toggle the shortcut cheatsheet (`⌘?` = Cmd+Shift+`/`) ·
> `[`/`]` = size down/up · `-`/`=` = priority down/up. See §7.2, §7.6.
>
> **Decision revised 2026-07-04** (see `WORKFLOW.md` §5.5):
>
> - Triage begins with **Classify**, a combined Type + Destination step.
> - Lens is selected or inferred in Classify, not on a separate Context step.
> - A concrete Project destination supplies both Project and Lens, so the
>   standalone lens choice is skipped by default while the destination remains
>   visible and reversible.
> - Triage never auto-clutters Work — the default Task outcome is Upcoming
>   (the bench); committing to Today is explicit. Demoting to Someday is, too.
> - Triage accepts both Lens types. `SIMPLE_LIST` is a one-step List Item
>   destination; direct add inside the list remains available.

---

## 1. What triage is

Universal Capture dumps raw thoughts into the Inbox. **Triage is the GTD
"clarify" step:**
walk the inbox one item at a time and decide what each thing *becomes*. It is
the only screen in the app that looks list-y, and it's deliberately a temporary
staging area, not a home.

The model (DATA-MODEL.md §3): every `InboxItem` is **polymorphic at rest,
concrete after triage.** Triage transforms it into a Task / Project / Resource / List Item
and **deletes the original InboxItem** — the transformed entity *is* the record.

> Triage is **co-authoring the spec**, not just dispatching. The card shows the
> raw text + NL-parsed editable properties; the user confirms/edits what the
> thing becomes. (Decision, 2026-06-16.)

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
     │  ← prev   classify: Task · Work · MVP →                │  ← wizard steps
     │           (Classify → Spec → Ready)                    │
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

## 3. Triage outcomes

What an InboxItem can become (DATA-MODEL.md §3). One input shape, five outputs.

| Decision | Result | Example |
|---|---|---|
| quick action | **Task** (standalone, dated) | "Email Sarah" → Today |
| big outcome | **Project** (text becomes the Project name) | "Plan Q3 launch" → new Project |
| step in existing work | **Task** inside an existing **Project** | "Draft press release" → "Q3 launch" |
| reference, not action | **Resource** (link/note) under a **Project** | "Competitor PDF" → "Q3 launch" |
| supports a bigger goal | **Project** linked to a **Goal** | "Launch newsletter" → Goal: "Grow audience" |
| belongs on a flat checklist | **List Item** in a **Simple-list Lens** | "Buy oat milk" → Shopping |
| captured by mistake | **Delete** — the InboxItem is hard-removed, not recoverable | misheard voice capture, wrong lens, duplicate |

**Delete** (`4` in Classify) hard-removes the InboxItem and is not recoverable.
Use it for capture mistakes: misheard voice, wrong lens, or duplicate.

**Promotion paths** (an item isn't locked in): Task→Project (the XL nudge),
Resource→Task, Task→Resource, Task→Someday.

---

## 4. The co-author UI (the canonical pattern) — BUILT

From `mockups/triage-coauthor.html`. This same pattern is reused in the
expanded capture editor (`mockups/capture-palette.html`) — capture and triage
are **one surface at different commitment levels.**

> **Status 2026-06-25:** the co-author spec list is now built. Triage is a
> deliberate **per-item wizard**, not a one-key dispatch. The single-card
> dispatch buttons (Task/Today/File-in/Resource/Trash) are gone; every item is
> specified through the steps below and committed with a final **Ready**.
> See `webapp/src/inbox/TriagePage.tsx`.

The wizard (per item):

1. **Classify** — one surface for **what this becomes** and **where it lands**:
   Task / Project / Resource / Delete plus the selected Lens or resolved
   Project destination. Two inference paths
   (`docs/specs/done/capture-grammar.md`, locked 2026-07-04):
   - **`[[lens]]` token** (explicit): `[[work]]` / `[[personal]]` / `[[me]]` /
     `[[custom-name]]` resolves to a lens and pre-fills it. Seeded lenses match
     on `kind` (survives renames); custom lenses match on exact name. Unknown
     tokens stay literal text (no false positives on pasted wiki-links). A lens
     token still shows Lens choices so the user can change it.
   - **Project-resolved** (strong): if capture selected a Project or the
     resolver uniquely matches a Project in the cleaned text, that Project
     supplies both `projectId` and `lensId`. Classify shows
     `Destination: Project · Lens` and skips the standalone lens selection by
     default.
   The active lens remains the default when there is no hint. User-defined
   lenses appear for Pro. At ≥4 lenses the lens control follows the same
   adaptive pattern as the sidebar switcher (chip + popover); at ≤3 it's
   today's radio.
2. **Spec** — the property rows, per type (see table below).
3. **Ready** — commits the spec; gated until the destination is valid and
   (for Task/Resource) a filing target is set.

When Classify selects a `SIMPLE_LIST` Lens, Lens type resolves what the item
becomes. Classify switches to a compact List Item confirmation with editable
text and **Add to list**; Spec and Ready are skipped. No task metadata appears.
Body text and source URL preserve automatically. An image-backed capture cannot
be represented by a checklist row, so dispatch is rejected without deleting
the InboxItem.

The spec rows are **inline-expanding**: tap a row → the options expand beneath
it (no floating popover, no separate sheet — *except* Project/Goal/Parent,
which open the existing bottom-sheet picker because the list can be long and
benefits from numbered rows). Value tinting: teal = When/Today, amber =
Important/XL, violet = Project/Goal, gray = default.

- **Title row** — the raw captured text stays read-only during Classify, then
  becomes editable inline during Spec. `Enter` inserts text/newlines while
  focused; triage shortcuts resume on blur.
- **Confirm summary** — reads back the commitment in plain English:
  `→ Tomorrow · M · Normal · General`. No metadata-chip soup.
- **Undo toast** — 4s window after dispatch *(still spec'd, not yet built)*.

**Spec rows per type:**

| Type | Rows |
|---|---|
| Task | When · Size · Priority · Project (file into) |
| Project | Goal (supports, optional) · Due |
| Resource (Note) | Project · Kind (Link/Note) |

> "Goal" appears as a **spec row** only on Project (supports an existing goal),
> not on Task. Projects make goals happen; tasks happen inside projects or
> standalone. Triage never creates a Goal.

---

## 5. Defaults (never auto-Today)

Locked 2026-06-16 (DATA-MODEL.md §8), revised 2026-06-25 (When default). The
inbox is a staging area, not a commitment. **Triaging never auto-clutters
Today** — the user must actively promote a task to Today.

| Property | Default | Notes |
|---|---|---|
| When | **Upcoming** | actionable, lands on the bench — never Today by default. Demote to Someday explicitly. The one exception: an explicit `today`/`tonight` capture token pre-fills Today (it's user intent, not a default). |
| Size | **M** | |
| Priority | **Normal** | |
| Project | **General** (= no `projectId`) | scoped per Lens, not global. A `#project` capture token links if a project by that name exists in the chosen Lens; otherwise General (no auto-create). |
| Goal | none | Tasks do not align directly to goals; projects can support goals. |
| Lens | the active Lens | Life areas expose structured outcomes; Simple-list Lenses expose only List Item |

Parser pre-fills any token the user typed at capture (`tomorrow`, `!3`, `~XL`,
`#deep-work`, `[[work]]`) — defaults only fill the gaps. A `[[lens]]` token
resolves only to a Life-area Lens. `#` is a tag, `@` is
time only, `[[lens]]` is the explicit lens override (§7.5). Project intent is
resolver-driven from free text — a matched project name carries its lens into
this step. `[[ ]]` precedence beats project-inferred lens when they disagree.

---

## 6. Platform scope

Mobile and desktop split by **job**, not by feature-count.

**Mobile in a Life-area Lens = capture-first.** You're on the move; the job is *get the
thought out of your head*. The bottom sheet (FAB or pull-down) does that in
tap + type + send. Priority and project assignment are *available* but never
required, never in the way. **No triage walkthrough, no expanded editor, no
command state on mobile.** Capture lands in the Inbox; triage happens later,
on desktop.

In a Simple-list Lens, mobile keeps direct add and checkboxes while also keeping
Capture and Inbox available. Captured items wait for triage like every other
Inbox item; assigning one to the active list uses the compact List Item path.

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

**`⌘K` to open capture is LOCKED 2026-06-30** (single invoke).
**`⌘/` is not a capture shortcut** — retired 2026-06-30 so Capture has one
clear chord and `/`-family shortcuts stay available for browser/help behavior.
**`⌘?` (Cmd+Shift+/) toggles the cheatsheet** — locked 2026-06-22, paired
with bare `?`.

| Key | Action | Notes |
|---|---|---|
| `⌘K` | **Open capture palette** | LOCKED primary invoke |
| `Esc` | Close topmost overlay / return to Normal | always works |
| `?` · `⌘?` | Toggle shortcut cheatsheet | LOCKED — `⌘?` = Cmd+Shift+/ | |
| `Space` | Go to Next (home) | suppressed on buttons |

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

Triage is step-aware. The first step is **Classify**: choose what the inbox item
becomes and where it lands.

**Classify:**

| Key | Action |
|---|---|
| `1` | Type = Task |
| `2` | Type = Project |
| `3` | Type = Resource / Note |
| `4` | Type = Delete (hard-removes the InboxItem — not recoverable) |
| `/` | Open the full Lens picker when there are more choices |
| `Enter` | Continue to Spec, or dispatch immediately when Delete is selected |

> **Lens selection UI (built 2026-07-05).** Lens renders as **large styled
> pills**, not positional `A/S/D/F` slots — that keymap was retired. Type
> chooser renders as **one-line rows with a leading icon**. Both pickers share
> the `PropertyChips` editor used on the task page, so property-key shortcuts
> (`[` `]` `-` `=`) work uniformly across triage and task editing. Goal meta +
> lens pill appear on all pickers.

When Classify has a concrete Project destination, it shows
`Destination: Project · Lens` and hides the standalone lens choices by default.
The destination can still be changed from Spec.

**Spec:**

| Key | Action |
|---|---|
| `[` / `]` | Size down / up |
| `-` / `=` | Priority down / up |
| `H` | Set When (cycles Today → Upcoming → Someday) |
| `G` | Assign/link Goal for Project specs |

**Navigation:**

| Key | Action |
|---|---|
| `←` / `→` | Previous / next Inbox item |
| `Esc` | From Spec, return to Classify; from Classify, leave triage |
| `Q` | Done triaging |

### 7.5 Capture mode

**`Enter` to capture + close, `⌘Enter` to add another — REVERSED 2026-06-30.**
The single capture is the common case (one thing on your mind → commit and get
back to work), so it gets the unmodified key. Adding to the list (rapid-fire)
is the modifier case. *(Previously locked 2026-06-22 the other way around —
`⌘Enter` to close, `Enter` to keep open — on the "commit and send" / Slack
analogy. Reversed because capture is usually a one-off, not a session.)*

| Key | Action |
|---|---|
| `⌘K` · click | Open |
| `Enter` | **Capture + close** (commit this one and get back to work) |
| `⌘Enter` | Capture + keep open (add to the list, rapid-fire) — clears input, stacks "✓ captured" |
| `Shift+Enter` | Expand to full co-author editor (desktop) |
| `/` (first keystroke) | Command prefix — `/daily review`, `/focus`, `/switch Work` *(Phase 2)* |
| `Esc` | Close without saving |
| *(while typing)* | NL sigils: first `#` project · later `#` tags · `@` time · `[[lens]]` lens override · `!` priority · `~` size · date words |
| *(expanded, not typing)* | `[` `]` size · `-` `=` priority (same as triage) |

**First-class properties in capture: `#` (project first, tags after), `@`
(time), `[[lens]]` (explicit lens override).** The first `#token` or `#[Project
Name]` is a project hint resolved at triage; any later `#tokens` become tags.
Priority (`!`) and size (`~`) are still parsed but are expanded-editor
territory, not the quick-capture essentials. Choosing *where this goes* beats
choosing *how urgent/big it is* — that's triage's job. **Locked 2026-07-04
(grammar v2 — supersedes the 2026-06-22 `#`/`@` decision).** The old `@` context
tag split is gone; `@` is time only, and lens intent lives in `[[ ]]` or project
inference. See `docs/specs/done/capture-grammar.md`.

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
| `⌘K` | Capture (the one exception — focus-protector) |

That's it. Zoom, mode-switch, lens — all suppressed. The world is this task.

---

## 8. What's built vs. unbuilt

**Built** (`webapp/src/`):

- ✅ Inbox list + triage walkthrough (`inbox/TriagePage.tsx`)
- ✅ Triage card (`components/ui/TriageCard.tsx`)
- ✅ **Co-author spec list in triage** — DONE 2026-06-25. **Classify step
  merged lens + type into one step 2026-07-04–05** (`Classify → Spec →
  Ready` per `docs/specs/done/triage-classify-step.md`): project-resolved items
  skip standalone lens selection by default; the lens pill and goal meta appear
  on all pickers; type chooser is one-line rows with a leading icon.
- ✅ **Property keys `[` `]` `-` `=`** (§7.6) — DONE 2026-07-05 via the shared
  `PropertyChips` editor (`components/ui/PropertyChips.tsx`), used across
  triage Spec + the task page. The property-key shortcuts work uniformly in
  both surfaces.
- ✅ Type dispatch (Task/Project/Resource/Delete) + exit animations
- ✅ Resource/Note project picker (file under a Project)
- ✅ Transform action (`inbox/operations.ts :: triageInboxItem`)
- ✅ Global `⌘K` capture

**Unbuilt (gap vs. this doc):**

- ❌ `H` (set When), `G` (assign Goal) as dedicated triage shortcuts — the
  shared chip editor uses picker popovers instead, but the keys are still
  spec'd for power users.
- ❌ `I` (enter triage from Normal)
- ❌ Undo toast (4s window) — spec'd, not in code
- ❌ Mode indicator `— TRIAGE —` (bottom-left, VIM-style)
- ✅ Inline title edit on the triage card (multiline field during Spec; edited
  text becomes the created Task / Project / Resource title)

---

## 9. Open questions

All shortcut decisions are locked. Remaining questions are product/UX, not
keyset:

1. **Inline title edit + dispatch conflict — resolved 2026-07-10.** The built
   title stays read-only during Classify and uses a multiline textarea during
   Spec. While focused, all triage shortcuts are suppressed and Enter remains
   text input; shortcuts resume on blur.
2. **Resource filing UX.** **RESOLVED 2026-07-05**: Resource parent is a spec
   row inline like everything else, sharing the `PropertyChips` editor. No
   separate picker sheet for the parent.
3. **Goal assignment during triage** — free-text pick vs. must-already-exist.
   Goals are first-class; do we allow "create Goal on the fly" from triage?
   *(Lean: no — Goals are deliberate. Capture-as-new-goal feels too cheap.)*
4. **Bulk triage (F7).** Spec'd as Phase 2. Keep parked?
