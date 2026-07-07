---
id: github-projects-sync
kind: spec
title: "GitHub Projects board (two-way sync with Duet markdown)"
status: ready                # locked 2026-07-07; trigger-model impl deferred to Build
priority: P2
feature: github-projects-sync
spec_owner: discover
build_owner: build
created: 2026-07-07
---

# Spec: GitHub Projects board (two-way sync with Duet markdown)

> **Status: `ready`** (locked 2026-07-07). The hard decision — two-way sync —
> is resolved below via a **field-split model**: structured fields are
> bidirectional, prose is one-way. The only deferred item is the *trigger
> mechanism* for write-back (webhook vs CLI); semantics are locked either way.

## Summary

Mirror the Duet work queue (`docs/specs/`, `docs/backlog/`, `docs/tasks/`) to a
GitHub Projects (beta) board owned by the `desireco` org, so the backlog is
visible as a Now/Next/Later board without abandoning the in-repo filesystem-as-bus
contract. **Structured frontmatter** (`status`, `priority`, `kind`, `feature`,
`title`) syncs **both directions** — drag a card on GitHub and the matching
markdown file updates. **Prose bodies** (Summary, Why, Done-conditions) sync
**one-way** (repo → GitHub) so the markdown stays the audit log. Identity is a
stable GitHub `content_node_id` stored in each unit's frontmatter.

## Why

**The problem.** Duet's protocol — "the filesystem is the bus; git is the audit
log; the spec is the score" — works for agents but is hostile to humans who want
to see the queue at a glance. Today, answering "what's Now vs Next?" means
grepping frontmatter across three folders and mentally mapping `priority: P2` →
"Next." There is no board, no drag, no visual priority. The ROADMAP §Priority
order is prose — a snapshot, not a live view.

**Who has it.** The solo maker (user) and any future collaborator. Agents read
markdown fine; humans scan boards faster than they grep.

**The evidence it's real.** Both Duet skills (`duet-discover`, `duet-build`)
already defer to a round-robin contract at `docs/queue.md` that didn't exist
until this spec cycle (now filled alongside this spec). The backlog has ~25
live units across `draft`/`ready`/`deferred` — enough that a flat list is
already losing signal. GitHub Projects (beta) is free for orgs, has a REST +
GraphQL API, custom fields, multiple views (board/roadmap/table), and the `gh`
CLI already ships `gh project item-*` subcommands.

**Why not GitHub-native.** That would throw away the Duet protocol, the review
gate, the `reviews/` audit trail, and the in-repo audit log. The filesystem
*is* the bus; the board is a view, not the source.

## Decisions locked

### D1. Board owner = org `desireco`

Created at the org level (not personal, not repo-attached) via
`gh project create --owner desireco --title "ActionAmp Duet"`. Survives a repo
rename; visible alongside other org repos. Requires the `gh` token to carry
`read:project` + `project` scopes (currently missing — see §Prerequisites).

### D2. Two-way sync, but split by field type

The whole risk of two-way is dual-write corruption. Resolved by splitting
frontmatter into two classes:

| Field | Direction | Conflict rule |
|---|---|---|
| `title` | **bidirectional** | GitHub title edit rewrites the unit's `title:` frontmatter on next sync |
| `status` | **bidirectional** | GH Status field ↔ repo `status:`. Markdown wins on conflict (it's the audit log); sync posts a note on the GH item when it overwrites a card-side change |
| `priority` | **bidirectional** | GH Priority field ↔ repo `priority:`. Same conflict rule |
| `kind` | **bidirectional** | GH Kind field ↔ repo `kind:` (rarely changes; mostly one-way in practice) |
| `feature` | **bidirectional** | GH Feature field ↔ repo `feature:` |
| `parent` | repo → GH (one-way) | Set by Discover when spawning; not edited on the board |
| Prose body (Summary/Why/Done-conditions/etc.) | **repo → GH (one-way)** | GH item body is a rendered mirror of the markdown body; edits on GitHub are discarded. The body says so at the top |
| `gh_node_id` | repo → GH (one-way, write-once) | The join key; set once on first push, never rewritten |

**Invariant:** the markdown is the source of truth for *scope and prose*; GitHub
is the source of truth for *visual prioritization within the locked field set*.
When they disagree on a structured field, markdown wins and the GH side is
reconciled with a visible note — never silent.

### D3. Identity = `gh_node_id` in frontmatter

Every synced unit gains one new frontmatter key:

```yaml
gh_node_id: PVTI_xxxxxxxxxxxxx   # GitHub Project item content node ID; write-once
```

The repo slug (`docs/specs/<slug>.md`) is the human key; `gh_node_id` is the
machine join. Renaming a file does not break sync — the script matches on
`gh_node_id` first, falling back to title-similarity if missing. First push:
if `gh_node_id` is absent, create the item and write the returned node ID back
into the file.

### D4. Field map (repo frontmatter ↔ GitHub custom fields)

Five single-select fields on the project, plus the built-in Title/Status:

| GH field | Type | Options | Maps from/to |
|---|---|---|---|
| **Status** (built-in) | single-select | `Draft`, `Ready`, `Building`, `Review`, `Blocked`, `Done` | repo `status:` (capitalized) |
| **Kind** | single-select | `spec`, `backlog`, `task`, `bug` | repo `kind:` |
| **Priority** | single-select | `P0`, `P1`, `P2`, `P3` | repo `priority:` |
| **Tier** | single-select | `Now`, `Next`, `Later`, `Icebox` | **derived** from `priority` (P0/P1→Now, P2→Next, P3→Later/Icebox) — not stored in repo |
| **Feature** | text | — | repo `feature:` (free text; GH single-select would require pre-seeding all slugs) |

### D5. Two views on one project

1. **"Board" view** — columns = Status (Draft / Ready / Building / Review /
   Blocked / Done). The kanban. This is the default.
2. **"Roadmap" view** — grouped by Tier (Now / Next / Later / Icebox), sorted by
   Priority then created-date. This is the Now/Next/Later the user asked for.

Both read the same items; no data duplication.

### D6. "Maybe" bucket = lightweight `docs/backlog/<id>.md` drafts

Confirmed convention (not new code — the folder exists). The intake floor:

```yaml
---
id: <slug>
kind: backlog
title: "<one line>"
status: draft              # "maybe" until refined into a spec or killed
priority: P3               # default; promotes to P0–P2 when it earns a slot
created: 2026-07-07
---

# <title>

## Why
<!-- one sentence; no done-conditions, no summary section required -->
```

No `spec_owner`/`build_owner` until promotion. These units sync to the board as
`Draft` / `Icebox` cards — visible, draggable, but explicitly the lowest-friction
capture the protocol allows.

### D7. Trigger model — manual CLI for v1, webhook deferred

**v1 (locked):** a manual script `scripts/duet-sync.mjs` (or `.sh`) the user/agent
runs on demand. Two modes:
- `duet-sync --push` — repo → GitHub (create missing items, update fields/body)
- `duet-sync --pull` — GitHub → repo (apply card-side status/priority/title edits
  to the matching markdown)

Explicit, no surprises, no infra. Discover and Build both run it before/after
their loops.

**Deferred to v2 (Build's discretion):** a GitHub webhook → small server endpoint
for real-time write-back. Out of scope here — adds hosting surface (where does
the endpoint live? Railway? a Cloudflare Worker?) and a secret-management concern
that the manual model avoids. The v1 contract is designed so v2 is additive
(same field map, same conflict rules), not a rewrite.

### D8. Conflict resolution — last-writer-wins with a visible breadcrumb

`duet-sync` records `gh_synced_at:` (ISO timestamp) in frontmatter on each
successful push/pull. On the next sync:

1. Fetch the GH item's `updatedAt`.
2. If only one side changed since `gh_synced_at` → apply the change.
3. If **both** changed (true conflict) → **markdown wins** for structured
   fields, the GH card is updated, and a comment is posted on the GH item:
   *"Sync conflict on {field}: markdown value ({x}) overrode card value ({y}) at
   {time}. Edit the spec at docs/{specs,backlog,tasks}/<slug>.md."*
4. Prose conflicts are impossible — prose is one-way.

This honors the audit-log invariant: the markdown is never silently rewritten by
a card drag.

### D9. Delete / archive handling — asymmetric, markdown-led

- Markdown unit deleted from repo → GH item **archived** (not deleted), with a
  sync note. Preserves history.
- Markdown unit `status: done` → GH item moved to `Done` column, not archived
  (so shipped work is still visible on the board, not buried).
- GH item deleted from the board → markdown untouched; sync emits a warning
  ("orphaned unit: GH item for <slug> no longer exists; will be re-created on
  next push"). GH is never the source of truth for deletion.

### D10. Prerequisites (Build unblocks before first sync)

- [ ] User runs `gh auth refresh -s read:project project` (token currently has
      `repo, gist, read:org, admin:public_key` — `gh project` is blocked without
      this). *User-owned, not code.*
- [ ] Project created: `gh project create --owner desireco --title "ActionAmp
      Duet"`. *Can be Build's first action or done manually now.*
- [ ] Custom fields created (Kind, Priority, Tier, Feature) via
      `gh project field-create`. *Build script.*

## Done-conditions

### A. Board exists with the right shape

- [ ] A GitHub Project titled "ActionAmp Duet" exists under the `desireco` org
      (verifiable: `gh project list --owner desireco --format json` includes it).
- [ ] It has custom fields: **Kind** (single-select: spec/backlog/task/bug),
      **Priority** (P0/P1/P2/P3), **Tier** (Now/Next/Later/Icebox), **Feature**
      (text). Verifiable via `gh project field-list <id> --owner desireco`.
- [ ] The built-in **Status** field has options Draft, Ready, Building, Review,
      Blocked, Done (matching repo `status:` values, capitalized).
- [ ] Two views exist: **Board** (columns = Status) and **Roadmap** (grouped by
      Tier, sorted by Priority then created). Verifiable in the GH UI.

### B. Sync script — push (repo → GitHub)

- [ ] `scripts/duet-sync.mjs --push` exists and runs without errors against the
      `desireco` org project.
- [ ] For every unit in `docs/specs/`, `docs/backlog/`, `docs/tasks/` with a
      recognized `kind:` and `status:`, the script either creates a GH item or
      updates the existing one (matched by `gh_node_id`, falling back to title).
- [ ] On first push of a unit lacking `gh_node_id`, the script creates the item
      and writes the returned node ID back into the unit's frontmatter
      (`gh_node_id: PVTI_...`).
- [ ] Title, Status, Kind, Priority, Tier (derived), and Feature on the GH item
      match the unit's frontmatter after push.
- [ ] The GH item body is the rendered markdown body of the unit, prefixed with
      a one-line banner: *"Source of truth: `docs/{specs,backlog,tasks}/<slug>.md`
      — edits here are discarded; edit the file."*
- [ ] Push records `gh_synced_at: <ISO>` in the unit's frontmatter on success.

### C. Sync script — pull (GitHub → repo)

- [ ] `scripts/duet-sync.mjs --pull` reads each GH item and applies card-side
      edits to the matching markdown unit's `status:`, `priority:`, and `title:`
      frontmatter only.
- [ ] Pull does **not** touch prose (Summary/Why/Done-conditions/body).
- [ ] Pull respects the conflict rule (D8): if the markdown changed since
      `gh_synced_at` AND the card changed, markdown wins and a comment is posted
      on the GH item noting the overwrite.
- [ ] Pull commits each applied change with message
      `chore(duet): sync GH→repo for <slug> (<field>=<value>)`.

### D. Conflict + delete behavior

- [ ] When a unit is deleted from the repo, the next `--push` archives (not
      deletes) the matching GH item with a sync note.
- [ ] When a unit is `status: done`, the GH item is in the Done column, not
      archived.
- [ ] When a GH item is deleted but the markdown remains, `--push` re-creates
      the item and emits a warning to stderr.

### E. Maybe bucket works end-to-end

- [ ] A new `docs/backlog/<id>.md` with `kind: backlog, status: draft,
      priority: P3` and a one-line `## Why` section syncs to the board as a
      `Draft` / `Icebox` card on the next `--push`.
- [ ] Dragging that card to the `Ready` column on GitHub and running `--pull`
      flips the markdown `status: draft → ready`.

### F. Idempotent + safe

- [ ] Running `duet-sync --push` twice in a row with no changes is a no-op
      (second run reports "0 updated").
- [ ] The script never deletes a markdown file and never deletes a GH item.
- [ ] The script fails loudly (non-zero exit, clear message) if `gh` token lacks
      `project` scope, if the project doesn't exist, or if a frontmatter parse
      fails — never silently continues.

### G. Docs + queue gaps filled (companion to this spec)

- [ ] `docs/tasks/README.md` exists and documents the spawned-bugs/tasks folder
      (referenced by both Duet skills + the backlog README; absent before this
      spec cycle).
- [ ] `docs/queue.md` exists and documents the round-robin pull order
      (referenced by both Duet skills; absent before this spec cycle).
- [ ] `docs/backlog/README.md` "Maybe bucket" convention is documented (minimal
      frontmatter floor for `kind: backlog` drafts).

## Non-goals

- **No real-time webhook sync in v1.** Manual CLI only. Webhook v2 is deferred
  to Build's discretion and adds hosting + secret surface this spec doesn't
  scope.
- **No prose write-back from GitHub.** Item bodies on GH are a rendered mirror;
  edits there are discarded. The markdown is the audit log.
- **No GitHub as source of truth.** Ever. If the board and the repo disagree on
  scope/prose, the repo wins and the board is reconciled.
- **No syncing of `docs/features/` or `docs/reviews/`.** Those are catalog +
  audit artifacts, not queue units. Only `specs/`, `backlog/`, `tasks/` carry
  the lifecycle frontmatter and sync.
- **No automation of the Duet loop itself.** This is a *view* over the loop, not
  a participant. Discover and Build still read/write markdown; the board is a
  mirror.
- **No mobile app, no notifications, no Slack integration.** Out of scope.
- **No multi-org or multi-board.** One board, one org, for now.

## Open questions

- _(none product-side — all decisions locked above.)_
- **Deferred to Build's discretion:** the implementation language of
  `duet-sync` (`.mjs` leans on existing `webapp/scripts/*.mjs` patterns; `.sh`
  leans on `scripts/new-spec.sh`). Either is fine; pick what fits the repo.
- **Deferred to Build's discretion:** whether `--pull` runs as a single bulk
  commit or per-unit commits. Bulk is simpler; per-unit is a cleaner history.

## Dependencies

- **`gh` token scope.** User must run `gh auth refresh -s read:project project`
  before any of this works. Not a code dependency; a setup step.
- **No new npm deps expected** if the script shells out to `gh project item-*`
  (the lean path). If Build prefers the GraphQL API directly, a thin GraphQL
  client may be added — Build's call.
- **Reconciles with** `docs/queue.md` (this spec cycle creates it) and
  `docs/tasks/README.md` (same).

## Prototypes

_(none — no UI to prototype; the GitHub Projects board is configured via `gh`
CLI commands and verified by inspection. A throwaway worktree isn't useful
here.)_
