---
slug: tag-management
title: "Tag management UI + reserved tag seeding"
feature_area: cross-cutting
status: shipped
spec: tag-management.md            # ready — written 2026-07-03
unblocks: focus-engine-v2.md       # the moment matcher is inert without it
verified: 2026-09-24
---

# Tag management UI

**What.** Tags become visible and editable on Task detail (#16, shipped
2026-09-24), and the 7 reserved tag names the moment matcher ranks on
(`~15m`, `~30m`, `~1h`, `~2h+`, `low-energy`, `med-energy`, `high-energy`)
are seeded idempotently per user in `ensureOnboardedCore` — upsert no-ops,
so a user's own same-named tag keeps its color. Without this,
`focus-engine-v2`'s matcher is inert: users had no way to tag tasks with the
energy/time it reads. This is the load-bearing prerequisite for the
project's only moat.

**New-stack shape** (spec `docs/specs/tag-management.md`, mapped 2026-09-24):

- **Domain** — `packages/domain/src/tags/operationsCore.ts`:
  `listTagsCore`, `linkTaskTagCore` (resolve-or-create by name, triage
  normalization `[#@]+`-stripped + lowercased; idempotent on the
  `@@unique([userId, name])` AND the join row), `unlinkTaskTagCore` (removes
  only the link — the Tag row always survives), `seedReservedTagsCore`.
  Tenancy: the task must belong to the caller. `TaskUpdateInput` gained
  `tags.{connect,disconnect}` (join-row writes ride the task update, the S3
  create convention).
- **Contract/API** — `tags` namespace: `list`, `link`, `unlink`
  (`/rpc/tags/*`). No rename/merge/delete/color ops — spec non-goals; an
  orphan Tag row is harmless.
- **UI** — `web/src/lib/components/tasks/TagsRow.svelte` on
  `/tasks/:permalink`: chips (the Chip primitive, × remove), an inline add
  input with a click/tap typeahead over the user's tags (reserved first),
  Enter commits. Build decisions per the spec's leans: **inline input** (not
  a popover) and **muted reserved chips** (`variant="muted"`) — reserved
  tags never render louder than user tags. Done tasks show chips read-only.
  Add/remove refetches the task (the cache-invalidation point).
- **Grammar note:** the spec's "tags are created at triage via `@`-parsing"
  predates grammar v2.1 (#14) — tags ride `#` tokens (first `#` is the
  project hint, the rest are tags). The triage path is unchanged.

**Done?** Shipped: seeding (7 names, idempotent, conflict-preserving), the
Tags row (chips + add typeahead + remove), the three ops, domain tests
(normalize, resolve-vs-create, idempotence, unlink-keeps-row, tenancy), e2e
(reserved add → muted chip → remove → row survives → re-add; unknown-name
create).

**Spec.** `docs/specs/tag-management.md` (ready). Non-goals unchanged: no
tag-manager page, no color editing, no merge/rename/delete, no bulk tagging,
no lens scoping.
