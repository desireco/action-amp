---
slug: simple-list-lenses
title: "Simple-list Lenses"
feature_area: foundation
status: review
spec: simple-list-lenses.md
verified: 2026-08-10
---

# Simple-list Lenses

**Current verdict: implemented and code-reviewed locally; browser acceptance
remains. No deployment is claimed.** ActionAmp
supports a second behavioral Lens type for direct checklists. Existing and
seeded Lenses remain Life areas. Pro users can create a Simple-list Lens from
Settings, switch to its dedicated `/app/list` route, and add, check, reopen,
rename, remove, or clear checked items without creating Tasks.

**Boundaries.** `LensType` controls behavior while `LensKind` continues to
control entitlement. `ListItem` is a separate tenant-scoped model and never
participates in Today, Do, Focus, Review, Logbook, Projects, or Goals. It can be
created directly or from universal Inbox triage. Structured creation operations
still reject a Simple-list Lens, and Lens deletion only offers same-type
reassignment targets.

**Interface.** The desktop shell reduces to universal Inbox plus List while
retaining Lens switching, Settings, account, theme, search, feedback, and
Capture. Mobile reduces to Inbox, List, and Lens. Switching Lens types normalizes
between `/app/list` and `/app`; Settings and admin routes remain reachable.
The CLI reports Lens type and rejects structured commands when a Simple-list
Lens is active. List-item CLI CRUD and global item search remain deferred.

**Verification.** Full webapp suite: 75 files and 972 tests. Final review
correction slice: 4 files and 47 tests. Wasp compile passed; CLI passed 93 tests
across 8 files and its TypeScript build; the Astro site built 30 pages;
`git diff --check` passed. Browser acceptance was not run because no current app
server was attached and the generate-only migrations were not applied. No
deployment or product acceptance occurred, so this remains `review` rather
than `shipped`.

Review added server entitlement checks to every list operation, closed two
missing Life-area read guards, scoped command-palette commands by Lens type,
removed a non-empty Lens deletion choice the server cannot honor, made explicit
`[[lens]]` capture targets outrank inferred Projects, and restricted clickable
captured sources to HTTP(S).

**Type conversion.** Empty custom Lenses may switch between Life area and
Simple list from Edit. Seeded Work/Me types remain fixed. Populated custom
Lenses cannot switch because doing so would reinterpret or discard structured
work or checklist rows; choosing the other type opens an explanatory modal with
the blocking counts and recovery instruction.

**Implementation files.** `webapp/schema.prisma` and
`webapp/migrations/20260811025912_simple_list_lenses/`; Wasp registration in
`webapp/main.wasp.ts`; `webapp/src/simpleLists/`; Lens management in
`webapp/src/lenses/`; type-aware shell/context in `webapp/src/app/`; structured
operation guards across Tasks, Projects, Goals, and Inbox; CLI Lens semantics
in `cli/src/commands/lens.ts` and `cli/src/types.ts`.

**Spec.** `docs/specs/simple-list-lenses.md` (`review`). The remaining sign-off
gate is the browser persistence path after the local Wasp process is restarted.
