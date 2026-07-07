---
slug: github-projects-sync
title: "GitHub Projects board (two-way sync with Duet markdown)"
feature_area: cross-cutting
status: missing
spec: github-projects-sync.md   # ready — locked 2026-07-07
verified: 2026-07-07
---

# GitHub Projects board (two-way sync with Duet markdown)

**Wanted.** A GitHub Projects (beta) board owned by the `desireco` org that is
the **management surface** for the Duet work queue — Now/Next/Later as a board,
not a flat markdown list. **Projects owns lifecycle** (`status`, `priority`,
`kind`, `feature`, owner, roadmap tier); humans steer by dragging cards, and a
write-back path propagates those changes into each unit's frontmatter. **Markdown
owns prose** (Summary, Why, Done-conditions, review findings); authored by
Discover, never mutated by sync. Frontmatter lifecycle keys become a derived
cache of Projects so the file stays self-describing.

**Today.** **No code.** Duet runs entirely on markdown frontmatter + the
filesystem. The `gh` CLI is authed as `desireco` but its token is missing the
`read:project` / `project` scopes (`gh project list` returns a scope error).
No GitHub Project exists. Both Duet skills reference a round-robin contract at
`docs/queue.md` that didn't exist until this spec cycle.

**Spec.** `docs/specs/github-projects-sync.md` — **`ready`** (realigned
2026-07-07 to the duet upstream's locked source-of-truth model). Headline
decisions: org-level board; **Projects-wins split** (Projects owns lifecycle,
files own prose, frontmatter is cache); identity via `duet:<id>` label (no
per-file node id); **GitHub Action on `projects_v2_item` is the primary
write-back path** (drag → commit), with `duet sync --push` as reconciliation
for new files; no conflict resolution needed by design (the surfaces own
disjoint fields). The earlier draft's markdown-wins model + `pinned:` flag are
explicitly reversed — see the spec's §Reversal note.

**Why it matters.** Duet's filesystem-as-bus contract is great for agents but
hostile to humans *steering* a queue. ~25 live units across `draft`/`ready`/
`deferred` already lose signal in a flat list. A board where dragging means
something — where a card move becomes a status flip in the file — makes the
backlog legible and steerable without abandoning the in-repo prose audit log
or the review gate. This is the "Now, Next, Later" surface the user asked for,
built on the duet upstream's locked contract rather than replacing it.

**Files (expected).**
- `duet sync --push` (the upstream `duet-sync-cli` spec) — reconciliation: new
  files → Project items; no-op on lifecycle for existing items.
- A `projects_v2_item` GitHub Action (the upstream `github-projects-writeback`
  spec) — the primary write-back path: card moves → frontmatter commits.
- `gh project field-create` setup for the custom fields (Kind, Priority, Tier,
  Feature, Duet ID, Path, Created).
- `docs/queue.md`, `docs/tasks/README.md` — companion gap-fills (already
  landed in this spec cycle).
- No `webapp/` changes — this is docs/scripts/Action surface, not app code.
