---
id: tag-management
kind: spec
title: "Tag management (Task-detail chips + reserved-name seeding)"
status: ready
priority: P2
feature: tag-management
spec_owner: discover
build_owner: build
unblocks: focus-engine-v2.md   # the moment matcher is inert without it
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mgsdx      # sync-managed (write-once)
gh_synced_at: 2026-07-07T18:16:34Z   # sync-managed (drift detection)
---

# Spec: Tag management

> **Status: `ready`** (written 2026-07-03). Surfaced as a missing prerequisite
> during the focus-engine-v2 review: the moment matcher reads energy/time tags
> users have no way to set. This spec is deliberately **the minimum that
> unblocks the matcher** — no tag-manager page, no color editing, no tag merge.

## Summary

Two things, nothing more:

1. **Seed the 7 reserved tag names** once per user (in `ensureOnboarded`,
   which already runs idempotically per session) so the matcher has something
   to read.
2. **Show + edit tags as chips on Task detail** (add via `@`-typed input,
   remove via the existing `Chip`'s × affordance). Tags are still created at
   triage via `@`-parsing — that path is unchanged; this just makes them
   visible and editable after the fact.

## Why

The `Tag` model exists and triage already connects tags to tasks
(`inbox/operations.ts:155`). But tags are **invisible after triage** — never
listed on Task detail, never editable, never seeded. `focus-engine-v2`'s moment
matcher reads energy/time tags (`low-energy`, `~30m`, …); without this spec,
users cannot tag tasks with the attributes the matcher ranks on. The matcher is
the project's only moat (per the roast); this is the prerequisite that makes it
usable.

## Decisions locked (keep it simple)

- **Reserved tags are seeded, not invented.** The 7 names — `~15m`, `~30m`,
  `~1h`, `~2h+`, `low-energy`, `med-energy`, `high-energy` — are created as
  normal `Tag` rows per user (the `Tag` model already has `@@unique([userId,
  name])`). They behave like any other tag; "reserved" just means *these are
  the ones the matcher reads and the seeder ensures exist*. No new
  `isSystem` flag, no new column.
- **No tag-manager page.** Tags are managed in place, on Task detail. A
  standalone `/do/tags` list is a non-goal.
- **No color editing / merge / rename.** The `Tag.color` field keeps whatever
  it was created with; seeded reserved tags get a neutral default. Editing
  color, merging duplicates, renaming → all non-goals.
- **`@`-parsing at triage is unchanged.** This spec adds a second entrypoint
  (Task-detail edit), it does not touch the existing one.
- **No capture-time enforcement.** The capture `@token` path stays as-is;
  energy/time tags are optional and set later, per `focus-engine-v2`'s open
  question resolution.

## Done-conditions

### Seeding (in `onboarding/operations.ts` `ensureOnboarded`)

- [ ] **The 7 reserved tag names are seeded** for each user, idempotently, in
      `ensureOnboarded` (which already runs once per session and is idempotent
      via existing guards). Names: `~15m`, `~30m`, `~1h`, `~2h+`, `low-energy`,
      `med-energy`, `high-energy`. Default `color` (neutral). Idempotent on the
      `@@unique([userId, name])` — re-runs are no-ops.
- [ ] **Existing users get the seed too** — `ensureOnboarded` already runs for
      everyone on app load, so this is automatic; verify a user created before
      this spec ships sees the 7 tags after their next login.
- [ ] **Reserved-name conflict handling:** if a user already has a same-named
      tag (e.g. they typed `@low-energy` at triage before this shipped), the
      seed skips it (idempotent) — no duplicate, no overwrite of their color.

### UI — Task detail (`tasks/TaskDetailPage.tsx` + css)

`TaskDetailPage` is currently a thin stub (title + meta + `← Next` link). This
spec flesh it out minimally to show + edit tags. (Other Task fields — priority,
size, due, notes — are explicitly out of scope; the stub's TODO stays.)

- [ ] **`getTask` includes `tags`** (`tasks/operations.ts` `getTask` adds
      `include: { tags: true }`).
- [ ] **A "Tags" row renders the task's tags as `Chip`s**, each with the
      existing × remove affordance → `unlinkTaskTag({ taskId, tagId })`.
      Hidden when the task has no tags AND no reserved tags exist yet (calm
      empty state — don't show a bare "Tags:" label with nothing after it).
- [ ] **An "Add tag" affordance** opens a small inline input (or popover, Build
      picks). Typing `@`-prefixed or bare text + Enter:
      - Resolves existing tag by name (case-insensitive) for this user → connect.
      - Else creates a new `Tag` (name = the typed text, default color) → connect.
      Idempotent on the `@@unique` — connecting an already-connected tag is a
      no-op, not an error.
      Suggests the reserved + existing tags as the user types (cheap typeahead).
- [ ] **Reserved tags render distinctly** (calm, not loud): a muted style or a
      tiny glyph. They behave identically to user tags; the visual just signals
      "this one feeds the matcher."
- [ ] **Cache invalidation:** invalidate `getTask` on every tag add/remove.

### Server ops (`tags/operations.ts` — new file)

- [ ] **`unlinkTaskTag({ taskId, tagId })`** — disconnects the tag from the
      task. Tenancy-safe (`userId` compound check). The `Tag` row itself is
      **not deleted** (other tasks may use it); only the link is removed.
- [ ] **`linkTaskTag({ taskId, name })`** — resolves-or-creates the tag by
      name (case-insensitive) for `context.user.id`, then connects. Idempotent
      on the `@@unique` + the connect. Tenancy-safe.
- [ ] **No `deleteTag`, no `renameTag`, no `mergeTags`, no `setTagColor`.**
      Those are non-goals. (A tag row with no task links is harmless; cleanup
      is deferred indefinitely.)

### Tests + verification

- [ ] **Seeding test:** a fresh user has exactly the 7 reserved tags after
      `ensureOnboarded`; a second run adds nothing.
- [ ] **Ops test:** `linkTaskTag` resolves-existing vs creates-new vs idempotent
      re-link; `unlinkTaskTag` removes the link and leaves the `Tag` row; both
      reject cross-user ids.
- [ ] **`wasp compile` clean; existing suite green** (triage e2e that asserts
      tags-on-task still passes — the triage path is unchanged).
- [ ] **Manual:** on a task, add `low-energy` from the reserved suggestions,
      confirm it appears as a chip; remove it; confirm the chip is gone but
      re-adding it shows it again (the Tag row survived).

## Non-goals

- **No tag-manager page** (`/do/tags`). In-place editing only.
- **No color editing, rename, merge, delete-tag.** `Tag.color` keeps its
  create-time value; orphan tag rows are harmless.
- **No other Task-detail fields.** Priority/size/due/notes stay as the existing
  stub's TODO. This spec is tags-only.
- **No capture-time tag enforcement.** Capture and triage `@`-parsing are
  unchanged.
- **No bulk tagging** (multi-select tasks → tag). Separate affordance.
- **No tag scoping by Lens.** Tags are per-user, as today.

## Open questions

- **Inline input vs popover for "Add tag".** Build picks; lean inline (one
  field appearing in place, like a chip with a `+`). Note the choice.
- **Reserved-tag visual.** Muted style vs glyph vs nothing. Lean muted (they
  shouldn't look louder than user tags — calm by rule). Note the choice.
- **Should `getTask` also return the user's full tag list** (for the typeahead
  suggestions), or does the UI call a separate `listTags` query? Lean: a small
  `listTags` query (keeps `getTask` lean, the typeahead needs all the user's
  tags anyway). Build decides.

## Prototypes

_(none — chips on an existing page, reusing the existing `Chip` component. The
Task-detail "Tags" row is one row; the add affordance is one input. No new
paradigm.)_

## Dependencies

- None — this is the prerequisite. **Unblocks `focus-engine-v2`** (which can
  leave `draft` once this is `ready` *and* the matcher-test gate produces a
  BUILD verdict *and* Gap B's moment-bar mockup lands).
