---
feature: resources-project-owned
status: ready
spec_owner: discover
build_owner: build
---

# Feature: Project-owned Resources with Task references

## Summary

Resources are reference material (links + notes) that today can be **created**
(only during triage) and then become invisible — there is no view, edit, delete,
or any link to a task anywhere in the app. This spec makes Resources
**project-owned** (a structural simplification: a Resource belongs to exactly one
Project, not "a Project or a Goal"), surfaces a **Resources section on the
Project detail page** with add / edit / delete, lets a **Task reference one or
more of its project's Resources** (a many-to-many link — "this task needs that
file/link"), and adds a **delete-with-impact** flow: when you delete a resource,
you see exactly which tasks reference it and their status before confirming.

In one line: anything you'd attach to a task lives on the task's Project, tasks
reference it, and deleting it shows you the dependent tasks first.

## Why

1. **The data model promises resources; the product doesn't deliver them.** The
   `Resource` entity exists (`webapp/schema.prisma:242`) and `docs/PAGES.md:142`
   explicitly promises a "Resources list (links + notes / bookmarks) —
   add/edit/open" on the Project detail page. None of that is built. Resources
   can only be created in triage (`inbox/operations.ts:129`) and are then
   untraceable — no list query, no detail, no edit, no delete. This closes a
   shipped-but-invisible gap.

2. **The GTD/PARA depth is a named differentiator.** `docs/ROADMAP.md` §"The
   threat the docs under-price" identifies three defensible positions against
   the crowded single-task category; one is *"the GTD+PARA depth (structure at
   scale)."* Resources are the "R" in PARA — reference material filed under
   projects. Today that leg of the structure is a stub. This spec makes it real.

3. **There is no Task↔Resource relationship of any kind today.** A user who
   wants "this link attached to this task" has no way to express it. The
   user-facing ask driving this spec is exactly that: attach a resource to a
   task, and — critically — *when deleting a resource, be shown which tasks
   depend on it and whether they're done.* That requires the many-to-many link
   plus the delete-impact surface; both are new.

4. **The "Project or Goal" parent rule is over-engineered for the MVP.** The
   docs lock resources to "exactly one Project OR Goal" (`DATA-MODEL.md:54-57`),
   but that dual-parent design forces a picker, nullable-both FKs, and an
   app-layer-only invariant that the DB can't enforce. Narrowing to
   **project-owned** removes the picker, makes the invariant DB-enforceable
   (`projectId` required, `NOT NULL`), and matches how resources are actually
   used (reference material for project work). Pre-launch, no data to preserve.

## Done-conditions

### Data model (`webapp/schema.prisma`)

- [ ] **`Resource` is project-owned.** `projectId` becomes required
      (`String`, `NOT NULL`); the `goalId` field and its `Goal` relation are
      **removed**. The `project` relation stays `onDelete: Cascade`.
- [ ] **`Resource.tasks` and `Task.resources` form an implicit many-to-many.**
      Prisma auto-generates the join table. Verify the cascade semantics:
      deleting a Resource severs its task references (tasks survive); deleting a
      Task severs its resource references (resources survive).
- [ ] **Remove the now-stale `resources Resource[]` back-relation on `Goal`**
      (it referenced the removed `goalId`).
- [ ] **Update the schema header comment** (lines 14–22): "Every Resource is
      filed under exactly one Project" (was "Project OR Goal").
- [ ] **Migration** `wasp db migrate-dev --name resources_project_owned_task_links`
      applies cleanly. If the generator resists the `NOT NULL` (e.g. existing
      goal-filed rows), drop those rows in the migration SQL first — none are
      expected (no creation UI beyond triage; pre-launch).

### Server operations — new file `webapp/src/resources/operations.ts`

All tenancy-safe (`userId` compound checks), matching `projects/operations.ts`
style. Each `satisfies <OpName<{...}>>` and registered in `main.wasp.ts` with
the correct `entities` array.

- [ ] **`getProjectResources({ projectId })`** — resources for a project, each
      carrying a **linked-task summary** (the task `id`, `description`, `status`,
      `isDone` for every referencing task). This single query powers both the
      project resource list *and* the delete-impact sheet.
- [ ] **`createResource({ projectId, title, url?, notes? })`** — validates
      `title` non-empty, project belongs to `context.user.id`.
- [ ] **`updateResource({ id, title?, url?, notes? })`** — edit; tenancy-safe.
- [ ] **`deleteResource({ id })`** — delete (join rows cascade away). Tenancy-
      safe via `userId` check before delete.
- [ ] **`linkTaskResource({ taskId, resourceId })`** — add a reference.
      **App-layer guard: `task.projectId === resource.projectId`** — a task may
      only reference resources in its own project. Reject (throw) otherwise.
      Idempotent (linking an already-linked pair is a no-op, not an error).
- [ ] **`unlinkTaskResource({ taskId, resourceId })`** — remove a reference.
      The resource stays on the project; only the link is removed.

### Widen two existing queries

- [ ] **`getProject`** (`projects/operations.ts`) — `include: { resources: { ...
      with task summaries } }` so the Project detail page has resources in one
      fetch (mirror `getProjectResources`'s shape, or have the page call
      `getProjectResources` separately — Build's call).
- [ ] **`getTask`** (`tasks/operations.ts`) — `include: { resources: true,
      project: { select: { id, name } } }` so the Task detail page can render
      linked resources and know the project for the add affordance.

### Register in `webapp/main.wasp.ts`

- [ ] Add `query`/`action` entries for each new op with correct `entities`
      (e.g. `getProjectResources` → `["Project","Task","Resource"]`;
      `linkTaskResource`/`unlinkTaskResource` → `["Task","Resource"]`;
      `createResource`/`updateResource`/`deleteResource` → `["Resource","Project"]`).

### UI — Project detail: Resources section (`ProjectDetailPage.tsx` + css)

Pattern follows `GoalDetailPage`'s "Linked projects" secondary section
(`aa-grouped__heading` + count + list). Placed **after** the task groups —
resources are reference material, secondary to action (respects "calm over
features").

- [ ] **Resources heading + count**, shown only when resources exist (empty
      section hidden — no clutter, no empty-state guilt UI).
- [ ] **Resource row:** title (rendered as an external link if `url` set, else
      plain), a notes preview (truncated), a muted chip "linked to N tasks" when
      N > 0, and row actions: **Edit** and **Delete**.
- [ ] **"Add resource" button** (secondary, like "Add task") → a `BottomSheet`
      form: title + URL + notes → `createResource`. Reuse the existing
      `BottomSheet` + `Overlays.css` `aa-picker__*` classes.
- [ ] **Delete-with-impact flow** (the core of the request): clicking Delete
      opens a confirm `BottomSheet` showing the resource title and **"N tasks
      reference this"** — each task listed with its status (Today / Upcoming /
      Someday / Done) as a chip and a link to `/app/tasks/:id`. If N = 0, show
      a calm "No tasks reference this." Confirm → `deleteResource`.
- [ ] **Edit** → same sheet, prefilled → `updateResource`.
- [ ] Cache invalidation: invalidate `getProject` / `getProjectResources` /
      `getProjects` on every mutation (match existing `ProjectDetailPage`
      patterns).

### UI — Task detail: Resources references (`TaskDetailPage.tsx` + css)

- [ ] **Only when the task has a `projectId`** — project-less (General) tasks
      cannot hold resources (they're project-owned). The whole resources region
      is hidden otherwise. No dead affordance.
- [ ] **Linked resources list:** title (link if `url`), notes preview, and an
      **Unlink** button per resource → `unlinkTaskResource` (resource stays on
      the project; only the reference is removed).
- [ ] **"Add resource"** → a `BottomSheet` with two paths:
  1. **New** — title + URL + notes → `createResource` (filed on the task's
     project), then `linkTaskResource`.
  2. **Use existing** — pick from the project's existing (not-yet-linked)
     resources → `linkTaskResource`. Already-linked ones greyed out / hidden.
- [ ] Cache invalidation: invalidate `getTask` / `getProject` /
      `getProjectResources` on every mutation.

### Triage + cleanup (forced by the schema change)

- [ ] **Triage resource branch** (`inbox/operations.ts:129`) — parent is now
      **project only**: require `projectId`, throw a clear error if missing
      (the existing message becomes "Resources must be filed under a project.").
      Drop the `goalId` handling.
- [ ] **Triage UI** (`TriagePage.tsx`) — the resource "File under" picker offers
      projects only (it already has an inline project picker; drop the
      goal-filing sub-picker / `parentGoalId` path for resources).
- [ ] **Delete dead code:** `webapp/src/components/ui/ResourcePickerSheet.tsx`
      (a project-or-goal picker exported but imported by nothing) and its barrel
      export in `components/ui/index.ts`.
- [ ] **Remove the `📎`/amber resource bits** in triage that referenced
      goal-filing, if any remain after the above.

### Docs cascade (AGENTS.md: "structure changes start in WORKFLOW.md")

Update the canonical doc first, then cascade to the docs it governs.

- [ ] **`docs/WORKFLOW.md`** §5 "Decisions locked": "Resources are filed under
      exactly one Project" (was "Project or Goal"); add the Task↔Resource
      reference as a locked concept.
- [ ] **`docs/DATA-MODEL.md`**: Resource = project-owned (lines 54–57); add the
      Task↔Resource many-to-many; update the triage table (line 93) and the
      promotion-paths note (105–106); update the locked decisions (169–172).
- [ ] **`docs/TRIAGE.md`**: resource spec row parent = "Project" (was
      "Project/Goal"); update the keymap note.
- [ ] **`docs/METHODOLOGY.md`**: PARA note — "filed under Projects" (was
      "Projects or Goals").
- [ ] **`docs/PAGES.md`** D1: the promised Resources list is now real; add the
      task-detail reference + delete-impact affordances.

### Tests (`*.test.ts`, Vitest) + verification

- [ ] **Resource ops:** create/update/delete; link/unlink; **same-project
      guard** on `linkTaskResource` (rejects cross-project; idempotent on
      re-link); delete severs references (task survives, summary count drops).
      Reuse `webapp/src/test/mockContext.ts` entity spies.
- [ ] **`wasp compile` clean** (not `tsc` — per `webapp/AGENTS.md`).
- [ ] **Existing unit + e2e suites still green** (triage e2e may assert the old
      resource goal-filing path — update to match the project-only flow).
- [ ] **Manual:** add a resource on a project, link it from two tasks, open the
      project's delete flow and confirm both tasks appear with status; delete;
      confirm the tasks survive and the references are gone.

## Non-goals

- **No file uploads / blob storage.** MVP Resources = links + notes (bookmarks),
  per `DATA-MODEL.md` locked decisions. File uploads are explicitly Phase 2 and
  need a storage backend (S3 / signed URLs / serving). Out of scope here.
- **No Resources on Goals.** Removed by design — the simplification the spec is
  built around. Goal-owned resources are gone, not deferred.
- **No Resource→Task promotion / Task→Resource demote.** Those triage-time
  type conversions (`DATA-MODEL.md:105-106`) are separate affordances and stay
  out of this spec.
- **No standalone `/app/resources` route.** Resources are surfaced in-context:
  on their project and on the tasks that reference them. No top-level resources
  list (keeps "the list is demoted").
- **No resource search / command-palette integration.** That belongs with
  `command-palette-search`, not here.
- **No counts/badges-as-motivation.** The "linked to N tasks" chip is
  informational (and load-bearing for the delete-impact flow), not a streak/
  guilt UI — keep it muted and calm, per PRODUCT.md / DESIGN.md.

## Open questions

- **`getProject` widening vs. a separate `getProjectResources` call.** Build
  chooses: either include resources in `getProject`'s return, or have the page
  call `getProjectResources` separately. The latter keeps `getProject` lean and
  avoids over-fetching when only tasks are needed. Lean: separate call.
- **"Use existing" picker empty state on the Task detail sheet.** If a project
  has no unlinked resources, the "Use existing" path is empty — show calm copy
  ("No other resources on this project yet.") rather than hiding the path.
- **External-link safety.** When a resource `url` is set, open in a new tab with
  `rel="noopener noreferrer"`. Confirm the design-system `Link`/anchor pattern;
  this is the one place user-controlled URLs are rendered as hrefs.

## Implementation notes (for Build)

- **Implicit M:N is the right call here** over a hand-written `TaskResource`
  join model: no extra fields on the link are needed, Prisma manages the join
  table, and the cascade semantics are exactly what we want (sever on either
  side's deletion). If a future spec wants per-link metadata (e.g. "why this
  resource matters for this task"), promote to an explicit join model then.
- **The same-project guard is app-layer, not DB-layer.** A DB-level check would
  need a composite constraint that Prisma's implicit M:N can't express cleanly.
  The `linkTaskResource` operation enforces it; keep the guard co-located with
  the link mutation so there's one chokepoint.
- **Reuse, don't rebuild.** `BottomSheet` + `Overlays.css` (`aa-picker__*`,
  `aa-snooze__*`) already cover the sheet/form styling. `GoalDetailPage`'s
  secondary-section markup (`aa-goal__projects`) is the structural template for
  the project's Resources section. `CreateInline` is *not* the right fit (it's
  single-field); the resource form has three fields, so use a `BottomSheet`
  with a small inline form.
- **Two-accent discipline.** Resource UI rides neutrals + (sparingly) the
  violet used for Project/Goal (`--aa-violet`). Status chips on the
  delete-impact sheet reuse the existing `Chip` variants (`teal` for Today,
  `muted` for Someday/done) — no new color.

## Prototypes

_(none — the surfaces are extensions of existing pages/components. The Project
Resources section mirrors `GoalDetailPage`'s "Linked projects" block; the
delete-impact sheet mirrors the existing `BottomSheet` + `SnoozeSheet` pattern.
No new UI paradigm.)_
