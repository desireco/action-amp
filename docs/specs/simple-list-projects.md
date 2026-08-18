---
feature: simple-list-projects
status: draft
spec_owner: discover
build_owner: build
kind: spec
---

# Feature: Simple-list Projects (LensType removal)

> Supersedes [`simple-list-lenses.md`](simple-list-lenses.md) (2026-08-18).
> Simple lists move from a Lens **type** to a Project **type**; the
> `LensType` discriminator is removed entirely. Implementation plan below.

## Confirmed decisions

- **Lens survives as pure scoping** (Work/Me, colors, ⌘L, `[[lens]]` tokens,
  lens provenance). Only the `LIFE_AREA`/`SIMPLE_LIST` discriminator and its
  machinery are removed. Every lens is a life area.
- **Simple-list projects are regular projects**: FREE can create them within
  the existing 3-project cap. No new Pro gate; the accidental Pro-only status
  (via Pro-only lens creation) disappears.

## Target architecture

Today: `Lens(type) → {Goal → Project → Task}` and `Lens(SIMPLE_LIST) →
ListItem`, with the whole app shell swapping modes on lens type.

After:

- `Lens` — no `type` field. Scoping only.
- `Project.type: ProjectType` (`STANDARD` | `SIMPLE_LIST`, default
  `STANDARD`). A SIMPLE_LIST project is a direct checklist: no goal, no tasks,
  no resources; it contains `ListItem`s. It lives in a lens like any project,
  appears on the Projects page, and opens at `/do/projects/:permalink`
  rendering the checklist instead of the task sections.
- `ListItem` re-homes from `lensId` to `projectId`.
- The "app mode" concept tied to lenses dies: `/do/list` route, the AppShell
  simple-list nav/dock/route-normalization, and the palette `lensTypes`
  filtering all go away. Triage's `list-item` decision targets a simple-list
  **project** instead of a lens.
- Completion still never feeds Today, focus, Review, or Logbook (unchanged
  semantics, new home).

---

## Work parts (commit-sized, in order)

### 1. Docs first — `docs/WORKFLOW.md` (canonical, per repo rules)

- §1 mental model: remove the two-type lens bullet; hierarchy becomes
  `Lens → Goal → Project (STANDARD|SIMPLE_LIST) → Tasks | ListItems`.
- §2.6 "Simple-list Area" → rewritten as a "Simple-list projects" subsection
  under §2.4 (Planning): checklist is the project's own view; direct add
  (`N`), share-to-list, triage `list-item`; completion stays out of
  Today/focus/Review/Logbook.
- §3: delete the `Lens.type` discriminator bullets; "Every List Item belongs
  to exactly one Simple-list Lens" → "…one Simple-list Project"; drop the
  type-conversion clause from the lens-config-Pro bullet.
- §5 "Decisions locked": add the 2026-08-18 entry (lists moved to project
  level; `LensType` removed; lists count toward project caps).

### 2. Schema + data migration (`wasp db migrate-dev --name simple_list_projects`, hand-edit the generated SQL)

Schema: add `ProjectType` enum + `Project.type`; add `ListItem.projectId`
(+ relation, index `(projectId, isDone, order)`); drop `Lens.type` +
`LensType`.

Data-preserving SQL, modeled on `20260815110000_remove_lens_identity_kind`:

1. Add `Project.type` (default `STANDARD`); add nullable `ListItem.projectId`.
2. Convert every SIMPLE_LIST lens → a Project row (`type='SIMPLE_LIST'`,
   `name=lens.name`, `permalink=slug(name)` with lens-id suffix on per-user
   collision, `lensId=` the user's `isIncluded` lens else earliest lens —
   every user has seeded Work/Me so this always resolves).
3. Backfill `ListItem.projectId` via a `WITH converted AS (INSERT … RETURNING)`
   CTE joining on `(userId, name, type)`.
4. `UPDATE InboxItem SET parsedLensId/parsedLens = NULL` and
   `Feedback.lensId = NULL` where they point at a SIMPLE_LIST lens (rare;
   feature shipped 2026-08-11).
5. `DELETE FROM "Lens" WHERE type='SIMPLE_LIST'` — safe: server guards
   (assertLifeAreaLens / requireSimpleListLens / triage dispatch guard)
   guaranteed such lenses own no goals/projects/tasks.
6. `SET NOT NULL` on `ListItem.projectId`; drop `ListItem.lensId`,
   `Lens.type`, `LensType`.

Verify with `wasp compile` + inspect dev DB.

### 3. Server: cores, ops, entitlements

- `simpleLists/operationsCore.ts`: `requireSimpleListProject`
  (project.type === SIMPLE_LIST); all ops keyed by `projectId` instead of
  `lensId`. **Lens-accessibility parity (review-verified):** today's ops gate
  on `assertLensAllowed(lensId)`; keep the equivalent by resolving
  `project.lensId` and running the same FREE lens gate, so a list living in
  the locked Work lens stays gated after a Pro→FREE downgrade.
- `lenses/operations(.ts|Core)`: drop `type` from create/`LensSummary`;
  delete `assertLensTypeChangeAllowed`; `deleteLens` loses same-type reassign
  filter and list-item moves (list items are no longer lens content).
- `projects/operations(.ts|Core)`: `createProject` accepts `type`;
  `createProject`/`updateProject` reject `goalId` on a SIMPLE_LIST project;
  `assertProjectTypeChangeAllowed` mirrors the old lens rule (type change
  only while the project has no tasks and no list items — blocked with an
  explanatory modal, same UX as LensesPage today); guard structured writes
  (`createTask` in project, resource ops) against SIMPLE_LIST projects;
  queries surface `type`.
- `billing/entitlements.ts` + `entitlementHttp.ts`: remove `resolveLensType`
  / `assertLifeAreaLens` / `LIFE_AREA_REQUIRED`; add the inverse guard
  (structured ops need a STANDARD project) where tasks/resources attach.
  Project caps already count all projects — no cap change needed.
- `inbox/operationsCore.ts` + `operations.ts`: **dispatch contract change
  (review-verified)** — today `buildDispatchPayload` (triageFlow.ts:116)
  carries the list destination as `lensId`; the `list-item` payload instead
  carries `projectId` (the list project), and `lensId` becomes optional for
  that decision. `list-item` requires destination
  `project.type === SIMPLE_LIST`; task/project/resource decisions reject
  SIMPLE_LIST targets.
- `inbox/operations.ts` `getProjectsForResolver`: the `type: "LIFE_AREA"`
  lens filter just disappears; extend the select with `permalink`, `type`,
  `lensColor`. Consumers: SharePage (lists optgroup + post-save navigation),
  CapturePopover project mentions (STANDARD only), TriagePage list picker
  (SIMPLE_LIST only).
- **Review/Logbook exclusions (review-verified — both query projects
  today):** `logbook/operationsCore.ts` completed-projects query and
  `reviews/operationsCore.ts` evidence `Project.findMany` add
  `type: "STANDARD"` so lists never appear there regardless of lifecycle.
- `app/operations.ts` `getAppData`: lenses without `type`; project counts now
  include lists automatically.
- `onboarding/operations.ts`: no change — `DEFAULT_LENSES` sets no `type`
  (verified); seeding survives the column drop untouched.
- `auth/patRoutes.ts`: `gateLens` drops `requiredType`/`lensType`;
  `/api/cli/lens/*` stops returning `type`; `/api/cli/project/*` gains `type`
  (+ open/checked counts for lists); capture `listId` validates a
  SIMPLE_LIST project; triage `list-item` gate switches to project.

### 4. App shell + palette (big net deletion)

- `app/lensContext.ts`: `ActiveLens` loses `type`.
- `app/AppShell.tsx`: delete `isSimpleListLens`, the `/do/list`
  route-normalization effect, the simple-list sidebar/dock variants, and the
  `activeLensType` prop pass.
- `search/paletteRegistry.ts` + `CommandPalette.tsx`: delete the `lensTypes`
  field and filtering; "Go to List" command removed (list projects surface
  via normal project search results).
- `main.wasp.ts`: remove `SimpleListRoute` (`/do/list`).

### 5. Projects UI

- `ProjectsPage.tsx`: create flow gains a Project/List type choice (calm
  toggle next to the existing `CreateInline` input, defaults Project);
  `createProject({ name, lensId, description, type })`; rows distinguish
  lists (calm label/icon, open-item counts); FREE cap copy unchanged.
- `ProjectDetailPage.tsx`: `type === 'SIMPLE_LIST'` renders the checklist
  (extracted from `SimpleListPage.tsx` internals — add/check/rename/delete,
  clear-checked, `n/j/k/space/e/Delete` shortcuts, attachments, source links)
  instead of task/goal/resource sections. **No reorder UI exists today**
  (review-verified — WORKFLOW §2.6 overstates it); keep parity, don't build
  one. The page has no keyboard handlers today, so the checklist's
  window-level keys port cleanly. The extracted component drops its own
  h1/purpose header — the page's breadcrumb + name provide context.
  Affordance matrix for lists: hide goal picker, due date, task/resource
  sections, attachment hero cover, completion (`isDone` is unreachable —
  UI-hidden, no server path); keep rename, move (all lenses are valid
  targets now), archive, and delete (cascades ListItems via `projectId`
  `onDelete: Cascade`). Empty-project type conversion modal.
- `SimpleListPage.tsx` deleted; `simpleLists/` becomes checklist component +
  ops keyed by projectId.

### 6. Triage + Share

- `inbox/TriagePage.tsx`: the type chooser offers List item unconditionally
  (the lens-type filtering at lines ~655–661 disappears); lens pills +
  `a/s d f` remain the first step for structured decisions; a list-item
  working set shows a flat simple-list project picker (lens-dotted, from the
  extended resolver) instead of lens pills; copy "Add to {list}". After a
  `list-item` dispatch, invalidate the checklist query — **review-verified
  gap: TriagePage invalidates getTasks for other decisions but never
  invalidates the list query today.**
- `share/SharePage.tsx` (review-verified details): the "Simple lists"
  optgroup comes from the extended `getProjectsForResolver` (drop the
  `getLenses` query — it exists only for the list optgroup and name lookup);
  `createListItem({ projectId })`; after saving, navigate to
  `/do/projects/:permalink` (permalink from the resolver entry) instead of
  writing `aa-lens-id` + redirecting to `/do/list`; remove the dead
  `lensId: destinationType === "list" ? … : undefined` ternary in the
  `createInboxItem` call (the list branch returns early above it).

### 7. CLI (`cli/`)

- `lens.ts`: remove `typeLabel`/type output and open/checked counts.
- `project.ts`: `(simple list)` marker in list + open/checked counts;
  `project show` for a list renders its items read-only (item add/toggle
  commands are an optional follow-up).
- `inbox.ts` triage (review-verified): `--lens-id` stops being required for
  `list-item`; the existing `--project-id` flag becomes the list destination
  (help text at line 10/62 updated).
- `capture.ts`: `--list-id` now takes a simple-list project id.
- `types.ts`: `Lens.type` out, `Project.type` in. Update `lens.test.ts`,
  `management.test.ts`, api tests.

### 8. Tests + e2e

Update: `lenses/*`, `simpleLists/*` (page tests move to the checklist
component), `AppShell.test.tsx`, `TriagePage.test.tsx`,
`CommandPalette.test.tsx`, `inbox/operations*.test.ts`,
`billing/entitlements*`, `projects/*`, `onboarding`, CLI tests. Add an e2e
spec for the list-project flow (create → add/check items → share-to-list →
triage list-item) — none exists today.

### 9. Doc cascade finish

`docs/DATA-MODEL.md`, `docs/TRIAGE.md`, `docs/PAGES.md`, `docs/PRICING.md`
(one line: lists count toward project caps), `docs/features/` (rewrite
`simple-list-lenses.md` → simple-list projects; update `projects.md`,
`custom-lenses.md`, `entitlements.md`, `cli.md`, `capture.md`,
`inbox-triage.md`, `command-palette.md`, `pwa-notifications.md`,
`logbook.md`), audit `docs/INTERACTION.md` for shell-mode mentions.
`docs/specs/simple-list-lenses.md` and
`docs/simple-list-lenses-task-queue.md` get supersession notes;
`docs/features/README.md` index entry renamed. Roadmap untouched (no admin
work involved).

---

## Non-goals / accepted losses

- **Lens colors on lists are dropped** — projects have no color field; the
  converted lists lose their hue (identity stays on lenses only).
- **`[[list-name]]` capture tokens disappear** — tokens resolve against
  lenses only, and the converted lenses are gone; a list destination is
  chosen in triage or share, not capture. A `[[list:]]` token syntax is a
  non-goal.
- **No reorder UI** — none exists today (docs overstate it); parity kept.
- **List completion/archive semantics** — `isDone` unreachable for lists
  (UI-hidden); archive stays available for decluttering; Review/Logbook
  exclude lists by type filter regardless of lifecycle.
- `[[lens]]` capture hints pointing at converted lenses become neutral
  (nulled in migration); resolver falls back to active lens.
- Permalink uniquification in SQL needs care (slug + lens-id suffix on
  collision) — one-time, low-volume data (feature is ~1 week old).
- Each part commits separately with `wasp compile` + feature vitest green
  before the next; WORKFLOW.md lands first per repo rules.
