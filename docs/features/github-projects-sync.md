---
slug: github-projects-sync
title: "GitHub Projects board (two-way sync with Duet markdown)"
feature_area: cross-cutting
status: missing
spec: github-projects-sync.md   # ready — locked 2026-07-07
verified: 2026-07-07
---

# GitHub Projects board (two-way sync with Duet markdown)

**Wanted.** A GitHub Projects (beta) board owned by the `desireco` org that
mirrors the Duet work queue (`docs/specs/`, `docs/backlog/`, `docs/tasks/`) as
a Now/Next/Later board, with two-way sync on structured fields (status,
priority, title, kind, feature) and one-way sync on prose (repo → GitHub). The
markdown stays the source of truth; the board is a view.

**Today.** **No code.** Duet runs entirely on markdown frontmatter + the
filesystem. The `gh` CLI is authed as `desireco` but its token is missing the
`read:project` / `project` scopes (`gh project list` returns a scope error).
No GitHub Project exists. Both Duet skills reference a round-robin contract at
`docs/queue.md` that didn't exist until this spec cycle.

**Spec.** `docs/specs/github-projects-sync.md` — **`ready`** (locked
2026-07-07). Headline decisions: org-level board; **field-split sync model**
(structured bidirectional, prose one-way) resolving the two-way risk; stable
identity via `gh_node_id` write-once frontmatter; manual CLI sync for v1
(webhook deferred); markdown-wins-on-conflict with a visible breadcrumb comment
on the overwritten GH item.

**Why it matters.** Duet's filesystem-as-bus contract is great for agents but
hostile to humans scanning a queue. ~25 live units across `draft`/`ready`/
`deferred` already lose signal in a flat list. A board view — without
abandoning the in-repo audit log or the review gate — makes the backlog
legible at a glance and lets the user reprioritize by dragging cards. This is
the "Now, Next, Later" surface the user asked for, built on top of the existing
protocol rather than replacing it.

**Files (expected).**
- `scripts/duet-sync.mjs` (or `.sh`) — the push/pull sync script.
- Frontmatter additions on synced units: `gh_node_id` (write-once),
  `gh_synced_at` (last sync timestamp).
- `docs/queue.md`, `docs/tasks/README.md` — companion gap-fills (created in
  this spec cycle, not by Build).
- No `webapp/` changes — this is a docs/scripts-surface feature, not app code.
