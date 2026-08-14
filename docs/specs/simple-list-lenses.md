---
feature: simple-list-lenses
status: review
spec_owner: discover
build_owner: build
kind: spec
---

# Feature: Simple-list Lenses

> Product plan approved and implementation code-verified 2026-08-10. Status is
> `review`, not `done`: automated verification passes, but the full browser
> persistence path still needs a Wasp process started with the new generated
> route table.
>
> Small-model execution queue: [`../simple-list-lenses-task-queue.md`](../simple-list-lenses-task-queue.md).
> It splits this spec into one-task-per-run briefs for Terra, Luna, or Spark.

## Summary

ActionAmp gains a second Lens type: **Simple list**. A Simple-list Lens is one
direct checklist, suitable for groceries, packing, errands, or other lists that
do not need ActionAmp's task hierarchy.

A Simple-list Lens has:

- one flat list;
- direct item creation;
- check, reopen, rename, and remove actions;
- no Goals;
- no Projects;
- no Lens-scoped Inbox, but access to universal Capture and Inbox;
- no Today, Upcoming, Someday, Do, Focus, Review, or Logbook participation.

The existing Lens behavior becomes the **Life area** type. Existing Lenses and
the seeded Work and Me Lenses remain Life areas.

## Product decisions

### Lens type

Settings uses a mutually exclusive **Lens type** field, not a checkbox:

1. **Life area** — Tasks, Projects, Goals, planning, focus, and review.
2. **Simple list** — add items directly and check them off.

The control may render as a select or two radio cards. Radio cards are preferred
because the explanatory copy matters more than saving vertical space.

Type is selected when creating a Lens. An empty custom Lens may later switch
between Life area and Simple list because no content meaning changes. Seeded
Work and Me Lenses never switch type. A populated custom Lens also keeps its
type: converting Projects, Goals, Tasks, focus history, or ListItems would be
ambiguous. Selecting the unavailable type opens an explanatory modal naming the
blocking content and telling the user to move or remove it first. Server checks
the same invariant before every type update.

### Entitlement and limits

- Simple lists are custom Lenses and use the existing Pro Lens entitlement.
- A Simple-list Lens counts toward `PRO_LIMITS.lenses`.
- There is no separate list-item cap in v1.
- Seeded `PERSONAL` and `WORK` Lenses must remain Life areas.
- `LensKind` remains the stable entitlement identity
  (`PERSONAL | WORK | CUSTOM`). Lens type is a separate behavioral property.

### Completion semantics

Checking a list item means only “checked on this list.” It is not an ActionAmp
Task completion.

Therefore list items do not contribute to:

- Today or Done today;
- the Next/Do candidate pool;
- Review accomplishments;
- Logbook history;
- focus time or sessions;
- Task, Project, or Goal counts;
- task-completion product analytics.

### Capture and triage

Simple-list items have two first-class entry paths:

- direct add on `/do/list`, which creates a ListItem immediately;
- universal Capture → Inbox → Triage, where selecting a Simple-list Lens
  performs a compact List Item confirmation and skips structured-work fields.

Simple-list Lenses participate in `[[lens]]` autocomplete and resolution. They
remain excluded from Project resolution and Task, Project, Goal, and Resource
creation. Server operations resolve Lens type and allow only compatible pairs:
Life area + structured outcome, or Simple list + List Item.

Captured body text and source URL move onto the ListItem automatically, without
adding triage questions. Image-backed Inbox items cannot be represented by v1
ListItem and must remain safely in Inbox with a clear error; dispatch never
silently drops an attachment.

### Deletion and reassignment

Lens deletion may reassign content only to another Lens of the same type:

- Life area → Life area;
- Simple list → Simple list.

Cross-type reassignment is rejected. Moving structured work into a checklist,
or checklist rows into the focus engine, would silently change meaning.

## Interface

### Settings → Lenses

Creation form:

```text
Name       [ Shopping                         ]
Purpose    [ Groceries and household supplies ]

Lens type
(*) Life area
    Tasks, projects, goals, planning, and review.

( ) Simple list
    Add items directly and check them off.

Color      o o o o o

                         Cancel   Create lens
```

Management rows adapt to type:

```text
Shopping     Simple list
Groceries and household supplies
8 open · 3 checked                         Edit  Delete
```

Life-area rows retain Goal, Project, and Task counts. Edit offers both types for
custom Lenses. Empty custom Lenses can save the new type. Selecting a different
type on a populated Lens opens a `Can't change lens type yet` modal explaining
the block; no form state or content is changed. Seeded rows show fixed Life-area
metadata with copy explaining that default Lenses always remain Life areas.

### Simple-list page

Route: `/do/list`, scoped by active Lens.

```text
Shopping
Groceries and household supplies

[ Add an item...                              ]

o Milk
o Coffee
o Dishwasher tablets

Checked 2
x Bananas
x Bread

Clear checked
```

Behavior:

- `Enter` in the add field creates an item and keeps focus in the field.
- Open items render first, ordered by `order`, then creation time.
- Checked items render in a lower section and can be reopened.
- Item text can be renamed inline.
- Item removal is direct and row-scoped.
- **Clear checked** uses a confirmation because it permanently removes data.
- Empty, loading, saving, and mutation-error states are explicit.
- Completion uses teal as system state; Lens color remains identity only.

Keyboard baseline:

- `N` — focus the add field;
- `J` / `K` — move the active row;
- `Space` — check or reopen the active row;
- `E` — edit the active row;
- `Delete` / `Backspace` — remove the active row with the same confirmation
  policy as pointer interaction;
- `Esc` — leave editing or selection state;
- `Command+L` — open the Lens switcher.

Shortcuts do not fire while typing, except the add field's own `Enter` action.

### Shell and navigation

When a Simple-list Lens is active:

- selecting it routes to `/do/list`;
- desktop navigation shows universal **Inbox** plus **List**, while hiding
  Today, Do, Plan, and Review groups;
- the Capture FAB and `⌘K` remain available;
- Settings, account controls, theme, feedback, and Lens switching remain;
- mobile navigation shows **Inbox**, **List**, and **Lens**;
- commands that require a Life-area Lens are hidden or disabled with clear
  copy.

When switching from a Simple list to a Life area, `/do/list` routes to `/do`.
If local storage restores a Simple-list Lens while the browser opens `/do`, the
shell normalizes the route to `/do/list` after Lens data resolves.

## Data model

Add a behavioral Lens type and a dedicated list-item entity:

```prisma
enum LensType {
  LIFE_AREA
  SIMPLE_LIST
}

model Lens {
  // Existing fields remain.
  type      LensType  @default(LIFE_AREA)
  listItems ListItem[]
}

model ListItem {
  id          String   @id @default(uuid())
  text        String
  isDone      Boolean  @default(false)
  order       Int      @default(0)
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId String

  lens   Lens   @relation(fields: [lensId], references: [id], onDelete: Cascade)
  lensId String

  @@index([lensId, isDone, order])
}
```

Every existing Lens receives `LIFE_AREA` through the field default and
migration. No existing content moves.

### Why ListItem is not Task

`Task` is the atomic ActionAmp focus object. It carries priority, size, status,
due date, Project/Goal relationships, task updates, focus sessions, Outcome,
Review evidence, and Logbook semantics.

Reusing Task would require exclusions across every Task consumer and could leak
shopping rows into focus or accomplishment history when a new feature forgets
one filter. `ListItem` makes the domain boundary structural and keeps its
operations small.

The Lens itself is the list. No additional `List` container is needed.

## Server operations

Create a vertical feature under `webapp/src/simpleLists/`:

- `operationsCore.ts` — pure tenant-scoped data layer;
- `operations.ts` — authenticated Wasp wrappers;
- `SimpleListPage.tsx` and `SimpleListPage.css`;
- focused core and UI tests.

Operations:

- `getSimpleList({ lensId })`;
- `createListItem({ lensId, text })`;
- `renameListItem({ id, text })`;
- `setListItemDone({ id, isDone })`;
- `deleteListItem({ id })`;
- `clearCompletedListItems({ lensId })`.

Every operation verifies:

- authenticated user owns the Lens or item;
- Lens type is `SIMPLE_LIST`;
- text is trimmed, required, and length-bounded;
- completion sets or clears `completedAt`;
- writes cannot cross Lens ownership.

Register `ListItem` on every relevant Wasp Query/Action entity list so Wasp's
entity-based cache invalidation refreshes the page without manual invalidation.

## Focused implementation actions

Each action is one focused commit or handoff. Do not combine unrelated slices.

### Action 1 — Canonical contract

**Files:** `docs/WORKFLOW.md`, this spec, `docs/DATA-MODEL.md`,
`docs/INTERACTION.md`, `docs/TRIAGE.md`, `docs/PAGES.md`.

**Work:** define both Lens types, direct-list flow, shell behavior, and explicit
exclusions. Update `docs/features/` catalog status.

**Verification:** terminology and structure agree across the cascade.

**Stop condition:** no document implies every Lens has triage, Goals, Projects,
or focus.

### Action 2 — Schema and migration

**Files:** `webapp/schema.prisma`, generated migration only.

**Work:** add `LensType`, `Lens.type`, `ListItem`, and User/Lens relations.
Generate migration named `simple_list_lenses`.

**Verification:** inspect SQL; run `./scripts/wasp-safe.sh compile`.

**Stop condition:** existing data remains intact and generated Prisma types
contain `LensType` and `ListItem`.

### Action 3 — List domain operations

**Files:** `webapp/src/simpleLists/operationsCore.ts`, `operations.ts`, tests,
and `webapp/main.wasp.ts`.

**Work:** implement all list reads/mutations and type/ownership invariants.

**Verification:** focused tests cover wrong owner, wrong Lens type, empty text,
completion reversal, deletion, and clear-completed behavior.

**Stop condition:** list lifecycle works through server operations without UI.

### Action 4 — Lens management

**Files:** `webapp/src/lenses/operations.ts`, `operationsCore.ts`,
`LensesPage.tsx`, CSS, and tests.

**Work:** carry type through Lens reads/writes; add creation and edit selectors;
show type-appropriate counts; allow empty custom-Lens conversion; explain
blocked populated conversions in a modal; keep seeded types fixed; restrict
reassignment targets.

**Verification:** tests cover seeded type restriction, empty conversion,
populated conversion block and modal, creation, response shape, counts, and
same-type reassign rules.

**Stop condition:** management cannot create an invalid Lens or propose an
invalid conversion.

### Action 5 — Active-Lens context and boundaries

**Files:** `webapp/src/app/operations.ts`, `AppShell.tsx`, `lensContext.ts`,
triage/capture resolvers, Project/Goal/Task creation boundaries, tests.

**Work:** return Lens type from `getAppData`; pass it through context and Lens
switching; enforce type-compatible Task/Project/Goal/List Item operations.

**Verification:** UI and server tests prove a Simple-list Lens cannot acquire a
Task, Project, or Goal.

**Stop condition:** stale or custom clients cannot cross the type boundary.

### Action 6 — Simple-list page

**Files:** `webapp/src/simpleLists/SimpleListPage.tsx`, CSS, component tests,
and `webapp/main.wasp.ts` route registration.

**Work:** add `/do/list`; implement add/check/reopen/rename/delete/clear,
sections, keyboard actions, and accessible states.

**Verification:** focused component tests plus keyboard and screen-reader name
checks.

**Stop condition:** full checklist lifecycle works without another page.

### Action 7 — Type-aware shell

**Files:** `webapp/src/app/AppShell.tsx`, shell styles, Lens switcher, command
palette, mobile navigation, tests.

**Work:** normalize routes on Lens change/load; render universal Inbox plus
List navigation; retain Capture, Settings/account/Lens controls; filter
incompatible structured-work commands.

**Verification:** shell tests cover both switching directions, stored Lens
restoration, desktop navigation, mobile navigation, and Capture visibility.

**Stop condition:** Simple-list Lens never exposes empty Life-area pages.

### Action 8 — Cross-surface integration

**Files:** Lens deletion, CLI Lens types/output, CLI scoped-command errors,
command-palette Lens destinations, docs/features entry.

**Work:** include ListItem counts and same-type reassignment; expose Lens type
to clients; provide clear Life-area-required errors.

**Verification:** web and CLI focused tests.

**Stop condition:** every existing Lens consumer handles both types honestly.

### Action 9 — Full verification

Run serially:

1. Focused Lens and ListItem tests.
2. Full webapp test suite.
3. `./scripts/wasp-safe.sh compile`.
4. CLI tests and build.
5. Browser QA only against a confirmed ActionAmp server; do not start one
   without approval.

Browser acceptance path:

1. Create Shopping as Simple list.
2. Switch into it.
3. Add, check, reopen, rename, and delete items.
4. Reload and verify persistence.
5. Clear checked items.
6. Switch to a Life area and verify normal shell restoration.
7. Verify list items remain absent from Today, Do, triage, Review, and Logbook.
8. Repeat core path at mobile width.

## Done conditions

- [x] Existing Lenses migrate to `LIFE_AREA` without content changes.
- [x] Pro user can create a `SIMPLE_LIST` Lens in Settings.
- [x] Seeded Work and Me Lenses cannot become Simple lists.
- [x] Simple-list Lens shows only its checklist workflow.
- [x] User can add, check, reopen, rename, delete, and clear checked items.
- [ ] Checklist state persists across reload and Lens switching.
- [x] Universal Capture and Inbox remain available in a Simple-list Lens.
- [x] Triage can convert a captured item into a ListItem without task metadata.
- [x] Captured body/source context is preserved and attachments are never lost.
- [x] Server rejects Task, Project, and Goal creation in a Simple-list Lens.
- [x] List items never appear in Today, Do, Focus, Review, or Logbook.
- [x] Lens deletion moves Simple-list items only to another Simple-list Lens.
- [x] Desktop and mobile navigation normalize correctly between Lens types.
- [x] Focused tests, full webapp tests, CLI tests/build, and Wasp compile pass.

### Verification record — 2026-08-10

- Full webapp suite after the universal-triage correction: 75 files, 972 tests passed.
- Final explicit-Lens precedence and source-link safety slice: 4 files, 47 tests passed.
- Wasp compile: passed; existing React Router and Morgan override warnings only.
- CLI: 8 files, 93 tests passed; TypeScript build passed.
- Marketing site: Astro production build passed, 30 pages generated.
- Browser: not run for the corrected flow. No current app server was attached,
  and the generate-only migrations were not applied or used to start one.
- Deployment: not run. Product acceptance: not run.

## Deferred follow-ups

- Manual drag/reorder. The schema reserves `order`; v1 may use append order.
- Global search result kind `list-item`, linking to
  `/do/list?item=<id>` and highlighting the row.
- CLI list-item CRUD.
- Sharing or collaboration.
- Multiple lists inside one Lens.
- Type conversion or migration tools.
- Templates such as Groceries, Packing, or Books.
