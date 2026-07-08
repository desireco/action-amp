---
id: build-pulls-from-board
kind: spec
title: "Build pulls from the board, not the files"
status: ready
priority: P1
feature: build-pulls-from-board
spec_owner: discover
build_owner: build
created: 2026-07-08

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mi6bB      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:38:16Z   # sync-managed (drift detection)
---

# Spec: Build pulls from the board, not the files

> **Status: `ready`** (locked 2026-07-08). Resolves the asymmetry between
> "board owns lifecycle" (the Projects-wins contract) and "Build reads files"
> (the legacy behavior). Build now reads `next` from the board directly — the
> board IS the queue; the file follows.

## Summary

Change Build's pull source from the file's `status:` frontmatter to the board's
Status field. When invoked, Build queries the GitHub Project for items with
Status=Next, picks one by the round-robin/priority rule, flips the card to
Building on the board AND rewrites the file's `status: next → building` in one
commit. No webhook, no separate sync step — Build reading the board *is* the
synchronization. The board becomes the live queue; the file's frontmatter
becomes a true cache, kept current as a side effect of Build doing its job.

## Why

**The problem.** The Projects-wins contract (`docs/specs/github-projects-sync.md`,
`docs/sync.md`) says GitHub Projects owns lifecycle fields. But Build's pull rule
(`docs/queue.md`, the `duet-build` skill) still reads `status:` from the *file's*
frontmatter. That's an asymmetry: the board is supposed to be authoritative for
"what's next," but Build ignores it and reads the cache. If you steer on the
board (promote `ready → next`) and forget to run `duet-sync-pull.sh`, Build reads
stale file state and either idles (no `next` in files) or pulls the wrong thing.

**Who has it.** Every Build invocation. The whole point of steering on the board
is that drags mean something. If Build doesn't read the board, drags don't steer
Build — they just decorate it.

**Why board-primary, not file-primary-with-presync.** Two reasons:
1. **The board is already authoritative.** The Projects-wins decision locked this.
   Making Build read files forces a reconciliation step (`duet-sync-pull.sh`)
   every time, just to reproduce what the board already knows. That's redundant
   work with a stale-cache risk.
2. **No infrastructure required.** The webhook path (real-time Projects→file
   write-back via a GitHub Action) needs either an org conversion or a GitHub
   App, neither of which is built. Board-primary Build sidesteps that entirely:
   Build queries `gh project item-list` (works today, you have the token scope),
   flips the card, and the file follows. No webhook, no receiver, no cron.

**The evidence it's real.** `scripts/duet-sync-pull.sh` already proves the
`gh project item-list` + frontmatter-rewrite mechanics work. Board-primary Build
is the same logic, invoked by Build instead of by a human, scoped to one item
instead of all items.

## Decisions locked

### D1. Board is Build's pull source

Build queries the GitHub Project (default: ActionAmp Duet, #5 under @me) for
items where Status=Next. The file's `status:` frontmatter is no longer the
pull source — it's a cache, kept current as a side effect of the flip (D3).

### D2. Same selection rule, applied to board items

Round-robin across Kind (spec → backlog → task), then highest Priority, then
oldest Created. Identical to `docs/queue.md`'s rule — just evaluated against
the board's fields instead of the file's. The `Tier` field (Now/Next/Later) is
a view concern, not a selection concern; Build selects within Status=Next
regardless of tier (all `next` items are equally pullable).

### D3. The flip is atomic across both surfaces

When Build claims a unit, it does **both** in one logical step:
1. Flip the board card Status: Next → Building (via `gh project item-edit`)
2. Rewrite the file's `status: next → building` + stamp `gh_synced_at`, commit
   as `duet: <slug> → building`

Order matters: **board first, then file.** If the board flip succeeds and the
file write fails (rare — disk full, git lock), the card is Building on the board
but the file is stale. That's recoverable: the next `duet-sync-pull.sh` run
catches it. The reverse order (file first, board fails) is worse — the file
says Building but the card still shows Next, so another Build invocation could
re-pull it. Board-first makes the board the source of truth at every instant.

### D4. Encapsulated in a helper script

`scripts/duet-pull-next.sh` does the query + selection + flip + commit. Build
calls it as the first step of its loop. The script owns the gh interaction so
the skill prompt stays focused on what to *do* with the pulled unit, not the
mechanics of pulling.

**Why a script, not inline in the skill:** the gh query + field option ID lookup
+ atomic flip is fiddly (the Status option IDs change when fields are edited —
the bug we hit earlier). Encapsulating it means Build invokes one command and
gets back either "claimed: <slug>" or "idle: no Next items." The skill stays
clean; the script is testable independently.

### D5. `duet-sync-pull.sh` still has a job

The manual sync script doesn't go away — it handles the *other* direction's
drift: when Discover authors a new spec file (file appears, no board item yet),
`duet-sync-pull.sh`'s sibling `duet-sync-push` (or the existing push path) creates
the board item. And if you edit fields on the board that Build didn't initiate
(e.g. you change a card's Priority without Build running), `duet-sync-pull.sh`
catches that drift. The two scripts are complementary:
- `duet-pull-next.sh` — Build's claim path (board → file, one item, atomic)
- `duet-sync-pull.sh` — reconciliation (board → file, all items, on demand)

### D6. When `next` is empty, Build idles (unchanged)

If no items have Status=Next on the board, Build idles — same as the file-based
rule. It does **not** fall back to `ready` (those haven't been promoted by the
human) and does **not** fall back to `draft` (those are Discover's). Build
reports "idle: 0 Next items, N Ready items awaiting promotion" and stops.

## Done-conditions

### A. The helper script exists and works

- [ ] `scripts/duet-pull-next.sh` exists, is executable, and runs without errors.
- [ ] With at least one Status=Next item on the board, it picks one by the
      round-robin/priority rule and prints `claimed: <slug>` + the file path.
- [ ] With zero Status=Next items, it prints `idle: 0 Next items` and exits 0.
- [ ] It never pulls a `ready` or `draft` item, even if those exist on the board.
- [ ] `--dry-run` prints what it would claim without flipping anything.
- [ ] `--kind <kind>` restricts to one kind (e.g. only `spec`).

### B. The flip is atomic + board-first

- [ ] When the script claims a unit, the board card's Status flips to Building.
- [ ] In the same script invocation, the file's `status:` rewrites to `building`
      and the change is committed as `duet: <slug> → building`.
- [ ] `gh_synced_at` is stamped on the file write.
- [ ] If the board flip succeeds but the file write fails, the script exits
      non-zero with a clear error ("board flipped but file write failed — run
      duet-sync-pull.sh to reconcile").

### C. Build skill uses the script

- [ ] `duet-build` SKILL.md (global + duet-repo + ActionAmp mirror) instructs
      Build to call `scripts/duet-pull-next.sh` as step 1 of its loop, instead
      of scanning `docs/{specs,backlog,tasks}/` for `status: next`.
- [ ] The skill's pull-rule section references the board as source, not files.
- [ ] The skill still reads the *file* for done-conditions, decisions, non-goals,
      open questions — only the **pull selection** moves to the board.

### D. docs/queue.md reflects the change

- [ ] The Build pull rule in `docs/queue.md` is rewritten: "find items with
      Status=Next on the board" replaces "find units with `status: next` across
      docs/."
- [ ] A note explains the board is the pull source; files are the prose source.

### E. Round-trip works end-to-end

- [ ] A human promotes a `ready` card to `next` on the board.
- [ ] `duet-build` is invoked; it calls `duet-pull-next.sh`.
- [ ] The script claims the unit, flips board + file, prints `claimed: <slug>`.
- [ ] Build proceeds to read the file's done-conditions and implement.
- [ ] The board shows the card as Building; the file's `status:` is `building`;
      the commit `duet: <slug> → building` is in git history.

## Non-goals

- **No webhook, no Action, no automation of the pull itself.** Build pulls when
  invoked by a human; it doesn't run on a schedule or react to board events.
  That's the explicit trade — automation later, manual invocation now.
- **No file-primary path.** Build does not fall back to reading `status:` from
  files if the board is unreachable. If `gh` fails (auth, network), Build stops
  with an error. Keeping a fallback would recreate the stale-cache race.
- **No change to Discover.** Discover still locks work to `ready` by editing the
  file (then `duet-sync-push` or the existing push path creates/updates the
  board item). Only Build's read surface changes.
- **No change to the round-robin rule.** Same selection logic (kind rotation,
  priority, age) — just evaluated against the board instead of the filesystem.
- **No validation of legal arcs on the board side.** If a human drags `done →
  next` (weird but possible), Build will pull it. Trust the human; validation is
  a separate concern.

## Open questions

- _(none product-side — all decisions locked above.)_
- **Deferred to Build's discretion:** whether `duet-pull-next.sh` lives in
  `scripts/` (alongside `duet-sync-pull.sh`, `duet-capture.sh`) or in
  `.github/scripts/` (if we later want Actions to reuse it). `scripts/` is the
  lean default — it matches the existing convention.

## Dependencies

- **`gh` token scope.** Build needs `read:project` + `project` to query and flip
  the board. You have this (the re-login earlier this session added it).
- **The board must exist with items.** It does (ActionAmp Duet, #5, 27 items).
- **No new runtime deps.** Bash + `gh` + `python3`, same as the other scripts.

## Prototypes

_(none — the logic is proven by `scripts/duet-sync-pull.sh`, which already does
the gh query + frontmatter rewrite. This spec's helper is the same mechanic,
scoped to one item and with the flip direction reversed: board-first, not
file-first.)_
