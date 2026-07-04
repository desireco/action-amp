---
slug: tag-management
title: "Tag management UI + reserved tag seeding"
feature_area: cross-cutting
status: missing
spec: —                            # spec not yet written — this is a discovered prerequisite
gates: focus-engine-v2.md          # the moment matcher is inert without it
verified: 2026-07-03
---

# Tag management UI

**Wanted.** A way to view, add, and remove tags on a Task beyond the
`@`-parsing that happens at triage — plus seeding the reserved tag names
(`~15m`, `~30m`, `~1h`, `~2h+`, `low-energy`, `med-energy`, `high-energy`) the
focus engine v2 leans on.

**Today.** **No tag UI exists.** Tags are created *only* at triage via
`@`-parsing (`inbox/operations.ts:155` connects parsed tag records to the new
task). They are never listed on Task detail, never editable after create, and
there are no reserved tag names — the `Tag` model (`name`, `color`, per-user
`@@unique([userId, name])`) supports them but nothing reads/writes them outside
triage.

**Spec.** **Not yet written.** Surfaced 2026-07-03 as a *missing prerequisite*
during the focus-engine-v2 review — the moment matcher depends on energy/time
tags users have no way to set.

**Why it matters.** Without this, `focus-engine-v2`'s moment-aware matcher is
inert (users can't tag tasks with the energy/size the matcher reads). It is the
load-bearing prerequisite for the matcher, and it doesn't exist. The spec needs
to answer: where tags are edited (Task detail inline? a Tag manager?),
reserved-name seeding (system tags vs user tags), and how capture's `@`-parsing
interacts with the reserved time/energy names.

**Status: this catalog entry exists so the gap is visible.** Writing the spec is
a Discover action; until it lands and is `ready`, `focus-engine-v2` cannot be
`ready`.
