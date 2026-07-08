---
feature: cli-comments-resources
status: deferred
spec_owner: discover
build_owner: build

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mi6bq      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:38:50Z
---

# Feature: CLI comments + resources (the research surface)

## Summary

The follow-up that **unblocks the `task-research` skill** (scaffolded in
`docs/specs/cli.md`). It adds (a) a lightweight **Comment** model + ops so a
task/project can accumulate notes and progress over time, and (b) full
**Resource** CRUD so links + reference material can be attached, listed, and
removed — not just created indirectly via triage as today.

## Why

Today the only way to create a `Resource` is the `"resource"` decision inside
`triageInboxItem` (`src/inbox/operations.ts`), and there is **no** list,
update, or delete, and no way to attach one to a Task (the `Resource` model
links to Project or Goal only). There is also **no Comment model at all** —
the activity log is `TaskUpdate`, which no operation creates or reads
directly (it's only an `include` on `getTask`). So the CLI's "post comments"
and "attach resources" goals, and the `task-research` skill's "gather web
resources + attach them," are impossible without this.

Filed as **deferred** because it depends on a data-model decision (a new
`Comment` table, and resolving the Resource-parent question against
`docs/specs/resources-project-owned.md` — which proposes narrowing resources
to **project-owned**). Neither is on the validation critical path.

## Relationship to `resources-project-owned`

`docs/specs/resources-project-owned.md` proposes restructuring `Resource` to
be project-owned (with tasks many-to-many referencing their project's
resources) and surfacing add/edit/delete on the Project detail page. **This
spec must reconcile with that one** before activation — specifically:

- If `resources-project-owned` ships first, this spec inherits its
  project-owned model and adds only the CLI surface + the Task-attach path.
- If this spec ships first, it must decide the Resource-parent question
  itself (today: Project *or* Goal; the proposed narrowing: Project only).

**Recommendation:** land `resources-project-owned` first; this spec then
becomes "the CLI + comments layer on top."

## Scope (proposed — to finalize when this spec activates)

### Comments

- **New `Comment` model** (`schema.prisma`): `{ id, body, createdAt, taskId,
  projectId?, goalId? }` — polymorphic parent (one of task/project/goal), or
  three separate FKs. Default proposal: **task-only** for v1 (the most
  common research target), with `projectId`/`goalId` added later if needed.
  Migration: `wasp db migrate-dev --name add-comments`.
- Ops: `createComment`, `listComments`, `deleteComment` (no edit — comments
  are append-only, like `TaskUpdate`). All tenancy-safe.
- Browser: a comments thread on the Task detail page.
- CLI: `task comment <id> <text>` (or from stdin), `task comments <id>`.

### Resources

- Ops: `createResource`, `listResources`, `updateResource`, `deleteResource`,
  `attachResourceToTask` (if the many-to-many from
  `resources-project-owned` lands).
- CLI: `resource add --project <id> --title … --url …`, `resource list
  --project <id>`, `resource delete <id>`, `task attach-resource <id>
  <resourceId>`.
- Browser: the Project detail page's resource section (from
  `resources-project-owned`) gains the list/delete the CLI mirrors.

### Skill activation

Once both land, the **`task-research`** skill (scaffolded, blocked) lights
up: gather web resources → draft a refined description (needs `updateTask`
from `cli-write-ops.md`) → attach the resources → post a summary comment.

## Done-conditions

_(To be finalized on activation. Sketch:)_

- [ ] `Comment` model + migration; `createComment`/`listComments`/
      `deleteComment` ops exist and are tenancy-safe.
- [ ] Resource CRUD ops exist; resources can be listed and deleted (not just
      created via triage).
- [ ] The Resource-parent model is reconciled with
      `resources-project-owned.md` (one source of truth).
- [ ] CLI `task comment`, `task comments`, `resource add/list/delete` all
      work end-to-end against `wasp start`, human + `--json`.
- [ ] The `task-research` skill runs one full cycle: research → draft
      description → attach resources → post comment.

## Non-goals

- **No file uploads.** Resources are links (`url`) + notes, as today.
- **No comment threading/reactions.** Flat, append-only.
- **No resource full-text search.** That's `command-palette-search` territory.

## Open questions

- **Comment parent shape.** Task-only v1, or polymorphic from the start?
- **Resource-parent resolution.** Defer entirely to
  `resources-project-owned.md`?

## Prototypes

_(none)_
