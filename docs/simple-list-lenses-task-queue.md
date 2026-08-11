# Simple-list Lenses — Model-friendly Task Queue

> Queue state: **active; correction lane authorized**. Original SL01-SL13 were
> completed serially 2026-08-10. Product correction SL14-SL20 was authorized
> 2026-08-10 after universal Inbox behavior was clarified.
>
> Product contract: [`specs/simple-list-lenses.md`](specs/simple-list-lenses.md).

## Model recommendation

Use **Terra** to own the whole feature or any cross-cutting integration task.
Use **Luna** for most bounded implementation tasks after this queue has fixed
the decisions and file boundaries. Use **Spark** only for narrow tasks whose
inputs, outputs, and checks fit in one brief.

Local Codex model registry describes:

| Model | Local description | Best use here |
| --- | --- | --- |
| Terra | Balanced agentic coding model for everyday work | Whole feature, structural docs, boundary audit, shell integration, final verification |
| Luna | Fast and affordable agentic coding model | Schema, operations, settings, page implementation, CLI updates |
| Spark | Ultra-fast coding model | Pure core + tests, one component slice, small documentation updates |

Recommended execution:

- **Safest:** Terra completes tasks in order, one task per run.
- **Best cost/speed:** Luna completes most tasks; Terra handles `SL01`, `SL08`,
  `SL10`, and `SL12`.
- **Fastest mixed:** Spark handles `SL03`, `SL06`, and `SL13`; Luna handles the
  bounded application tasks; Terra handles integration and final review.

Do not give Spark the entire spec in one run. Feature crosses canonical docs,
Prisma, Wasp config, server boundaries, desktop/mobile shell behavior, command
palette, triage, Lens deletion, and CLI semantics.

## Execution contract

Every run must follow these rules:

1. Execute exactly one task id.
2. Read root `AGENTS.md`, `webapp/AGENTS.md` when task touches `webapp/`, this
   queue, the product spec, and only the task's listed inputs.
3. Work on `main`; do not create a branch unless user asks.
4. Inspect `git status --short` before editing. Preserve unrelated changes.
5. Edit only **Allowed paths**. If another path is required, stop and report it.
6. Follow existing vertical feature patterns. Do not introduce unrelated
   abstractions or cleanup.
7. Run every check listed under **Verification**. The checks are explicitly
   required, including for Spark.
8. Do not start or restart a dev server. Browser QA belongs only to `SL12` and
   still requires an already-running confirmed ActionAmp server or user approval.
9. Do not commit, push, deploy, or migrate production data unless user
   explicitly asks. This queue's explicit whole-queue authorization permits
   only its own `parked`/`active` state and task `pending`/`in_progress`/
   `done`/`blocked` bookkeeping.
10. Stop after task verification. Do not begin the next task automatically.

Final response HANDOFF format:

```text
TASK: SLxx
RESULT: complete | partial | blocked
FILES: exact changed paths
CHECKS: exact commands and results
DEFERRED: anything intentionally left for later task ids
NEXT: next dependency-satisfied task id
```

If partial or blocked, leave truthful evidence. Passing a focused test is not
full-feature completion.

## Queue

### SL01 — Canonical product contract

**Status:** done  
**Preferred model:** Terra high  
**Acceptable model:** Luna high  
**Depends on:** none

**Goal:** make canonical structure acknowledge Life-area and Simple-list Lens
types before implementation starts.

**Allowed paths:**

- `docs/WORKFLOW.md`
- `docs/DATA-MODEL.md`
- `docs/INTERACTION.md`
- `docs/TRIAGE.md`
- `docs/PAGES.md`
- `docs/specs/simple-list-lenses.md`

**Required changes:**

- Define `LIFE_AREA` and `SIMPLE_LIST` behavior.
- Preserve Capture → Inbox → Triage for Life areas.
- Define direct creation for Simple lists.
- Record shell, Review, Logbook, Today, and focus exclusions.
- Remove or qualify every absolute statement that all Lenses contain Tasks,
  Projects, Goals, or triage destinations.
- Do not change implementation-status claims.

**Verification:**

- `rg -n "Simple list|SIMPLE_LIST|Life area|LIFE_AREA" docs/WORKFLOW.md docs/DATA-MODEL.md docs/INTERACTION.md docs/TRIAGE.md docs/PAGES.md`
- `git diff --check`

**Stop condition:** canonical docs agree on structure. No code changes.

### SL02 — Prisma model and migration

**Status:** done  
**Preferred model:** Luna high  
**Acceptable model:** Terra medium  
**Depends on:** `SL01`

**Goal:** add `LensType` and dedicated `ListItem` storage without changing
existing content.

**Allowed paths:**

- `webapp/schema.prisma`
- `webapp/migrations/<new>_simple_list_lenses/migration.sql`

**Required inputs:**

- `webapp/schema.prisma`
- latest two existing migration directories for local migration style
- data-model section in product spec

**Required changes:**

- Add `LensType { LIFE_AREA SIMPLE_LIST }`.
- Add `Lens.type @default(LIFE_AREA)` and `Lens.listItems`.
- Add `User.listItems`.
- Add `ListItem` exactly as product spec defines.
- Generate migration named `simple_list_lenses`.
- Inspect SQL. Never reset database.

**Verification:**

- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`
- Report whether migration was generated only or also applied locally.

**Stop condition:** schema compiles and migration contains no destructive SQL.

### SL03 — Pure ListItem core and tests

**Status:** done  
**Preferred model:** Spark high  
**Acceptable model:** Luna medium  
**Depends on:** `SL02`

**Goal:** implement tenant-safe ListItem behavior without Wasp wrappers or UI.

**Allowed paths:**

- `webapp/src/simpleLists/operationsCore.ts`
- `webapp/src/simpleLists/operationsCore.test.ts`

**Required inputs:**

- `webapp/src/lenses/operationsCore.ts`
- `webapp/src/projects/operationsCore.ts`
- `webapp/src/tasks/operationsCore.test.ts`
- server-operations section in product spec

**Required behavior:**

- Get list ordered open first, then `order`, then `createdAt`.
- Create trimmed non-empty item with bounded length and append order.
- Rename with same validation.
- Set explicit done state and set/clear `completedAt`.
- Delete one owned item.
- Clear completed items in one owned Simple-list Lens.
- Reject missing owner, cross-tenant item, and non-`SIMPLE_LIST` Lens.

**Verification:**

- `cd webapp && npm test -- src/simpleLists/operationsCore.test.ts`
- `git diff --check`

**Stop condition:** core and focused tests pass. Do not touch Wasp config or UI.

### SL04 — Wasp operations and registration

**Status:** done  
**Preferred model:** Luna medium  
**Acceptable model:** Terra medium  
**Depends on:** `SL03`

**Goal:** expose ListItem core through authenticated Wasp operations with
entity-based cache invalidation.

**Allowed paths:**

- `webapp/src/simpleLists/operations.ts`
- `webapp/src/simpleLists/operations.test.ts`
- `webapp/main.wasp.ts`

**Required inputs:**

- `webapp/src/simpleLists/operationsCore.ts`
- `webapp/src/lenses/operations.ts`
- operation registration blocks in `webapp/main.wasp.ts`

**Required changes:**

- Add typed authenticated wrappers for all six ListItem operations.
- Register imports and Query/Actions in Wasp Spec format.
- Declare `Lens` and `ListItem` entities wherever read or mutated.
- Rely on Wasp entity invalidation; add no manual query invalidation.

**Verification:**

- `cd webapp && npm test -- src/simpleLists/operations.test.ts`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** generated operation types compile and wrapper tests pass.

### SL05 — Lens server contracts and counts

**Status:** done  
**Preferred model:** Luna high  
**Acceptable model:** Terra medium  
**Depends on:** `SL02`, `SL04`

**Goal:** make Lens CRUD and read models type-aware.

**Allowed paths:**

- `webapp/src/lenses/operations.ts`
- `webapp/src/lenses/operationsCore.ts`
- `webapp/src/lenses/operations.test.ts`
- `webapp/src/lenses/operationsCore.test.ts`
- Lens operation declarations in `webapp/main.wasp.ts`

**Required changes:**

- Return `type` from list/detail reads.
- Life-area counts remain Goals, Projects, Tasks.
- Simple-list counts return open and checked ListItems.
- `createLens` accepts type; seeded Lens types remain fixed.
- `updateLens` cannot change type.
- Reassignment targets must share type.
- Lens hard-delete emptiness check includes ListItems.

**Verification:**

- `cd webapp && npm test -- src/lenses/operationsCore.test.ts src/lenses/operations.test.ts`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** type and count contracts are stable for UI and CLI consumers.

### SL06 — Lens Settings UI

**Status:** done  
**Preferred model:** Spark high  
**Acceptable model:** Luna medium  
**Depends on:** `SL05`

**Goal:** let Pro users create a Simple-list Lens and understand Lens type.

**Allowed paths:**

- `webapp/src/lenses/LensesPage.tsx`
- `webapp/src/lenses/LensesPage.css`
- `webapp/src/lenses/LensesPage.test.tsx`

**Required inputs:**

- existing Lens page files
- Settings interface section in product spec
- `webapp/src/styles/tokens.css` read-only

**Required changes:**

- Add two-option Lens type field during creation.
- Default to Life area.
- Show type as read-only during edit.
- Show Goal/Project/Task counts for Life areas.
- Show open/checked counts for Simple lists.
- Filter reassignment choices to same type.
- Preserve Pro gate, color palette, calm copy, and existing responsive style.

**Verification:**

- `cd webapp && npm test -- src/lenses/LensesPage.test.tsx`
- `git diff --check`

**Stop condition:** Settings UI produces only valid server payloads. Do not add
list page or shell routing.

### SL07 — Active-Lens type plumbing

**Status:** done  
**Preferred model:** Luna medium  
**Acceptable model:** Spark high  
**Depends on:** `SL05`

**Goal:** make Lens type available to the app shell and pages without changing
navigation yet.

**Allowed paths:**

- `webapp/src/app/operations.ts`
- `webapp/src/app/operations.test.ts`
- `webapp/src/app/lensContext.ts`
- type-only Lens mapping portions of `webapp/src/app/AppShell.tsx`

**Required changes:**

- Include `type` in `getAppData.lenses`.
- Add type to active Lens context.
- Carry type through Lens options and active value without behavior changes.
- Update fixtures and tests.

**Verification:**

- `cd webapp && npm test -- src/app/operations.test.ts`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** consumers can read Lens type. Navigation remains unchanged.

### SL08 — Life-area server boundaries

**Status:** done  
**Preferred model:** Terra high  
**Acceptable model:** Luna xhigh  
**Depends on:** `SL05`, `SL07`

**Goal:** prevent Task, Project, Goal, capture, or triage flows from targeting a
Simple-list Lens.

> Superseded product boundary: SL14-SL19 retain Task/Project/Goal rejection but
> restore universal Capture/Inbox and add type-safe ListItem triage.

**Allowed paths:**

- `webapp/src/billing/entitlements.ts`
- `webapp/src/billing/entitlementHttp.ts`
- `webapp/src/inbox/operations.ts`
- `webapp/src/inbox/operationsCore.ts`
- `webapp/src/inbox/TriagePage.tsx`
- `webapp/src/projects/operations.ts`
- `webapp/src/projects/operationsCore.ts`
- `webapp/src/goals/operations.ts`
- `webapp/src/tasks/operations.ts`
- directly corresponding focused tests

**Required changes:**

- Add one shared server assertion for “Lens supports Life-area workflow.”
- Reject Task, Project, Goal, and triage writes for Simple-list Lenses.
- Exclude Simple-list Lenses from triage choices.
- Exclude Simple-list names from `[[lens]]` autocomplete/resolution.
- Keep entitlement checks separate from type checks.
- Return calm, specific client errors.

**Verification:**

- Run focused tests for every touched feature.
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** direct server calls cannot cross type boundary; existing
Life-area behavior remains covered.

### SL09 — Simple-list page and route

**Status:** done  
**Preferred model:** Luna high  
**Acceptable model:** Terra medium  
**Depends on:** `SL04`, `SL07`

**Goal:** build complete checklist surface at `/app/list` without shell changes.

**Allowed paths:**

- `webapp/src/simpleLists/SimpleListPage.tsx`
- `webapp/src/simpleLists/SimpleListPage.css`
- `webapp/src/simpleLists/SimpleListPage.test.tsx`
- page import and route declaration in `webapp/main.wasp.ts`

**Required changes:**

- Add input, open rows, checked section, inline rename, remove, and clear checked.
- Implement documented keyboard actions without firing while typing.
- Add loading, empty, saving, and mutation-error states.
- Use existing UI primitives and token system.
- Render an honest incompatible-Lens state if route opens under Life area.

**Verification:**

- `cd webapp && npm test -- src/simpleLists/SimpleListPage.test.tsx`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** page lifecycle passes component tests. Do not alter shell nav.

### SL10 — Type-aware desktop/mobile shell

**Status:** done  
**Preferred model:** Terra high  
**Acceptable model:** Luna xhigh  
**Depends on:** `SL07`, `SL09`

**Goal:** switch between full ActionAmp workflow and list-only workflow without
dead routes or hidden escape paths.

**Allowed paths:**

- `webapp/src/app/AppShell.tsx`
- `webapp/src/app/AppShell.css`
- `webapp/src/app/AppShell.test.tsx`
- directly used shell navigation tests

**Required changes:**

- Simple-list selection routes to `/app/list`.
- Life-area selection from `/app/list` routes to `/app`.
- Stored Simple-list Lens normalizes `/app` to `/app/list` after data resolves.
- Desktop Simple-list shell shows List plus persistent account/settings/Lens
  controls; hides Inbox, Today, Do, Plan, Review, and Capture FAB.
- Mobile Simple-list shell shows List and Lens without exposing Life-area routes.
- Preserve `Command+L` and existing Free gating.
- Avoid redirect loops during initial query loading.

**Verification:**

- `cd webapp && npm test -- src/app/AppShell.test.tsx`
- run any existing Lens switcher/popover tests affected by fixture changes
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** both Lens types have reachable, internally consistent shells.

### SL11 — CLI and command-palette semantics

**Status:** done  
**Preferred model:** Luna high  
**Acceptable model:** Terra medium  
**Depends on:** `SL05`, `SL08`, `SL10`

**Goal:** ensure existing non-page Lens consumers report type honestly.

**Allowed paths:**

- `cli/src/commands/lens.ts`
- `cli/src/commands/lens.test.ts`
- `cli/src/types.ts`
- Lens PAT route portions of `webapp/src/auth/patRoutes.ts`
- command-palette Lens mapping/selection files and corresponding tests

**Required changes:**

- Add Lens type to CLI JSON and human output.
- Do not promise `now / project / goal` commands after switching to Simple list.
- Produce clear Life-area-required errors for incompatible CLI commands.
- Command-palette Lens switch opens `/app/list` for Simple lists.
- Item-level Simple-list search remains deferred.

**Verification:**

- `cd cli && npm test -- src/commands/lens.test.ts`
- `cd cli && npm run build`
- run focused command-palette tests
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** web and CLI Lens switching agree on type behavior.

### SL12 — Integration verification and focused repair

**Status:** done  
**Preferred model:** Terra xhigh  
**Acceptable model:** Luna max  
**Depends on:** `SL01` through `SL11`

**Goal:** verify complete story and repair only defects directly caused by this
feature.

**Allowed paths:** files changed by `SL01` through `SL11`, plus focused E2E tests
under `webapp/e2e/` if coverage is missing.

**Required checks, serially:**

1. All focused Lens/ListItem tests.
2. Full webapp test suite: `cd webapp && npm test`.
3. Wasp compile: `cd webapp && ./scripts/wasp-safe.sh compile`.
4. CLI suite and build: `cd cli && npm test && npm run build`.
5. `git diff --check`.
6. Browser path from product spec only when a confirmed ActionAmp server is
   already running or user approved starting it.

**Required audit:**

- No ListItem in Today, Do, Focus, Review, or Logbook.
- No incompatible structured outcome in a Simple-list Lens. Superseded by
  SL14-SL19 for universal Capture/Inbox and ListItem triage.
- No route normalization loops.
- Free gating still branches on `LensKind`, not `LensType`.
- Existing data migration is non-destructive.
- Desktop and mobile shells both retain Lens switching and Settings access.

**Stop condition:** all required non-browser checks pass. Report browser QA
separately as run, not run, or blocked.

### SL13 — Feature catalog and final documentation status

**Status:** done  
**Preferred model:** Spark high  
**Acceptable model:** Luna medium  
**Depends on:** `SL12`

**Goal:** record verified implementation truth without overstating deployment.

**Allowed paths:**

- `docs/features/simple-list-lenses.md`
- `docs/features/README.md`
- `docs/specs/simple-list-lenses.md`
- `docs/ROADMAP.md` only if user explicitly asks to update roadmap state

**Required changes:**

- Add code-verified feature entry.
- Mark spec `done` only when every done condition has evidence.
- Distinguish focused tests, full tests, compile, browser QA, deployment, and
  product acceptance.
- Do not claim deployment unless deployment happened and was verified.

**Verification:**

- `git diff --check`
- Check every new implementation-status sentence against `SL12` evidence.

**Stop condition:** docs match verified state. Do not implement or repair code.

## Correction lane — universal Inbox + Simple-list triage

### SL14 — Correct product contract

**Status:** done  
**Preferred model:** Terra high  
**Acceptable model:** Luna high  
**Depends on:** `SL13`

**Goal:** restore Capture and Inbox as universal surfaces while keeping
Simple-list output semantically flat.

**Allowed paths:** canonical workflow/triage/data/page docs, this spec, feature
entry, and this queue.

**Required changes:** define direct-add and captured-add paths; lock compact
ListItem triage; preserve body/source automatically; reject attachment-backed
dispatch without deleting InboxItem; retain Task/Project/Goal boundaries.

**Verification:** terminology search and `git diff --check`.

**Stop condition:** docs agree on universal intake and type-specific outputs.

### SL15 — Captured context on ListItem

**Status:** done  
**Preferred model:** Terra high  
**Acceptable model:** Luna xhigh  
**Depends on:** `SL14`

**Goal:** let triaged checklist rows retain useful captured context without
adding task semantics.

**Allowed paths:**

- `webapp/schema.prisma`
- one new migration under `webapp/migrations/`
- `webapp/src/simpleLists/operationsCore.ts`
- `webapp/src/simpleLists/operationsCore.test.ts`
- `webapp/src/simpleLists/SimpleListPage.tsx`
- `webapp/src/simpleLists/SimpleListPage.css`
- `webapp/src/simpleLists/SimpleListPage.test.tsx`

**Required changes:** add optional `content` and `sourceUrl`; include them in
reads; render calm supporting context/link; keep direct add text-only; do not
add task fields or attachment ownership.

**Verification:** focused Simple-list tests, Wasp compile, `git diff --check`.

**Stop condition:** contextual ListItems remain flat checklist rows.

### SL16 — Type-safe Inbox transformation

**Status:** done  
**Preferred model:** Terra xhigh  
**Acceptable model:** Luna max  
**Depends on:** `SL15`

**Goal:** transform an owned InboxItem into an owned ListItem atomically enough
for existing operation architecture, with no silent data loss.

**Allowed paths:**

- `webapp/src/inbox/operations.ts`
- `webapp/src/inbox/operationsCore.ts`
- `webapp/src/inbox/operations.test.ts`
- `webapp/src/inbox/operations.capture.test.ts`
- `webapp/src/simpleLists/operationsCore.ts`
- corresponding focused core tests
- triage action declaration in `webapp/main.wasp.ts`
- Inbox triage route in `webapp/src/auth/patRoutes.ts`
- `cli/src/commands/inbox.ts`, `cli/src/commands/management.test.ts`, and
  `cli/src/commands/llm.ts`

**Required changes:** add `list-item` decision; resolve owned Lens type before
dispatch; accept only Life-area+structured or Simple-list+ListItem pairs;
preserve title/text, body, and source URL; reject attachments before mutation;
skip project/tag/task work on ListItem path; delete InboxItem only after create.

**Verification:** focused Inbox/Simple-list operation tests, Wasp compile,
`git diff --check`.

**Stop condition:** direct/custom clients cannot cross output-type boundaries.

### SL17 — Compact Simple-list triage UX

**Status:** done  
**Preferred model:** Terra high  
**Acceptable model:** Luna xhigh  
**Depends on:** `SL16`

**Goal:** make assigning a captured item to a Simple-list Lens fast, obvious,
and free of task-planning controls.

**Allowed paths:**

- `webapp/src/inbox/TriagePage.tsx`
- `webapp/src/inbox/TriagePage.css`
- `webapp/src/inbox/TriagePage.test.tsx`
- `webapp/src/inbox/triageFlow.ts`
- `webapp/src/inbox/triageFlow.test.ts`
- `webapp/src/inbox/useTriageKeyboard.ts`
- `webapp/src/inbox/useTriageKeyboard.test.tsx`

**Required changes:** include both Lens types; Simple-list selection becomes
ListItem automatically; expose editable item text and `Add to <Lens>`; skip
Spec/property/picker queries and screens; preserve Delete; update keyboard and
cache behavior; show attachment incompatibility before submit when possible.

**Verification:** focused triage UI/flow/keyboard tests, Wasp compile,
`git diff --check`.

**Stop condition:** Simple-list triage is one calm confirmation, not task triage.

### SL18 — Universal shell and capture targeting

**Status:** done  
**Preferred model:** Terra high  
**Acceptable model:** Luna xhigh  
**Depends on:** `SL17`

**Goal:** keep Capture and Inbox reachable from every Lens and make explicit
Simple-list capture hints resolve correctly.

**Allowed paths:**

- `webapp/src/app/AppShell.tsx`
- `webapp/src/app/AppShell.css`
- `webapp/src/app/AppShell.test.tsx`
- `webapp/src/app/useKeyboardShortcuts.ts`
- corresponding shortcut tests
- capture Lens autocomplete/resolution files and direct tests
- `webapp/src/search/paletteRegistry.ts`, `webapp/src/search/CommandPalette.test.tsx`,
  and direct registry tests
- Inbox/Triage route guards directly used by shell normalization

**Required changes:** Simple-list desktop shows Inbox+List; mobile shows
Inbox+List+Lens; Capture FAB and Cmd+K work; `/app/inbox` routes stay valid;
`[[simple-list]]` preselects ListItem destination; structured commands remain
hidden; no route loops.

**Verification:** focused shell/capture tests, Wasp compile, `git diff --check`.

**Stop condition:** universal intake works without exposing Life-area pages.

### SL19 — Product and public roadmap truth

**Status:** done  
**Preferred model:** Luna high  
**Acceptable model:** Terra medium  
**Depends on:** `SL18`

**Goal:** make repository roadmap and public website describe this meaningful
new capability without claiming deployment.

**Allowed paths:**

- `docs/ROADMAP.md`
- `docs/features/simple-list-lenses.md`
- `docs/features/README.md`
- `docs/specs/simple-list-lenses.md`
- `site/src/pages/roadmap.astro`
- `site/docs/ROADMAP.md` when its source-of-truth notes require alignment

**Required changes:** add Simple-list Lenses to current roadmap truth; update
test counts/status only from evidence; add public roadmap Now entry until
verified, then shipped timeline entry only when code verification passes;
never imply deployment.

**Verification:** `cd site && npm run build`; `git diff --check`.

**Stop condition:** internal and public roadmap status matches evidence.

### SL20 — Full verification, browser acceptance, and code review

**Status:** done  
**Preferred model:** Terra xhigh  
**Acceptable model:** Luna max  
**Depends on:** `SL19`

**Goal:** verify full corrected story and repair every in-scope defect.

**Allowed paths:** files changed by `SL14` through `SL19`, plus focused E2E
coverage under `webapp/e2e/` when required.

**Required checks:** all focused tests; full webapp suite; Wasp compile; CLI
suite/build; site build; `git diff --check`; browser path only against confirmed
current server/database. Run repository code-review skill and fix findings.

**Required audit:** no lost Inbox content; no structured entity in Simple list;
no ListItem in focus/review; universal capture on desktop/mobile; attachment
failure leaves InboxItem; roadmap distinguishes code-verified/deployed.

**Stop condition:** automated gates pass and browser status is reported exactly.

**Evidence (2026-08-10):** full webapp suite 75 files / 972 tests; final
triage/source-safety correction slice 4 files / 47 tests; Wasp compile passed;
CLI 8 files / 93 tests and TypeScript build passed; Astro site built 30 pages;
`git diff --check` passed. Static review fixes: explicit `[[lens]]` now wins
over inferred Project context, and only HTTP(S) captured sources become links.
Browser acceptance not run because no current app server is attached and the
generate-only migrations were not applied. No deployment claimed.

## Dependency order

```text
SL01
  -> SL02
      -> SL03 -> SL04
      -> SL05 -> SL06
              -> SL07 -> SL08
                     -> SL09 -> SL10
                              -> SL11
                                  -> SL12 -> SL13
                                      -> SL14 -> SL15 -> SL16 -> SL17
                                                           -> SL18 -> SL19 -> SL20
```

`SL06` may run after `SL05` while `SL07` begins, but use separate worktrees if
executed concurrently. Default execution remains serial to avoid generated Wasp
type and migration conflicts.
