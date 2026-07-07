# Duet queue — the round-robin pull contract

> Referenced by `duet-discover` and `duet-build`. This file defines **how a
> track picks its next unit** when multiple `ready` (for Build) or `draft`
> (for Discover) units compete. No code reads this — it is a contract the
> agents follow. Created 2026-07-07 (was referenced by both skills but absent
> before this spec cycle).

## The rule

When polling `docs/{specs,backlog,tasks}/` for the next unit to work, a track
does **not** simply take the highest-priority file. It rotates across
**kinds**, so no kind starves. Within a kind, priority + age break ties.

### Build (Track 2) — pulls `ready`

1. Collect every unit with `status: ready` across `specs/`, `backlog/`,
   `tasks/`.
2. If empty → idle. Do not invent work.
3. **Pin check (highest precedence).** If exactly one unit has
   `pinned: true` AND `status: ready`, pull that one — skip the round-robin.
   If two or more are pinned, stop and surface the conflict (see §Pinning
   below); do not guess which the user meant.
4. Pick the kind **least recently claimed** (round-robin). Track is informal:
   if the last three units Build pulled were `spec`, prefer `backlog` or `task`
   next. The point is balance, not a strict clock.
5. Within that kind, pick highest `priority` (P0 > P1 > P2 > P3).
6. On priority tie, pick oldest `created:` date (FIFO).
7. Claim: flip `status: ready → building`, commit. Clear the pin if the pinned
   unit was the one claimed (the pin served its purpose).

### Discover (Track 1) — pulls `draft` (and unblocks)

1. **First:** scan for `status: review` (sign off → `done`) and `status: blocked`
   (resolve Open Questions → `building`). These pre-empt fresh drafts.
2. Collect every unit with `status: draft` across `specs/`, `backlog/`,
   `tasks/`.
3. If empty → idle, or capture new intake (intake never blocks on refine).
4. Round-robin across kinds as above.
5. Within kind: highest `priority`, then oldest `created:`.
6. Refine toward `ready`; commit + push when locked.

## Priority → tier mapping

The `priority` frontmatter field maps to the ROADMAP tiers and (via the GitHub
board sync) to the `Tier` custom field:

| `priority` | Tier | ROADMAP section |
|---|---|---|
| `P0` | Now | §Priority order → Now |
| `P1` | Now | §Priority order → Now |
| `P2` | Next | §Priority order → Next |
| `P3` | Later / Icebox | §Priority order → Then, or §Icebox |

Now = P0/P1 (the validation gauntlet + active build). Next = P2 (queued, gated
on a trigger). Later/Icebox = P3 (parked until earned).

## Why round-robin exists

Without it, Build would hoard `spec` work (the "interesting" kind) and let
`backlog` setup items (GTM, infra) rot — or vice versa. The rotation is a
discipline against the solo-maker failure mode of doing only the fun kind.
Discover has the same risk: spec'ing new features forever while spawned bugs
age. Round-robin forces each kind to surface.

## "Maybe" bucket

A `docs/backlog/<id>.md` unit with `kind: backlog, status: draft, priority: P3`
is a **maybe** — captured, not refined. It enters the queue like any other
draft, but at the lowest priority, so it never preempts real work. Promote
(`priority: P3 → P2` or higher, refine toward a spec) when it earns a slot;
kill it (`status: done` with a one-line "decided no") when it doesn't.

**Capture many fast** via `scripts/duet-capture.sh "<idea>"` — the low-friction
intake floor (default `kind: backlog, priority: P3`). Capture never blocks on
refinement; drafts queue and refine in priority order via `duet-refine` or
Discover's main loop.

## Pinning (`pinned: true`)

By default Build auto-selects the next `ready` unit by the round-robin rule
above. To force "do *this* one next, not auto-pick," add **one line** to the
unit's frontmatter:

```yaml
pinned: true        # Build pulls this before any other ready unit; cleared on claim
```

Rules:
- **One pin at a time.** If Build finds two `pinned: ready` units, it stops and
  surfaces the conflict rather than guessing. The human resolves it by removing
  one pin.
- **Pin is a hint to Build, not to Discover.** Discover still follows its own
  priority when refining; a pinned `draft` doesn't change Discover's order.
- **Pin clears on claim.** Build removes `pinned: true` (or sets `pinned: false`)
  when it flips the unit `ready → building`. The pin's job is done once it's
  been respected.
- **Survives the board.** Under the GitHub Projects sync, `pinned` becomes a
  checkbox field on the GH item — you can set it by dragging, and two-way sync
  propagates it back to the file. (See `docs/specs/github-projects-sync.md`.)
- **Status still must be `ready`.** A pin on a `draft` does nothing — Build only
  pulls `ready`. Pin a draft to say "refine this first" and Discover will see
  it; pin a ready to say "build this first" and Build will see it.

## Decomposition (`parent:` + `children:`)

A unit that's too big for a single Build pull — one worker, one review cycle,
one PR — splits into children. This is **conditional**, not automatic: a card
is `ready` when its done-conditions are testable, *not* when it can't be split
further. Decompose only when the one-pull test fails.

The link model (applies to `specs/`, `backlog/`, `tasks/` alike — not just
tasks/bugs):

```yaml
# child unit
---
id: weekly-review-v1
parent: weekly-monthly-review        # the slug this was split from
---
```

```yaml
# parent unit (after split)
---
id: weekly-monthly-review
children: [weekly-review-v1, weekly-review-v2]   # list of child slugs
---
```

Rules:
- **`parent:`** points from child → parent. Always set on the child.
- **`children:`** points from parent → children. Set on the parent at split
  time; update when a new child is added.
- **Parent status after split.** If the parent's remaining job is purely
  orchestration (track children, hold cross-cutting decisions), flip it
  `ready`. If it still has implementation work of its own, it's not fully
  decomposed — keep refining.
- **Children are independent queue units.** Each child has its own
  `status`/`priority` and is pulled separately. Refine doesn't have to enrich
  all children in one pass — each enters the queue as its own `draft`.
- **Cross-child invariants.** If child B reverses child A on a field or
  decision, record it in B's `## Decisions locked` *and* add a reversal note
  on A. The `task-fields ↔ resources-project-owned` reversal is the pattern.
- **Existing reference:** `cli.md` → `cli-pat-plumbing` + `cli-package` +
  `cli-skills` (each `parent: cli.md`). Use it as the shape to mirror.

## Status values (shared)

Every unit carries one of:

| `status` | Meaning | Discover owns? | Build owns? |
|---|---|---|---|
| `draft` | being refined / maybe | ✓ (creates + refines) | — |
| `ready` | done-conditions testable, locked | ✓ (flips to ready) | — (pulls from here) |
| `building` | Build is implementing | — | ✓ (claims) |
| `review` | code gated, awaiting sign-off | reads `reviews/` | ✓ (writes review, flips) |
| `blocked` | spec ambiguous or wrong | ✓ (resolves Open Qs) | ✓ (raises, flips) |
| `done` | shipped + signed off | ✓ (signs off → done) | — |
| `deferred` | parked, not killed | ✓ | — |
