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

### Build (Track 2) — pulls `next` from the board

Build reads the board, not the files, for selection. Per
`docs/specs/build-pulls-from-board.md`:

1. Run `scripts/duet-pull-next.sh`. The script queries the GitHub Projects
   board for items with Status=Next, picks one, and atomically flips the card
   to Building AND rewrites the file's `status: next → building` + commits as
   `duet: <slug> → building`. Board-first, then file — the board is
   authoritative at every instant.
2. If the script prints `idle: 0 Next items`, Build stops. Do not invent work,
   do not fall back to `ready`, do not scan files for `status: next`.
3. The script handles selection: round-robin across Kind (spec → backlog →
   task), then highest Priority, then oldest Created. Build doesn't reimplement
   this — it trusts the script's pick.
4. Build then reads the file (the path the script names) for done-conditions,
   decisions, non-goals, open questions. The board told Build *which* unit;
   the file tells Build *what to build*.

> **Why board-primary.** The Projects-wins contract makes the board
> authoritative for lifecycle. Reading files for selection would force a
> reconciliation step (`duet-sync-pull.sh`) every time and recreate a
> stale-cache race. The board is already current; read it directly. Files
> remain the source for prose — only the *selection* moves to the board.

> **The two states — `ready` vs `next`.** Discover locks work to `ready`; the
> human curates a shortlist by promoting `ready → next`. Build pulls **only
> from `next`**. This separates "this is buildable" (Discover's call) from
> "do this soon" (the human's call) — so a growing `ready` backlog doesn't
> dilute focus, and the human steers by dragging one column on the board, not
> by reprioritizing everything. If `next` is empty, Build idles rather than
> grabbing arbitrary `ready` work.

> **Steering ("do this one next").** There is no `pinned:` frontmatter flag —
> steering happens on the board. Drag the card to the top of the Roadmap view
> to set visual sort order, or change its `priority`/`status` on the card (the
> Projects-wins write-back commits the change to the file). See
> `docs/specs/github-projects-sync.md` §D6.

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

| `status` | Meaning | Discover owns? | Build owns? | Human owns? |
|---|---|---|---|---|
| `draft` | being refined / maybe | ✓ (creates + refines) | — | — |
| `ready` | done-conditions testable, locked | ✓ (flips to ready) | — | — |
| `next` | staged for Build — the curated pull queue | — | ✓ (pulls from here) | ✓ (promotes ready → next) |
| `building` | Build is implementing | — | ✓ (claims) | — |
| `review` | code gated, awaiting sign-off | reads `reviews/` | ✓ (writes review, flips) | — |
| `blocked` | spec ambiguous or wrong | ✓ (resolves Open Qs) | ✓ (raises, flips) | — |
| `done` | shipped + signed off | ✓ (signs off → done) | — | — |
| `deferred` | parked, not killed | ✓ | — | — |

**Status flow:** `draft` → (Discover locks) → `ready` → (human promotes) → `next` → (Build claims) → `building` → (Build gates) → `review` → (Discover signs off) → `done`. Any state can flip to `blocked` or `deferred`.
