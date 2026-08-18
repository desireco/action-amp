---
slug: simple-list-projects
title: "Simple-list Projects"
feature_area: foundation
status: review
spec: simple-list-projects.md
verified: 2026-08-18
---

# Simple-list Projects

**Current verdict: implemented; full suite + compile green.** Simple lists are
a **Project type** (`Project.type: STANDARD | SIMPLE_LIST`, locked
2026-08-18 — WORKFLOW.md §5.13). A Simple-list Project is one direct checklist
(groceries, packing, errands): it lives in a Lens, sits on the Projects page
among Standard projects, and opens at its project URL rendering the checklist
instead of the task sections. The earlier Lens-type design
(`LensType`, `/do/list`, the checklist shell mode) was removed in the same
change — every Lens is a life area now.

**Boundaries.** A Simple-list Project contains ListItems and nothing else: no
goal, no due date, no tasks, no resources, no completion lifecycle (archive
and delete still work; delete removes its items). Server writes enforce the
boundary — `assertStandardProject` guards task/resource attachment,
`requireSimpleListProject` guards every list-item op (with FREE
lens-accessibility parity via the project's Lens). ListItems never
participate in Today, Do, Focus, Review, or Logbook (both query those with
`type: "STANDARD"`).

**Interface.** Created from the Projects page (a Project/List choice in the
composer — lists count toward plan project caps, FREE included). The project
page keeps the normal shell and renders the checklist with direct add,
check/reopen, rename, remove, clear-checked, `N/J/K/Space/E/Delete` keys,
attachments, and source links. Triage's **List item** decision targets a
Simple-list Project through a flat cross-lens picker (one-step flow); the
share target's "Simple lists" optgroup does the same and opens the project
after saving. The CLI marks lists in `project list`/`show`, `project create
--list` makes one, and `capture --list-id` takes a Simple-list project id.

**Migration.** `webapp/migrations/20260818080000_simple_list_projects/`
converts every existing SIMPLE_LIST lens into a SIMPLE_LIST project (keeping
the lens id as the project id so items follow by column copy), homes it in
the user's included Lens, neutralizes denormalized references
(`InboxItem.parsedLens*`, `Feedback.lensId`), then drops `Lens.type` and the
`LensType` enum.

**Implementation files.** `webapp/schema.prisma` +
`webapp/migrations/20260818080000_simple_list_projects/`;
`webapp/src/simpleLists/` (checklist + project-keyed ops);
`webapp/src/projects/` (type support, checklist view, cards);
`webapp/src/inbox/` (dispatch contract + list picker); `webapp/src/share/`;
`webapp/src/app/` + `webapp/src/search/` (shell-mode removal);
`webapp/src/lenses/` (type-free CRUD); `webapp/src/auth/patRoutes.ts`; CLI in
`cli/src/commands/` + `cli/src/types.ts`. E2e:
`webapp/e2e/simple-lists.spec.ts`.

**Spec.** `docs/specs/simple-list-projects.md` (supersedes
`docs/specs/simple-list-lenses.md`).
