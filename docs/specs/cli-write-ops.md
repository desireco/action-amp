---
feature: cli-write-ops
status: deferred
spec_owner: discover
build_owner: build

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mi6c7      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:38:16Z   # sync-managed (drift detection)
---

# Feature: CLI write operations (edit + delete)

## Summary

The `cli` spec (`docs/specs/cli.md`) ships only operations the backend
already exposes. This follow-up closes the **write gaps** the CLI deliberately
omitted: editing a task's description / priority / size / content, editing a
project's and goal's name + description, marking projects/goals done, and
**deleting** tasks, projects, and goals. It adds the missing server operations
and the matching `actionamp` commands.

## Why

The orchestration skills — especially a "refine this task/project" flow —
need to *edit*, not just create. Today the backend is read-heavy and
create-light: `createTask` hardcodes `priority: "NORMAL"`, `size: "M"`, and
there is **no** edit-description, no edit-priority/size, and no delete
operation for any entity (confirmed by audit — the only `delete` in the codebase
is `InboxItem.delete` inside `triageInboxItem`). So a CLI that wants to
"refine a task" can't, and the skills that orchestrate refinement are
half-able.

This is filed as **deferred** because it is not on the validation critical
path (see `docs/ROADMAP.md` §"Now") and the unblocked skills (inbox-triage,
goal-breakdown, today-balancer) don't need it. It unblocks the richer
refinement flows and the `task-research` skill's "draft a refined description"
step (paired with `cli-comments-resources.md`).

## Scope (proposed — to finalize when this spec activates)

### New server operations (in `webapp/src/`)

All tenancy-safe (`findUnique` + `userId` match before any write, matching the
existing op pattern in `src/tasks/operations.ts`).

- **`updateTask`** — `{ id, description?, content?, priority?, size? }`.
  Partial update; only provided fields mutate. Clears/sets nothing else (no
  status side-effects — status stays the job of `updateTaskStatus`).
- **`deleteTask`** — `{ id }`. Hard delete (`Task` has no soft-delete field).
  Cascade is configured in `schema.prisma` (`TaskUpdate` deletes with its
  task; tags via the join table). Confirm cascade behavior in the migration
  review.
- **`updateProject`** — `{ id, name?, description?, dueDate? }`.
- **`setProjectDone`** — `{ id, isDone }`. Stamps/clears `completedAt`
  (mirror `toggleTaskDone`).
- **`deleteProject`** — `{ id }`. Decide: cascade-delete the project's tasks,
  reassign them to the lens's General project, or block if tasks exist.
  **Default proposal: block with a clear error** unless `--force` is passed
  (matches the "delete-with-impact" philosophy in
  `docs/specs/resources-project-owned.md`).
- **`updateGoal`** — `{ id, name?, description? }`.
- **`setGoalDone`** — `{ id, isDone }`.
- **`deleteGoal`** — `{ id }`. Same impact question as projects; same default
  (block unless forced).

Each is wired in `main.wasp.ts` with `entities` + `auth: true`, and exposed
both to the browser (the detail pages already render editable-looking fields
that today can't save) and to `/api/cli/*` via the Phase-0 PAT transport.

### New CLI commands

| Command | Op |
|---|---|
| `task edit <id> [--desc …] [--priority …] [--size …]` | `updateTask` |
| `task delete <id> [--force]` | `deleteTask` |
| `project edit <id> [--name …] [--desc …]` | `updateProject` |
| `project done <id> / undo` | `setProjectDone` |
| `project delete <id> [--force]` | `deleteProject` |
| `goal edit <id> [--name …] [--desc …]` | `updateGoal` |
| `goal done <id> / undo` | `setGoalDone` |
| `goal delete <id> [--force]` | `deleteGoal` |

All with `--json` shapes consistent with `cli.md`.

## Done-conditions

_(To be finalized on activation. Sketch:)_

- [ ] Every new op exists, is tenancy-safe, and has a unit test proving a
      cross-user id returns "not found."
- [ ] `wasp db migrate-dev` (if schema touched — it likely doesn't; these are
      ops on existing fields) runs clean; `wasp compile` passes.
- [ ] Each new `actionamp` command works end-to-end against `wasp start`,
      human + `--json`.
- [ ] Delete-with-impact: deleting a project/goal with children blocks unless
      `--force`, and the error names the child count.
- [ ] The browser detail pages (Task/Project/Goal) use the new ops to save
      edits they currently can't.

## Non-goals

- **No bulk operations** (bulk delete, bulk edit). One id at a time.
- **No undo/trash.** Hard delete is final (Archive exists only for
  `InboxItem`, by design — `schema.prisma` comment). If a trash tier is ever
  wanted, that's a separate data-model decision.
- **No reordering** (`Task.order`) edits — out of scope unless a skill needs
  explicit manual ordering.

## Open questions

- **Delete cascade policy.** Block-by-default + `--force`, or reassign-to-
  General? Defaulting to block; confirm on activation.
- **Should `updateTask` allow status changes too?** Currently no — status has
  its own op (`updateTaskStatus`) with Today-cap awareness. Keep them
  separate.

## Prototypes

_(none)_
