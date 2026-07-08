---
id: task-fields
kind: spec
title: "Task enhancement fields (Context + Outcome)"
status: done
priority: P2
feature: task-fields
spec_owner: discover
build_owner: build
reverses: resources-project-owned.md   # on the Task↔Resource link question (see §Resource linking)
created: 2026-07-04

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mgsep      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:30:30Z
---

# Spec: Task enhancement fields (Context + Outcome)

> **Status: `ready`** (2026-07-04). The two open questions from the first draft
> are resolved: (1) markdown renderer = `react-markdown` + `remark-gfm` (safe
> for user-authored content); (2) NextCard stays title-only, Context/Outcome
> surface in Focus mode and Task detail. One spec because these are the **task
> enhancement pair** — optional text fields that turn a title-only card into
> something doable and reviewable. **No schema migration** (Context reuses
> `Task.content`); Outcome adds one nullable column.

## Summary

A work card today is a title and nothing else (`Task.description`, "the title —
what to do", `schema.prisma:202`). When a task needs more there is nowhere to
put it — not before, not after. This spec adds two optional, markdown-rendered
fields that bookend a task's life:

- **Context** — what you need *to do* it. Background, rationale, the spec link,
  pointers to the resources you'll need. Captured anytime; read in Focus mode
  and Task detail.
- **Outcome** — what *happened*. Captured at completion (optional, never
  mandatory); read in the Logbook and future Review.

Both stay invisible when empty. A one-line task remains a one-line task.

## Why

The product's wedge is *the one task that matters* (`NextCard.tsx:38-49`).
Surfacing the task is half the job. The other half — having what you need to
act, and remembering what came of it — lives nowhere in the app today. It lives
in the tab you forgot to open, the doc you can't find, the chat you scrolled
past, and the memory you lose a week later.

- **Context** captures the situation next to the task: when you sit down to do
  the thing, the thing you need to read is already there.
- **Outcome** is for review. ADHD brains re-litigate completed work ("did I
  actually finish anything today?"). A short note captured at completion gives
  Review and the Logbook something honest to show — not a streak, not a badge,
  just *what happened*, in your own words, when it was fresh. It is never
  required; the field exists for when it's interesting.

## Decisions locked

- **Context reuses `Task.content`.** The field already exists
  (`schema.prisma:202`, *"longer notes / markdown body"*), is already read by
  `getTask` / `getTopTask`, and is already rendered in Focus mode
  (`FocusMode.tsx:56`). A new column would duplicate it and break the schema's
  naming convention (Goal/Project → `description`; Resource → `notes`; Task →
  `content`).
- **Outcome is a new nullable column: `Task.outcome String?`.** No existing
  field captures post-completion notes — `TaskUpdate.body` is the time-ordered
  activity log (`schema.prisma:261`), a separate concept. Outcome is one
  authorial note per task, written at completion.
- **UI labels are "Context" / "Outcome"; persisted names are `content` /
  `outcome`.** Same split the schema already uses (`description` shows as the
  title). Schema keeps its convention; the UI gets product voice.
- **Both fields are markdown.** Bold, italic, links, lists, headings, code,
  quotes. Plain text renders as plain text — authors aren't forced into
  markdown. Links are how Context references anything external (including
  project-level Resources — see §Resource linking).
- **Renderer: `react-markdown` + `remark-gfm`.** New dep added to
  `webapp/package.json`. The existing `webapp/src/shared/markdown.ts` returns
  an **unsanitized HTML string** (no output escaping; regex-replaced links) —
  fine for trusted static public pages, unsafe for user-authored content.
  `react-markdown` renders to React elements (no `dangerouslySetInnerHTML`),
  is safe by construction, and sets the precedent for the next user-markdown
  surface. GFM adds tables / strikethrough / task-list checkboxes for free.
- **Empty stays empty.** No placeholder text, no "Add context…" nudge in the
  read view. Affordances to add/edit live on Task detail (Context) and at
  completion (Outcome). If you haven't written any, the card is unchanged.
- **NextCard stays title-only.** It is a chooser; whitespace is the point. A
  task with Context or Outcome reveals those in Focus mode and Task detail, not
  on the home card.
- **Outcome capture is opt-in and non-blocking at completion.** Completing a
  task never demands a note. The affordance appears, the user can write or
  skip; either way the task completes.

## Resource linking (reverses `resources-project-owned.md`)

- **No `Task↔Resource` relation. Resources are referenced as markdown links in
  Context: `[API spec](https://…)` or `[Figma mock](/projects/…/resources/…)`.**
  This deliberately **reverses** the `ready` spec `resources-project-owned.md`,
  which on 2026-07-03 locked an explicit `TaskResource` join model
  (`docs/specs/resources-project-owned.md:68-90`, 264-301).

- **Why reverse it.** With Context as the markdown home for "what you need to
  do this task," a parallel structured-attachment mechanism becomes redundant —
  a task would have two places resources appear (Context prose links *and* a
  linked-resources list). Markdown links keep everything in one writable
  surface, need no schema change, and match how people actually reference
  things while writing. The cost is real and accepted: **renaming or deleting a
  Resource silently breaks Context links** — no query, no "tasks using this"
  surface. That trade-off was chosen with eyes open.

- **What stays from `resources-project-owned.md`.** The *non*-TaskResource
  parts of that spec are untouched: Resources becoming **project-owned**
  (`projectId` required, `NOT NULL`, `goalId` removed), the Resources section
  on Project detail (add/edit/delete), and the delete-with-impact flow all
  remain as decided. Only the Task↔Resource link shape changes — from an
  explicit join to "markdown links in Context, nothing structured."

- **`resources-project-owned.md` must be updated in the same PR** that lands
  this decision: drop the `TaskResource` model, `linkTaskResource` /
  `unlinkTaskResource` ops, and the same-project invariant; leave the
  project-ownership + Project-detail-surfacing work intact. Its front matter
  should note the reconciliation with this spec. (Build does this; the
  reversal is already locked here so Build isn't blocked on Discover.)

- **Why markdown links don't get a "Resource picker" in v1.** A picker that
  autocompletes the parent project's Resources into a markdown link is a
  plausible v2 — it would give the convenience of structured attachment
  without the join table. Non-goal for this spec; tracked as a future
  enhancement once Resources are surfaced.

## Done-conditions

### A. Schema & data

- [ ] `Task.content` is reused; **no new column added for Context**. Verified
      by `grep -n "context" webapp/schema.prisma` returning only comments.
- [ ] `Task.outcome String?` is added (nullable, no default). Migration
      `wasp db migrate-dev --name task_outcome`.
- [ ] `getTask` returns both fields (already returns all via `findUnique` with
      no `select` — confirm `outcome` flows through after the column lands).

### B. Write path — Context (the actual gap)

- [ ] An operation updates a task's content (e.g. `updateTaskContent` or a
      broader `updateTask`). Today the only assignments to `content` in the
      codebase set it to `null` (`inbox/operations.ts:144`,
      `projects/operations.ts:188`) — grep confirms no write path exists.
- [ ] Auth-scoped to the task's owner (`userId` check, matching neighbouring
      ops).
- [ ] Empty string normalised to `null` on write (cleared reads as absent).

### C. Write path — Outcome (captured at completion)

- [ ] `toggleTaskDone` (`tasks/operations.ts:97-113`) accepts an optional
      `outcome?: string` arg, written **only when marking done** (`next ===
      true`). Un-completing a task does **not** clear an existing `outcome`
      (you might re-complete with a new note — last write wins, but the prior
      note isn't blown away merely by toggling).
- [ ] Alternatively (Build's call): a separate `setTaskOutcome({ id, outcome })`
      op editable from Task detail / Logbook after the fact. Either satisfies
      the done-condition as long as Outcome is writable both at completion and
      later.
- [ ] Empty string normalised to `null`.
- [ ] Auth-scoped to the task's owner.

### D. Render — read (both fields, markdown)

- [ ] **Renderer:** `react-markdown` + `remark-gfm` added to
      `webapp/package.json`. A shared component (e.g.
      `components/ui/Markdown.tsx`) wraps them with consistent typography.
- [ ] No `dangerouslySetInnerHTML` anywhere on the read path for these fields.
- [ ] Focus mode renders `content` (currently raw at `FocusMode.tsx:56`) and
      `outcome` (if present) through the renderer.
- [ ] Task detail renders both through the renderer in read state.
- [ ] Empty renders nothing — no placeholder, no empty block.
- [ ] Markdown links open in a new tab (`target="_blank"`, `rel="noopener"`).
- [ ] Styling per the design system: neutral text scale; teal reserved for
      links/state, not body prose; amber not used decoratively.

### E. Edit — Context

- [ ] Task detail has an edit affordance for Context → textarea (modal or
      inline, per `docs/modal-approach.md`).
- [ ] Editing is opt-in and non-blocking; can be left empty forever.
- [ ] Save persists via the op from §B; Cancel discards.
- [ ] Keyboard-first: reachable and operable without the pointer (per
      `INTERACTION.md` and the keyboard-first rule in `AGENTS.md`).

### F. Capture — Outcome at completion

- [ ] Completing a task surfaces an optional Outcome affordance. Exact surface
      is Build's call (a sheet on completion, a prompt on the completion
      circle, or a field revealed on the just-completed card) — but it must
      appear **at the moment of completion**, not only after the fact.
- [ ] Skipping is one keystroke / click; the task completes regardless.
- [ ] Outcome remains editable afterward (via Task detail, and visible in the
      Logbook).
- [ ] Keyboard-first.

### G. Read — Outcome in review surfaces

- [ ] Logbook (`logbook/operations.ts`) returns `outcome`; `LogbookPage`
      renders it for completed tasks (markdown, same renderer).
- [ ] Empty Outcome renders nothing in the Logbook — no "no outcome recorded"
      stub. Silence is honest.

### H. Resource linking (via markdown — no structured link)

- [ ] A Context containing `[Spec](https://example.com/spec)` renders as a
      clickable link.
- [ ] No `TaskResource` model, no `linkTaskResource` / `unlinkTaskResource`
      ops are introduced. **If `resources-project-owned.md` already shipped
      them, this spec's PR removes them** (per §Resource linking).
- [ ] Reconciliation edit to `resources-project-owned.md` lands in the same PR.

## Non-goals

- **No `Task↔Resource` relation.** Resources stay filed at Project level;
  Context links to them by URL. A Resource picker that autocompletes into a
  markdown link is a plausible v2, not this spec.
- **No inline edit on NextCard.** NextCard stays a chooser; deep editing lives
  on Task detail. NextCard shows neither Context nor Outcome.
- **No Context on `TaskRow`.** Rows stay one line. Context is for depth, not
  for the list.
- **No rich-text / WYSIWYG editor.** Markdown source in, rendered markdown out.
- **No Outcome on incomplete tasks.** Outcome is captured/edited freely but
  only becomes *meaningful* on completed tasks; the read surface (Logbook)
  shows it only for done tasks.
- **No mandatory Outcome.** Ever. Completion never gates on it.
- **No streaks / badges / completion score.** Outcome is prose for review, not
  gamification. (Per `AGENTS.md` "Rules that always apply.")

## Open questions

- _(none — both renderer and NextCard-peek questions resolved 2026-07-04.)_

## Dependencies

- **New npm deps:** `react-markdown`, `remark-gfm` (Build adds in-PR).
- **Reconciliation:** `resources-project-owned.md` must be edited in the same
  PR (TaskResource model + link ops removed). No other spec depends on the
  join — `cli-comments-resources.md` is already noted there as deferred until
  `resources-project-owned` lands, and lands in the markdown-links shape.

## Prototypes

_(none)_
