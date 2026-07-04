---
slug: tag-management
title: "Tag management UI + reserved tag seeding"
feature_area: cross-cutting
status: missing
spec: tag-management.md            # ready — written 2026-07-03
unblocks: focus-engine-v2.md       # the moment matcher is inert without it
verified: 2026-07-03
---

# Tag management UI

**Wanted.** Show + edit tags as chips on Task detail (add via typed input,
remove via ×), and seed the 7 reserved tag names (`~15m`, `~30m`, `~1h`,
`~2h+`, `low-energy`, `med-energy`, `high-energy`) once per user so the matcher
has something to read.

**Today.** **No tag UI exists.** Tags are created *only* at triage via
`@`-parsing (`inbox/operations.ts:155` connects parsed tag records to the new
task). They are never listed on Task detail, never editable after create, and
there are no reserved tag names — the `Tag` model (`name`, `color`, per-user
`@@unique([userId, name])`) supports them but nothing reads/writes them outside
triage.

**Spec.** `docs/specs/tag-management.md` — **`ready`** (written 2026-07-03).
Deliberately **the minimum that unblocks the matcher:** seed the 7 names in
`ensureOnboarded`, render chips + add/remove on Task detail, two ops
(`linkTaskTag` / `unlinkTaskTag`). Non-goals: no tag-manager page, no color
editing, no merge/rename/delete, no other Task-detail fields.

**Why it matters.** Without this, `focus-engine-v2`'s moment-aware matcher is
inert — users can't tag tasks with the energy/time the matcher ranks on. This
is the load-bearing prerequisite for the project's only moat.

