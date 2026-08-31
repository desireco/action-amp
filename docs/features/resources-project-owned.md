---
slug: resources-project-owned
title: "Project-owned Resources (links + notes, project-scoped CRUD)"
feature_area: planning
status: shipped          # shipped 2026-07-28/29, scope-cut — see below
spec: resources-project-owned.md   # ready (two done-conditions superseded — see ROADMAP §Shipped)
verified: 2026-07-29
---

# Resources (project-owned)

**Shipped 2026-07-28/29 — scope-cut vs. the spec.** The `Resource` entity is
real: project-owned links + notes with full CRUD on the **Project detail page**
(add / edit / remove behind the ⋯ overflow), the **CLI surface**
(`actionamp resource list/add/update/delete`), and `/api/cli/resource/*` PAT
routes — all backed by a pure `resources/operationsCore.ts` shared across the
Wasp action, the CLI routes, and the triage resource branch. The dual-parent
"Project or Goal" was dropped: `Resource.projectId` is required + NOT NULL
(DB-enforced invariant; cascade on project delete).

**Image attachments survive resource filing** (2026-08-16). An InboxItem
captured with images and triaged as a resource carries its blobs onto
`ResourceAttachment` rows — same shape/atomic-write convention as the other
attachment tables. The project page's Resources section renders them as
display-only row thumbs (shared thumbs + lightbox), bytes served by the
owner-gated `/api/attachments/:id`; `resource list --json` (CLI) includes the
attachment metadata for agents.

**Share → Project files a Resource directly** (2026-08-31). The PWA share
screen's project destination skips triage entirely: confirming calls
`createResource` (now attachment-aware) with the shared title/url/notes/images
and opens the project page. The Inbox remains the only share destination that
flows through triage — see `docs/features/pwa-notifications.md` §Share target.

**Two scope cuts vs. the `ready` spec** (recorded in ROADMAP §Shipped):

- **No `TaskResource` join.** Tasks reference project material as **markdown
  links in the Context field** (`Task.content`), per the `task-fields`
  reversal. The spec's §A "explicit `TaskResource` join, DB-enforced same-
  project invariant" is itself reversed — the reversal note on the spec still
  says "project-ownership + delete-with-impact stand; only the join changes,"
  but in implementation delete-with-impact was cut too (below).
- **No delete-with-impact flow.** With no task links, there is nothing to
  impact — delete is a plain remove. The "N tasks reference this" confirm
  sheet from the spec was not built.

If structured task↔resource links or a delete-impact surface ever resurface as
a real need, reopen as a new spec; the current shape is deliberately simpler.

**Files.** `webapp/src/resources/operations.ts` + `operationsCore.ts`;
`webapp/src/projects/ProjectDetailPage.tsx` (Resources section + ⋯ Edit/Remove);
`webapp/src/auth/patRoutes.ts` (`/api/cli/resource/*`); `cli/src/commands/resource.ts`;
`cli/src/commands/project.ts` (`project list/show` now carry resources).

**Why it matters.** Closes the gap PAGES.md promised; lands the PARA "reference
material" leg of the structure-depth differentiator (one of the three things the
roast says could be a real moat).
