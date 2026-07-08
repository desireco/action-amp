---
slug: build-pulls-from-board
title: "Build pulls from the board, not the files"
feature_area: cross-cutting
status: missing
spec: build-pulls-from-board.md   # ready — locked 2026-07-08
verified: 2026-07-08
---

# Build pulls from the board, not the files

**Wanted.** Build's pull source moves from the file's `status:` frontmatter to
the GitHub Projects board's Status field. When invoked, Build queries the board
for Status=Next items, picks one by round-robin/priority, flips the card to
Building AND rewrites the file's `status:` in one commit. The board IS the
queue; the file's frontmatter becomes a true cache, kept current as a side
effect of Build doing its job.

**Today.** **No code yet.** The `duet-build` skill reads `status: next` from
files in `docs/{specs,backlog,tasks}/`. The board has all the same data (Status,
Kind, Priority, Created) but Build ignores it for selection — creating an
asymmetry where the board is supposed to be authoritative (Projects-wins) but
Build reads the cache. If a human steers on the board and forgets to run
`duet-sync-pull.sh`, Build reads stale state.

**Spec.** `docs/specs/build-pulls-from-board.md` — **`ready`** (locked
2026-07-08). Headline decisions: board-primary pull (no file scan); atomic flip
that's **board-first, then file** (so the board is authoritative at every
instant); encapsulated in `scripts/duet-pull-next.sh` so the skill stays clean;
`duet-sync-pull.sh` stays for catch-all reconciliation of non-Build-initiated
board edits.

**Why it matters.** This resolves the asymmetry between "board owns lifecycle"
(the locked Projects-wins contract) and "Build reads files" (legacy behavior).
It also sidesteps the webhook blocker entirely: instead of needing an org
conversion or GitHub App to make Projects→file write-back real-time, Build
itself becomes the synchronization — it reads the board, flips the card, and
the file follows. No infrastructure required beyond the `gh` token you already
have. The manual sync script (`duet-sync-pull.sh`) remains for the cases the
helper doesn't cover (you edit fields on the board outside a Build pull).

**Files (expected).**
- `scripts/duet-pull-next.sh` — the helper: query Status=Next, pick one, flip
  board + file atomically.
- `~/.agents/skills/duet-build/SKILL.md` + `.pi/agents/duet-build.md` +
  duet-repo mirror — pull-rule section rewritten to call the helper.
- `docs/queue.md` — Build pull rule rewritten (board-primary).
- No `webapp/` changes — pure scripts + docs.
