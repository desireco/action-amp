---
id: triage-classify-step
kind: spec
title: "Triage Classify step: merge context and type selection"
status: ready
priority: P1
feature: inbox-triage
spec_owner: discover
build_owner: build
created: 2026-07-04
---

# Spec: Triage Classify step

## Summary

Replace Triage's separate **Context** and **Type** wizard steps with one
keyboard-optimized **Classify** step. Classify lets the user confirm or change
both decisions at once: what the inbox item becomes, and which Lens it belongs
to. Inferred context remains visible and reversible, but the user no longer
pays a dedicated "Context → Continue" toll for obvious items.

The new triage flow is:

1. **Classify** — Type + Context together.
2. **Spec** — Type-specific property rows.
3. **Complete** — Commit the transformed entity.

This is a product/design change only. The build should update implementation
and canonical docs as described below.

## Why

Triage currently opens every item on a standalone Context step, even when the
answer is obvious from the active lens, an explicit `[[lens]]` token, or a
matched project. That was safer than silent filing, but it makes the first
interaction feel like a ratification tax.

Context and Type are both classification decisions. Putting them on one screen
preserves the deliberate "co-author the spec" model while removing a step from
the common path. The user can still see the inferred context, understand why it
was chosen, and change it before the item leaves the Inbox.

## Current Behavior

Canonical docs currently describe a four-stage wizard:

1. Context
2. Type
3. Spec
4. Complete

The implementation lives in `webapp/src/inbox/TriagePage.tsx` and models this
as:

- `type Step = "lens" | "type" | "spec"`
- `chosenLensId` for the confirmed lens
- `working.type` for `task | project | resource | archive`
- `Enter` advances step-by-step
- explicit `[[lens]]` and project-bridged inference pre-fill Context, but still
  require Continue

This spec intentionally changes that model.

## Target Behavior

### Flow Steps

The flow has two visible wizard steps plus the existing dispatch/advance
completion behavior:

| Step | Purpose | Commit behavior |
|---|---|---|
| Classify | Pick Type and Context together | `Enter` advances to Spec, or archives immediately when Type is Archive |
| Spec | Edit type-specific rows | `Enter` completes when valid |
| Complete | Existing completion/dispatch animation and next item advance | No separate visible screen required |

In code, `Step` should become:

```ts
type Step = "classify" | "spec";
```

Complete remains the dispatch action from the Spec step, not a new React step
unless the builder finds a strong reason to introduce one.

### Classify Screen

The screen should read as one decision surface:

```text
What is this?

Email Sarah about Q3 invoice tomorrow

Becomes
[1] Task        [2] Project       [3] Note        [Backspace] Archive

Context
[A] Work        [S] Me            [D] Studio      [F] Family      [/] More

Inferred:
Task · Work · Tomorrow
```

Notes:

- The card title/body remains the captured text from `TriageCard`.
- The Type row uses the current four outcomes: Task, Project, Resource/Note,
  Archive.
- The Context row shows lenses available to the user.
- The inferred summary is plain English and compact. It must not become a chip
  pile.
- The primary action is still a button for pointer users:
  - `Continue` for Task, Project, Resource
  - `Archive` for Archive

### Type Options

Type options:

| Key | Type | Label | Notes |
|---|---|---|---|
| `1` | `task` | Task | Default |
| `2` | `project` | Project | Hidden when a captured explicit project token means the item is a task in that project |
| `3` | `resource` | Note | Existing Resource outcome, user-facing label stays Note if current UI does |
| `Backspace` / `Delete` | `archive` | Archive | Lossless archive, dispatches immediately on `Enter` or Archive click |

The existing rule remains: triage never creates a Goal. Goals are linked in
Spec, not selected as a Type.

### Context Options

For up to four visible lenses, show inline context choices with keycaps:

```text
[A] Work   [S] Me   [D] Studio   [F] Family
```

For five or more lenses, show the first four inline and expose the full lens
picker via `/ More`:

```text
[A] Work   [S] Me   [D] Studio   [F] Family   [/] More
```

The exact visible order should match the app's lens order from `getAppData`.
The selected context should use the lens identity color affordance already used
by the current Context step.

The full picker should reuse the existing adaptive lens picker pattern where
possible:

- `/` opens search/picker.
- `ArrowUp` / `ArrowDown` move.
- `Enter` selects.
- `Esc` closes.

Do not make custom lens management available from triage.

## Inference Rules

Classify starts with inferred defaults. The user can change either Type or
Context before advancing.

### Type Default

Default Type is always `task` unless the builder adds a narrowly scoped,
tested inference with no ambiguity. This spec does not require smart type
inference.

Reason: false type guesses are more expensive than false property guesses.
Keep the first version predictable.

### Context Default

Context default precedence:

1. Explicit `[[lens]]` token resolved to a real Lens.
2. Project-bridged inference from a uniquely matched project.
3. Active lens.
4. First available lens only as a last resort when active lens is unavailable.

`[[lens]]` continues to win over project inference when they disagree.

### Confidence and Visibility

The context choice may be auto-selected, but it is not silent. The Classify
screen must show the selected context before the item can be dispatched.

Show a short explanation when context was inferred from something other than
the active lens:

| Source | Example copy |
|---|---|
| `[[lens]]` token | `Context from [[work]]` |
| Project bridge | `Context from project Q3 Launch` |
| Active lens | No explanation required |

If the user changes context manually, hide the inference explanation or replace
it with neutral selected-context copy. Do not continue claiming the old
inference.

### Ambiguity

Ambiguous context must not be hidden behind a confident-looking default.

Show Classify with a visible ambiguity hint when:

- Multiple projects with the same matched name exist across lenses.
- A project match conflicts with an explicit `[[lens]]`.
- An explicit `[[lens]]` token is unknown and preserved as literal text.
- The active lens is unavailable or locked.

The first build may keep ambiguity resolution simple: select the highest
precedence valid context, show a hint, and require the user to choose if the
selected context cannot be used. Do not block on a full ambiguity UI unless
the current implementation already exposes the needed data.

## Keyboard Contract

Triage remains keyboard-first. Shortcuts only fire when focus is not inside a
text field, contenteditable title, open spec row, or picker that owns keys.

### Classify Keys

| Key | Action |
|---|---|
| `1` | Select Task |
| `2` | Select Project, if visible |
| `3` | Select Note/Resource |
| `Backspace` / `Delete` | Select Archive |
| `A` | Select first visible lens |
| `S` | Select second visible lens |
| `D` | Select third visible lens |
| `F` | Select fourth visible lens |
| `/` | Open full lens picker when there are more lenses |
| `Enter` | Accept current Classify choices; archive immediately if Archive is selected |
| `Esc` | Return to Inbox |
| `Q` | Return to Inbox |
| `←` / `→` | Previous / next inbox item, preserving current session semantics |

`A/S/D/F` are positional keys. They do not have semantic meaning and should be
shown as visible keycaps on the context options.

### Spec Keys

Existing and planned Spec shortcuts remain:

| Key | Action |
|---|---|
| `[` / `]` | Size down / up |
| `-` / `=` | Priority down / up |
| `H` | Set When / cycle Today → Upcoming → Someday |
| `G` | Assign/link Goal |
| `Enter` | Complete when valid |
| `Esc` | Return to Classify |
| `Q` | Return to Inbox |

If these keys are not all currently built, this spec does not require building
every missing Spec shortcut. The required keyboard work for this feature is the
Classify keyset plus preserving current Enter/Esc behavior.

## Pointer and Touch Behavior

Every shortcut must have an equivalent clickable control:

- Type options are buttons.
- Context options are radio-style buttons.
- `/ More` has a clickable "More" button.
- The primary button advances or archives.

Mobile triage remains out of scope per `docs/TRIAGE.md` §6.

## Data and Server Model

No schema change is required.

The existing `triageInboxItem` API already accepts:

- `decision`
- `lensId`
- `projectId`
- `goalId`
- `priority`
- `size`

Classify changes when `lensId` is selected in the UI, not how it is submitted.

The builder should keep project and goal queries scoped to the selected
Classify context, matching the current behavior that scopes filing targets to
`chosenLensId`.

## Implementation Notes

Primary target:

- `webapp/src/inbox/TriagePage.tsx`

Likely supporting target:

- `webapp/src/inbox/TriagePage.css`
- `webapp/src/components/ui/ShortcutCheatsheet.tsx`
- `docs/TRIAGE.md`
- `docs/WORKFLOW.md`

Recommended implementation shape:

1. Rename the conceptual first step from `lens` to `classify`.
2. Remove the separate `type` step.
3. Render Type and Context controls together.
4. Keep `chosenLensId`, but treat it as selected context rather than a
   separately confirmed value.
5. Keep `working.type`, but allow it to be changed on the Classify screen.
6. Update `Esc` behavior:
   - from Classify: leave triage
   - from Spec: return to Classify
7. Update `Enter` behavior:
   - from Classify: go to Spec, or dispatch Archive
   - from Spec: dispatch when valid
8. Add Classify keyboard handlers for `1/2/3`, `Backspace/Delete`, `A/S/D/F`,
   `/`, `Q`, and previous/next where supported.
9. Preserve existing guards that ignore shortcuts while text/editing/pickers
   own focus.

Avoid broad refactors. This should be a focused change to the triage wizard
state and rendering.

## UX Details

### Copy

Use calm, direct labels:

- Step label: `1 · Classify`
- Question: `What is this?`
- Type row label: `Becomes`
- Context row label: `Context`
- Inference row label: `Inferred`

Do not use congratulatory, gamified, or guilt-oriented language.

### Summary

The Classify summary should reflect the current selected values:

```text
Task · Work · Tomorrow
```

If a project is already resolved:

```text
Task · Work · Q3 Launch · Tomorrow
```

If Archive is selected:

```text
Archive · kept in Logbook
```

### Archive

Archive still requires an explicit final action:

- Selecting Archive with `Backspace` / `Delete` changes the selected Type.
- Pressing `Enter` on Classify dispatches Archive.
- Clicking the primary `Archive` button dispatches Archive.

Do not archive immediately on `Backspace` alone. The key selects the outcome;
`Enter` commits it. This prevents destructive-feeling mistakes even though
Archive is lossless.

### Resource/Note

When Type is Note/Resource, Classify chooses context only. The required parent
Project/Goal is still selected in Spec. Complete remains gated until a parent
is set.

## Edge Cases

- If there are no lenses loaded yet, Classify should show the current loading
  or fallback state without allowing completion without a valid lens.
- If the selected lens becomes unavailable, disable Continue and show a quiet
  inline error.
- If Project type is hidden because `item.parsedProject` exists, pressing `2`
  should no-op or flash the hint; it must not select a hidden Project option.
- If there are fewer than four lenses, unused `A/S/D/F` keys no-op.
- If there are more than four lenses and the selected lens is not in the first
  four, show it as selected in the row or in a compact selected-context chip so
  the user can see the actual destination without reopening the picker.
- When moving previous/next between inbox items, reset Classify state for the
  new item using the inference rules above.

## Done Conditions

- [ ] `TriagePage` no longer has a separate visible Context step and Type step;
      the first visible step is Classify.
- [ ] Classify renders Type and Context controls together.
- [ ] `Enter` from Classify advances to Spec for Task, Project, and Resource.
- [ ] `Enter` from Classify dispatches Archive only when Archive is selected.
- [ ] Type shortcuts work on Classify: `1`, `2`, `3`, `Backspace`, `Delete`.
- [ ] Context shortcuts work on Classify for visible lenses: `A`, `S`, `D`,
      `F`.
- [ ] `/` opens the full lens picker when there are more than four lenses.
- [ ] Context default precedence is implemented:
      `[[lens]]` → project-bridged lens → active lens → first available lens.
- [ ] Inference copy appears for `[[lens]]` and project-bridged context, and
      updates or disappears after manual context change.
- [ ] Spec rows remain scoped to the selected context, not necessarily the
      globally active lens.
- [ ] Resource completion remains gated until a Project or Goal parent is set.
- [ ] Archive remains lossless and does not commit on `Backspace` alone.
- [ ] Shortcut handling is suppressed while typing, editing a title, expanding
      a spec row, or using a picker.
- [ ] Shortcut cheatsheet reflects the new Classify keyset.
- [ ] `docs/TRIAGE.md` and `docs/WORKFLOW.md` are updated so the canonical docs
      no longer describe Context as a standalone first step.
- [ ] Existing triage operation tests pass.
- [ ] New or updated UI tests cover Classify keyboard selection and Enter/Esc
      transitions.
- [ ] `wasp compile` passes.

## Non-goals

- No mobile triage walkthrough.
- No automatic Goal creation from triage.
- No schema change.
- No server-side project resolver rewrite.
- No fuzzy project or lens matching.
- No bulk triage.
- No undo toast work unless the builder chooses to handle the existing backlog
  item separately.

## Suggested Tests

Add or update tests around `TriagePage` if the current test harness supports
the route. If not, extract the Classify inference/key mapping into small pure
helpers and test those directly.

Minimum useful cases:

- `[[work]]` selects the Work lens on Classify.
- A unique matched project selects that project's lens.
- `[[me]]` beats a conflicting Work project match.
- Active lens is selected when there is no explicit or project inference.
- Pressing `1/2/3` changes Type.
- Pressing `A/S/D/F` changes Context by visible position.
- Pressing `Backspace` selects Archive but does not dispatch until `Enter`.
- Pressing `Enter` from Task Classify moves to Spec.
- Pressing `Esc` from Spec returns to Classify.

## Documentation Updates

When implemented, update:

- `docs/TRIAGE.md` §2 loop diagram
- `docs/TRIAGE.md` §4 co-author UI wizard description
- `docs/TRIAGE.md` §7.4 Triage mode keymap
- `docs/TRIAGE.md` §8 built/unbuilt list
- `docs/WORKFLOW.md` §2.2 Triage
- `docs/WORKFLOW.md` §5.5 Triage lens assignment

The new structural statement should be:

> Triage begins with Classify: a combined Type + Context step. Context may be
> inferred from `[[lens]]`, a matched project, or the active lens, but it is
> always visible and reversible before dispatch.
