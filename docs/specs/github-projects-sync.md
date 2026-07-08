---
id: github-projects-sync
kind: spec
title: "GitHub Projects board (Projects-wins sync with Duet markdown)"
status: review               # v1 (manual pull+push) complete; Action deferred. See reviews/github-projects-sync.md
priority: P2
feature: github-projects-sync
spec_owner: discover
build_owner: build
created: 2026-07-07

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsZS      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:47:30Z
---

# Spec: GitHub Projects board (Projects-wins sync with Duet markdown)

> **Status: `ready`** (realigned 2026-07-07 to the duet system's locked
> source-of-truth model). The earlier draft of this spec inverted the model —
> it made markdown the source of truth and Projects a view. The duet upstream
> (`docs/protocol.md` §Source of truth, `docs/sync.md`) locks the opposite:
> **GitHub Projects owns lifecycle; markdown owns prose; frontmatter is a
> derived cache.** This spec now matches upstream. The flip changes the write
> path, the conflict model, and (notably) removes the `pinned:` frontmatter
> flag — steering happens by dragging cards, not editing files.

## Summary

Stand up a GitHub Projects (beta) board owned by the `desireco` org that is the
**management surface** for the Duet work queue. **GitHub Projects owns
lifecycle fields** (`status`, `priority`, `kind`, `feature`, owner, roadmap
tier) — humans steer by dragging cards, and a write-back path propagates those
changes into each unit's frontmatter. **Markdown files own prose** (Summary,
Why, Done-conditions, review findings) — authored by Discover, never mutated by
sync. A reconciliation path creates Project items for new files and surfaces
orphans. The frontmatter lifecycle fields become a **derived cache of Projects**
so the file stays self-describing and the worker loop can read it fast/offline.

This matches the contract at `duet` repo `docs/sync.md`. ActionAmp is the first
project to dogfood it; the contract is shared across any Duet project.

## Why

**The problem.** Duet's protocol — "the filesystem is the bus; git is the audit
log; the spec is the score" — works for agents but is hostile to humans who want
to *steer* the queue: drag a card to reprioritize, flip status by moving a
column, see Now vs Next vs Later at a glance. Today, changing priority means
editing frontmatter across `docs/specs/`, `docs/backlog/`, `docs/tasks/` and
hand-maintaining the ROADMAP tier lists. There is no board, no drag, no
read-only roadmap view.

**Who has it.** The solo maker (user) and any future collaborator. Agents read
markdown fine; humans steer boards faster than they edit frontmatter.

**The evidence it's real.** ~25 live units across `draft`/`ready`/`deferred` —
enough that a flat list loses signal. The duet upstream already locks the model
(`docs/sync.md`) and has specs for the write-back Action
(`github-projects-writeback.md`) and the sync engine (`sync-engine.md`).
ActionAmp is downstream of that decision; this spec adopts it, not re-derives it.

**Why Projects-wins (not markdown-wins).** A board that's a read-only mirror
of frontmatter answers the wrong question. Humans don't want a *view* of the
agent's queue; they want to *drive* it — drag, drop, prioritize — and have the
files follow. The split-source model gives each surface the job it's best at:
Projects for lifecycle (where dragging means something), files for prose (where
git history and agents live). The alternative (markdown wins) relegates the
board to a cache and defeats the point of having one.

## Decisions locked

### D1. Board owner = user `desireco`

Created under the `desireco` **user account** (not an org) via
`gh project create --owner desireco --title "ActionAmp Duet"`. Requires the
`gh` token to carry `read:project` + `project` scopes (now present — see
§Prerequisites). **Note:** because `desireco` is a user account, not an org,
`projects_v2_item` webhooks do not fire — this is why the write-back Action is
deferred and the manual pull script is the v1 (see D7). Converting to an org
or standing up a GitHub App would unblock the Action; that's a Discover call.

### D2. Source of truth — split (matches duet upstream)

| Surface | Owns | Writes |
|---|---|---|
| **GitHub Projects v2** | lifecycle + index fields — `status`, `priority`, `kind`, `feature`, `Tier` (derived), owner | humans drag cards; the board IS the management tool |
| **Markdown files** | prose — vision, done-conditions, summaries, review findings, feature bodies | humans (Discover) author prose; agents (Build) read prose |
| **Frontmatter (lifecycle keys)** | **derived cache of Projects** — so the file is self-describing and the loop reads it fast/offline | written by sync; not a human write surface for lifecycle fields |

**The invariant:** if a file's lifecycle frontmatter disagrees with Projects,
**Projects wins** and the file is rewritten. Prose is never touched by sync.

This is the opposite of the earlier draft, which held "markdown wins, GH is a
view." The earlier model kept the agent loop simple but made the board
powerless — dragging a card couldn't reprioritize the work, which is the whole
reason to have a board. Aligning to upstream fixes that.

### D3. Identity + sync metadata — frontmatter keys the cache

Every synced unit gains **two sync-metadata frontmatter keys**, written by sync
(not human-authored), plus the lifecycle fields already present become the cache
of Projects. Full set on a synced unit:

```yaml
---
# ... the usual human/Discover-authored keys (id, kind, title, priority, ...) ...
# Then the sync-managed block (added/updated by sync; don't hand-edit):
status: ready              # cache of Projects Status — Projects wins on conflict
gh_node_id: PVTI_xxxxx     # the Project item's stable node ID; write-once
gh_synced_at: 2026-07-07T14:22:01Z   # last successful sync (push or write-back)
---
```

- **`gh_node_id`** — the GitHub Project item's stable content node ID (the
  `PVTI_...` value). **Write-once**: set on first push (when the item is
  created), never rewritten. This is the *machine* join key that survives slug
  renames, folder moves, and title edits. The repo path (`docs/specs/<slug>.md`)
  is the *human* key; `gh_node_id` is what sync matches on.
- **`gh_synced_at`** — ISO timestamp of the last sync touch (push or
  write-back). Used for **drift detection**: a unit is stale if its file mtime
  is newer than `gh_synced_at` (someone edited the file since sync) — the next
  push reports it and, for lifecycle fields, rewrites from Projects.
- **Lifecycle fields** (`status`, `priority`, `kind`, `feature`, `title`) —
  these are the **cache of Projects**. Projects is authority; if the file
  disagrees, the file is rewritten. Discover does not hand-edit `status` to
  steer Build — that's the whole point of Projects-wins.

**On slug collisions.** A `specs/foo.md` and `backlog/foo.md` would both map to
`duet:foo` if the join were the label alone. `gh_node_id` disambiguates — each
file has its own. The `duet:<id>` label + `Duet ID` field on the Project item
still exist (they're the human-visible join on the board), but the *sync* join
is `gh_node_id`. Folder + slug is the fallback only when `gh_node_id` is absent
(a new unit on its first push).

**What humans edit.** Discover authors `id`, `kind`, `title`, `priority`,
`feature`, `parent`, `created`, and all prose. Build flips `status` per the
protocol. Neither hand-edits `gh_node_id` or `gh_synced_at` — those are sync's.

### D4. Field map (frontmatter ↔ GitHub custom fields)

Mirrors `duet/docs/sync.md`'s table. Five custom fields, plus the built-in
Title/Status:

| Markdown frontmatter | GitHub Projects field | Type | Notes |
|---|---|---|---|
| `id` | label `duet:<id>` + `Duet ID` text | text | the human-visible join |
| `kind` | `Kind` | single-select | `spec \| backlog \| task \| bug` |
| `title` | issue title | text | `<id>: <title>` |
| `status` | `Status` (built-in) | single-select | `draft \| ready \| next \| building \| review \| done \| blocked` — cache; Projects wins |
| `priority` | `Priority` | single-select | `P0 \| P1 \| P2 \| P3` — cache; Projects wins |
| `feature` | `Feature` | text | slug; null if cross-cutting |
| `parent` | `Parent` text / sub-issue link | link | tasks/bugs/children only |
| `created` | `Created` | date | `YYYY-MM-DD` |
| `gh_node_id` | _(item's content node ID)_ | — | **sync-managed**, write-once; the machine join key (survives slug renames) |
| `gh_synced_at` | _(not stored on the item)_ | — | **sync-managed**; ISO timestamp of last sync touch, for drift detection |
| (file path) | `Path` text | text | write-back locates the file |
| (derived) | `Tier` | single-select | `Now \| Next \| Then \| Icebox` from `priority` → drives the roadmap view |

### D5. Two views on one project

1. **"Board" view** — columns = Status (Draft / Ready / Next / Building /
   Review / Blocked / Done). The kanban. Default view.
2. **"Roadmap" view** — grouped by Tier (Now / Next / Later / Icebox), sorted by
   Priority then created-date. This is the Now/Next/Later surface the user asked
   for, **and it replaces `docs/ROADMAP.md`'s tier lists as the live index**.
   ROADMAP.md stays as prose (vision, strategy, shipped history) — not a
   hand-maintained index.

### D6. "Maybe" bucket = lightweight `docs/backlog/<id>.md` drafts

Unchanged from the earlier spec — the intake floor is still:

```yaml
---
id: <slug>
kind: backlog
title: "<one line>"
status: draft              # "maybe" until refined into a spec or killed
priority: P3               # default; promotes when it earns a slot
created: 2026-07-07
---

# <title>

## Why
<!-- one sentence; no done-conditions, no summary section required -->
```

Capture via `scripts/duet-capture.sh "<idea>"`. These units sync to the board
as `Draft` / `Icebox` items — visible, draggable. **Dragging a maybe to `Ready`
on the board flips the file's `status: draft → ready` via write-back** — that's
the Projects-wins model in action. (The `pinned:` flag from the earlier draft is
gone; "do this next" is expressed by dragging the card to the top of the Roadmap
view, which sets sort order visually without a frontmatter field.)

### D7. Trigger model — GitHub Action is primary write-back; CLI reconciles

**Primary write path (Projects → file):** a GitHub Action fires on
`projects_v2_item` events. When a card moves or a field changes, it writes the
corresponding frontmatter key via the `duet` CLI's `fm_set_field` helper and
commits (`duet: <id> → <field>`). This is how a drag becomes a status flip.

Status arcs are validated on write-back via `is_legal_transition`. An illegal
drag (e.g. `review → ready`, which only Discover can do via sign-off) is
**reverted in Projects** and a comment on the issue explains why. The board is
steerable, but not so steerable that it breaks the protocol's gates.

**Reconciliation path (file → Projects):** `duet sync --push` (the upstream
`duet-sync-cli` spec) handles new and changed files:

- **New unit** (a file with no matching issue) → create the issue, set the
  `duet:<id>` label, populate fields from frontmatter. This is how Discover
  authoring a spec file creates its Project item.
- **Existing unit** → **no-op on lifecycle fields.** Projects wins on
  `status`/`priority`. The push only updates prose-derived fields that have no
  Projects-side editor (e.g. `Path`), and re-creates items for units that lost
  theirs.

Idempotent: running it twice produces no diff.

**The earlier draft's manual-only CLI (`duet-sync --push/--pull`) is replaced
by the Action.** A manual reconcile still exists, but the primary path is the
drag → write-back Action. This is the larger lift; the upstream `duet` repo
already specs it (`github-projects-writeback.md`, `sync-engine.md`,
`duet-sync-cli.md`) and ActionAmp reuses that work.

> **v1 implementation note (locked 2026-07-08):** the GitHub Action is
> **deferred** — `projects_v2_item` webhook events only fire for
> *organization-owned* projects, and `desireco` is a **user account**, not an
> org. Real-time write-back is impossible without converting to an org or
> standing up a GitHub App. The locked v1 is a **manual pull script**
> (`scripts/duet-sync-pull.sh`): you steer the board, then run one command to
> commit the changes into the files. The push direction
> (`scripts/duet-sync-push.sh`) handles file → Projects reconciliation
> (creates items for new units, backfills `gh_node_id` + non-lifecycle
> fields). Done-condition C (the Action) is marked deferred; the manual path
> satisfies the same intent at the cost of one explicit command. Illegal-drag
> transition validation (`is_legal_transition`) is correspondingly deferred —
> it belongs in the Action, not the manual pull.

### D8. Conflict resolution — there is none, by design

The earlier draft needed a "markdown-wins-on-conflict with a visible breadcrumb"
rule because both surfaces were writable. Under Projects-wins, **prose conflicts
don't exist** (prose lives only in the file) and **lifecycle conflicts don't
exist** (Projects is authority; the file is rewritten to match). The only edge
case is a file edited offline while Projects moves the same card — resolved by
the next write-back overwriting the file's lifecycle field. Prose edits in the
same commit survive (they're disjoint keys).

### D9. Delete / archive handling — Projects-led

- GH item archived on the board → file untouched; the next `--push` re-creates
  the item and emits a warning ("orphaned unit re-created"). The file is never
  deleted by a board action.
- File deleted from the repo → next `--push` archives the matching GH item with
  a sync note. Preserves history.
- File `status: done` → GH item in the Done column, not archived (so shipped
  work is still visible on the board).

### D10. Prerequisites (Build unblocks before first sync)

- [x] User runs `gh auth refresh -s read:project project` — token now carries
      `repo, gist, read:org, admin:public_key, project`. *Done.*
- [x] Project created: `gh project create --owner desireco --title "ActionAmp
      Duet"` — project #5 exists under `desireco`. *Done.*
- [x] Custom fields created (`Kind`, `Priority`, `Tier`, `Feature`, `Duet ID`,
      `Path`, `Created`) via `gh project field-create`. *Done — all present on
      project #5. Note: `Created` is GitHub's built-in date field, read-only via
      API; see Open Questions.*
- [x] `duet:*` label namespace — **superseded.** Board items are draft issues
      (not repo issues), which can't carry repo labels. The `Duet ID` custom
      field is the real join key and is populated on every item. Labels are no
      longer part of the contract.
- [ ] The write-back GitHub Action deployed — **deferred** (see D7 + Open
      Questions). Blocked on `desireco` being a user account, not an org.

## Done-conditions

### A. Board exists with the right shape

- [x] A GitHub Project titled "ActionAmp Duet" exists under `desireco`
      (`gh project list --owner desireco --format json` includes it — project #5).
- [x] Custom fields present: `Kind`, `Priority`, `Tier`, `Feature`, `Duet ID`,
      `Path`, `Created`. Verifiable via `gh project field-list <id> --owner desireco`.
- [x] Built-in `Status` options: Draft, Ready, Next, Building, Review, Blocked, Done.
- [x] Two views exist: **Board** (columns = Status) and **Roadmap** (grouped by
      Tier, sorted by Priority then created). Verifiable in the GH UI. (A third
      Table view also exists; cosmetic.)

### B. Reconciliation — file → Projects (`scripts/duet-sync-push.sh`)

- [x] Running `scripts/duet-sync-push.sh` creates a Project item for every unit
      in `docs/specs/`, `docs/backlog/`, `docs/tasks/` that lacks one, and is a
      no-op for units that already have one.
- [x] **On first push of a unit lacking `gh_node_id`**, the script creates the
      item, captures its content node ID, and writes it back into the unit's
      frontmatter as `gh_node_id: PVTI_...` (write-once — a second push does
      not rewrite it).
- [x] For units that already have `gh_node_id`, push **matches on `gh_node_id`
      first** (not slug) — so renaming a file or moving it between folders does
      not create a duplicate item. Folder + slug is the fallback only when
      `gh_node_id` is absent.
- [~] After push, each item's `Kind`, `Priority`, `Duet ID`, `Path`, and
      `Status` match the unit's frontmatter. **`Created` is excepted** — it's
      GitHub's built-in date field, read-only via the API (see Open Questions).
- [x] The item body holds a pointer to the file (`Path`), not the full prose.
      A one-line banner states prose lives in the file. (Bodies are populated
      at create time; use `--backfill-bodies` to refresh after Summary/Why edits.)
- [x] Push records `gh_synced_at: <ISO>` on success (on the create path, when
      `gh_node_id` is first written).
- [x] Push is idempotent (second run with no changes → "0 updated", 0 created).
- [x] Push **never overwrites** a Projects lifecycle value with a file value
      (the backfill path touches only Duet ID, Path, Tier, and body — never
      status/priority/kind/feature).

### C. Write-back — Projects → file (the GitHub Action) — DEFERRED

> **Deferred** (locked 2026-07-08). `projects_v2_item` webhooks don't fire for
> user-owned projects; `desireco` is a user account. The manual pull script
> `scripts/duet-sync-pull.sh` is the v1 substitute: drag on the board, then run
> one command to commit the changes into the files. These predicates describe
> the Action, which remains un-built. See D7 + Open Questions for the unblock
> path (org conversion or GitHub App).

- [ ] A `projects_v2_item` GitHub Action deploys and fires on card moves + field
      edits in the ActionAmp Duet project.
- [ ] The Action locates the target file via the item's `Path` field (or, if
      absent, by matching `gh_node_id` across the three folders) — never by
      title alone.
- [ ] Dragging a card Draft → Ready on the board commits
      `duet: <slug> → ready` to the repo, rewriting the file's `status:` and
      stamping `gh_synced_at`.
- [ ] Editing the `Priority` field on a card commits `duet: <slug> → priority`.
- [ ] An illegal drag (e.g. `review → ready`) is reverted in Projects with a
      comment explaining why (the arc isn't a legal transition).
- [ ] Prose (Summary/Why/Done-conditions/body) is **never modified** by the
      Action — verified by a cold-review check after any drag.

### C′. Manual pull — Projects → file (`scripts/duet-sync-pull.sh`) — v1

- [x] Running `scripts/duet-sync-pull.sh` rewrites lifecycle frontmatter
      (`status`, `priority`, `kind`, `feature`) to match the board, committing
      each change as `duet: <slug> → <field>=<value>`.
- [x] Prose is never touched; only frontmatter keys are rewritten.
- [x] `gh_synced_at` is stamped on every applied change.

### D. Delete / archive

- [~] Archiving a card leaves the file untouched; next `--push` re-creates the
      item. *(Re-creation on push is not yet implemented — push creates items
      for files lacking one, but does not currently detect archived-but-filed
      units by `gh_node_id` and re-create. Tracked as a follow-up.)*
- [ ] Deleting a file from the repo archives the matching card on next `--push`.
      *(Not yet implemented in the push script.)*
- [x] A `status: done` unit appears in the Done column, not archived (the `blog`
      spec confirms this — it's `Done` on the board, not archived).

### E. Maybe bucket works end-to-end (Projects-wins)

- [x] A new `docs/backlog/<id>.md` with `kind: backlog, status: draft,
      priority: P3` and a one-line `## Why` syncs to the board as a Draft item
      on `--push`.
- [~] **Dragging that card to `Ready` on the board** → with the Action deferred,
      run `scripts/duet-sync-pull.sh` to commit `duet: <id> → status=Ready` into
      the file. Manual, not real-time.
- [x] Editing the file's `status:` directly does **not** change the card
      (Projects wins; the file is cache). Push is a no-op on lifecycle fields.

### F. Safe + observable

- [x] The sync script never deletes a markdown file and never deletes a GH item
      (only archives — and that only via `gh project item-archive`, never auto).
- [x] The script fails loudly (non-zero exit, clear message) if the `gh` token
      lacks `project` scope, if the project doesn't exist, or if frontmatter
      parse fails.
- [x] Every sync commit is identifiable by `duet: <id> → <field>` prefix,
      so the audit log of board-driven changes is greppable.

### G. ROADMAP demoted to prose

- [~] `docs/ROADMAP.md` tier lists now carry a pointer to the Projects Roadmap
      view as the live index. The prose tier lists remain (they hold strategy
      context the board can't) but are no longer the authoritative index — the
      board is. Full deprecation of the prose lists is a Discover call.
- [x] A note in ROADMAP.md (under `## Priority order`) points readers to the
      Projects Roadmap view for the live queue; the prose stays for vision +
      strategy + shipped history.

### H. Docs + queue gaps filled (companion work, already landed)

- [x] `docs/tasks/README.md` exists (spawned-bugs folder).
- [x] `docs/queue.md` exists (round-robin pull contract + decomposition model).
- [x] `docs/backlog/README.md` "Maybe bucket" convention documented.

## Non-goals

- **No markdown-as-source-of-truth for lifecycle.** The earlier draft's
  markdown-wins model is explicitly reversed. Projects is the authority;
  frontmatter is cache.
- **No `pinned:` frontmatter flag.** Steering ("do this next") is expressed by
  dragging the card to the top of the Roadmap view, not by a per-file field.
  The earlier draft's `pinned:` is dropped.
- **No prose write-back from GitHub.** Item bodies hold a pointer to the file;
  prose edits on the board are discarded. The markdown is the prose audit log.
- **No reimplementing the write-back Action locally.** The upstream `duet` repo
  already specs it (`github-projects-writeback.md`, `sync-engine.md`). ActionAmp
  consumes that work; this spec is the project-side application, not a fork.
- **No syncing of `docs/features/` or `docs/reviews/`.** Those are catalog +
  audit artifacts, not queue units. Only `specs/`, `backlog/`, `tasks/` carry
  the lifecycle frontmatter and sync.
- **No automation of the Duet loop itself.** This is a *management surface*
  over the loop, not a participant. Discover and Build still read/write
  markdown; the board is how humans steer what they work on.

## Open questions

- _(none product-side — all decisions locked above.)_
- **Resolved 2026-07-08 (was "Deferred to Build's discretion"):** the write-back
  Action is **deferred indefinitely** for the current `desireco` user account —
  `projects_v2_item` webhooks don't fire for user-owned projects. The manual
  pull script (`scripts/duet-sync-pull.sh`) is the locked v1. To re-enable the
  Action: convert `desireco` to an org, or stand up a GitHub App with
  `project:read/write`. That's a Discover-level decision, not a Build one.
- **New (raised by Build):** the `Created` field on the board is GitHub's
  **built-in** date, which is **read-only via the API** (`updateProjectV2ItemFieldValue`
  rejects it: "The field of type created is currently not supported"). It
  reflects when the item was added to the project, not the spec's `created:`
  date. D4 maps `created` → `Created`, but this can't be set programmatically.
  Options for Discover: (a) accept that `Created` = board-add time and stop
  mapping the file's `created:` to it; (b) create a *custom* writable date
  field (e.g. `Spec Created`) and map there. The push script currently skips
  `Created` writes entirely — the field stays at its default.

## Dependencies

- **`gh` token scope.** User must run `gh auth refresh -s read:project project`
  before any of this works. Not code; setup.
- **Upstream `duet` repo.** The write-back Action, the sync-engine, and the
  `duet-sync-cli` are specified/shipped there. ActionAmp consumes, doesn't
  reimplement. Coordinate via the duet system's own queue.
- **No new webapp deps expected.** This is docs + scripts + a GitHub Action; no
  `webapp/` changes.

## Prototypes

_(none — no UI to prototype; the board is configured via `gh` CLI commands and
verified by inspection. The write-back Action is specified upstream.)_

## Reversal note

This spec **reverses its own earlier draft** (committed 2026-07-07 as part of
`duet-refine-pin-capture`). The earlier draft held:

- Markdown wins; GH is a view. → **Reversed**: Projects wins; frontmatter is cache.
- Manual CLI v1, webhook deferred. → **Reversed**: GitHub Action is primary; CLI
  is reconciliation only.
- `pinned: true` frontmatter flag. → **Dropped**: steering is by drag.
- ROADMAP.md tiers stay hand-maintained. → **Reversed**: Projects Roadmap view
  is the live index; ROADMAP.md demoted to prose.

**Sync-metadata keys retained.** The earlier draft also carried `gh_node_id`
(write-once join) and `gh_synced_at` (drift timestamp). An intermediate
realignment pass dropped them, reasoning that the `duet:<id>` label was
enough. It isn't — labels collide on slug clashes, and there's no way to
detect drift without a timestamp. Both keys are back: `gh_node_id` is the
machine join that survives renames, `gh_synced_at` powers drift detection.
They are **sync-managed** (written by sync, never hand-edited), which is
consistent with the cache model — they're metadata *about* the cache.

The reversal lands because the duet upstream (`docs/protocol.md` §Source of
truth, `docs/sync.md`) had already locked the Projects-wins model, and
ActionAmp is downstream of that decision. The earlier draft was authored
without that context.

## Companion changes (already on this branch)

- `docs/queue.md` — the round-robin pull contract + §Decomposition
  (`parent:`/`children:`). The `pinned:` section added in the earlier draft is
  **removed** in the same edit pass (steering is by drag, not flag).
- `scripts/duet-capture.sh` — unchanged; the intake floor is the same either way.
- `docs/tasks/README.md` — unchanged.
