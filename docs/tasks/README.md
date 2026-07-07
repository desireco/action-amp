# Tasks & bugs (review-spawned + small fixes)

> Same lifecycle as specs (`draft → ready → building → review → done`), same
> frontmatter, but for **granular work**: bugs, small tasks, and findings
> spawned from a review that are out-of-scope for the spec under review but
> worth doing. Referenced by both Duet skills and `docs/backlog/README.md`;
> created 2026-07-07 (was absent before this spec cycle).
>
> **When to file here vs. `specs/` vs. `backlog/`:**
> - `specs/` — a feature with done-conditions (user-facing capability).
> - `backlog/` — non-feature work: setup, decisions, ops, infra, GTM.
> - `tasks/` — a bug or a scoped task spawned from a review or a larger spec.

## Frontmatter

Same shape as a spec, plus `parent:` pointing at the review or spec that
spawned this unit:

```yaml
---
id: <slug>
kind: task               # task | bug
title: "<human-readable>"
status: draft            # draft → ready → building → review → done | blocked
priority: P2             # severity-weighted: P0 = prod-down, P3 = cosmetic
feature: <slug|null>     # the feature this touches, if any
parent: <review-id|spec-id>   # the review or spec that spawned this
spec_owner: discover
build_owner: build
created: 2026-07-07
---

# <title>

## What
<!-- one paragraph: the bug or task, concretely -->

## Done-conditions
- [ ] <!-- testable predicate -->

## Origin
<!-- "Spawned from reviews/<id>.md: finding #3" or "Follow-on from specs/<id>.md" -->
```

## The spawn rule (review → task)

Per the Build protocol's §Routing findings: each cold-context reviewer finding
goes to exactly one bucket:

- **Applied** — in-scope; the worker fixes it now; the unit under review stays
  `review`; re-gate.
- **Spawned** — out-of-scope but worth doing; create `docs/tasks/<id>.md`
  (`kind: bug|task`, `parent: <this-review>`, `status: draft`, priority from
  severity). The current unit proceeds to sign-off; the spawned task enters the
  queue like any other.
- **Deferred / rejected** — logged in the review writeup with the reason.

This folder is where "Spawned" lands. Without it, review findings either bloat
the spec they came from or get lost.

## Index

_(empty — populated as reviews spawn tasks. One file per unit below; update
the file's `status:` AND here when it moves.)_

| ID | Title | Parent | Kind | Priority | Status |
|----|-------|--------|------|----------|--------|
| _(none yet)_ | | | | | |
