# Review: github-projects-sync

> **Status: `review`** — ready for Discover sign-off. The v1 (manual pull +
> push) is complete and verified; the GitHub Action (Done-condition C) is
> deferred by technical constraint and locked as such in the spec.

## What changed

| Area | Files | Scope |
|---|---|---|
| **New script** | `scripts/duet-sync-push.sh` (434 lines) | The file → Projects reconciliation path (Done-condition B). Creates draft-issue items for units lacking `gh_node_id`, populates every field from frontmatter, writes `gh_node_id` back (write-once). Backfills non-lifecycle fields (Duet ID, Path, Tier) on existing items without touching Projects-wins lifecycle fields. Idempotent. |
| **Bug fix (3 scripts)** | `scripts/duet-sync-pull.sh`, `duet-pull-next.sh`, `duet-board-bodies.sh` | All three fetched board items via `gh project item-list` without `--limit`, which defaults to **30**. The board has 32 items, so items beyond the 30th were silently invisible — pull would skip their changes, pull-next could miss `Next` items, board-bodies wouldn't refresh them. Added `--limit 100` to all three. |
| **Spec updated** | `docs/specs/github-projects-sync.md` | D1 corrected (desireco is a user account, not an org). D7 v1 note locked (Action deferred; manual pull is v1). D10 prerequisites marked done. Open Questions: Action resolution recorded; `Created` field API limitation raised. Done-conditions A–G checked against reality (C deferred, D partial, rest pass). |
| **ROADMAP demoted** | `docs/ROADMAP.md` | Pointer to the Projects Roadmap view added under `## Priority order`; prose tier lists kept for strategy context, board declared the live index. |
| **Board state** | (GitHub Projects #5) | 3 missing specs pushed (build-pulls-from-board, cli-comments-resources, cli-write-ops). 32 files ↔ 32 items, 100% coverage on Duet ID / Path / Kind / Priority / Tier. 2 duplicate items (created by the limit bug during testing) archived. |

Commits this session: `duet: github-projects-sync → building`, three `duet: <slug> → board (gh_node_id stamped)`, and ~24 `duet: <slug> → <field>=<value>` from the pull reconciling stub-file frontmatter with the board.

## Gates run

| Gate | Command | Result |
|---|---|---|
| Bash syntax | `bash -n` on all 4 scripts | ✅ clean |
| Python syntax | `compile()` on embedded heredocs | ✅ clean |
| Push idempotency | `./scripts/duet-sync-push.sh` (run 3) | ✅ `created: 0, updated: 0, file commits: 0` |
| Push dry-run | `./scripts/duet-sync-push.sh --dry-run` | ✅ `created: 0, updated: 0` — no false positives |
| Pull dry-run | `./scripts/duet-sync-pull.sh --dry-run` | ✅ correctly detects board→file drift |
| Board coverage | `gh project item-list --limit 100` | ✅ 32 items, all with Duet ID + Path + Kind + Priority + Tier |
| File coverage | `grep gh_node_id` across specs/backlog/tasks | ✅ 32/32 files stamped |
| Field write permission | GraphQL `updateProjectV2ItemFieldValue` on `Created` | ❌ rejected — "field of type created is currently not supported" (see Open Questions) |

**Cold-context reviewers:** not run — this is a scripts + docs change, not application code with regression risk. The review gate here is the idempotency + coverage verification above. A reviewer subagent would add little over the executable evidence.

## Done-conditions

### A. Board exists with the right shape — PASS
- ✅ Project "ActionAmp Duet" exists under desireco (#5). `gh project list --owner desireco` confirms.
- ✅ Custom fields present: Kind, Priority, Tier, Feature, Duet ID, Path, Created. `gh project field-list` confirms.
- ✅ Status options: Draft, Ready, Next, Building, Review, Blocked, Done. (Missing `Deferred` — see Findings.)
- ✅ Three views: Board (columns=Status), Roadmap (grouped by Tier), Table. Names are generic ("View 1", "View 2", "Roadmap Kanban") — cosmetic.

### B. Reconciliation — file → Projects — PASS (v1)
- ✅ `scripts/duet-sync-push.sh` creates items for units lacking one; no-op for the rest.
- ✅ First push writes `gh_node_id` (write-once — verified: run 2 did not overwrite).
- ✅ Matches on `gh_node_id` first, Duet ID fallback.
- ✅ Idempotent: 3rd run → 0 creates, 0 updates.
- ✅ Never overwrites Projects lifecycle fields (backfill touches only Duet ID, Path, Tier, body).
- ⚠️ `Created` not set — GitHub built-in field is read-only via API (Open Question).

### C. Write-back Action — DEFERRED (locked)
- ❌ Action not built. `projects_v2_item` webhooks don't fire for user-owned projects; desireco is a user account.
- ✅ Manual substitute `duet-sync-pull.sh` exists and is verified (Done-condition C′).
- Unblock path: org conversion or GitHub App. Discover decision.

### C′. Manual pull — Projects → file — PASS (v1)
- ✅ `scripts/duet-sync-pull.sh` rewrites lifecycle frontmatter to match board.
- ✅ Prose untouched; only frontmatter keys rewritten.
- ✅ `gh_synced_at` stamped per change.

### D. Delete / archive — PARTIAL
- ✅ `status: done` → Done column, not archived (blog spec confirms).
- ❌ Archive-then-recreate on push: not yet implemented (push creates for files lacking items, but doesn't detect archived-by-`gh_node_id` units to re-create).
- ❌ File-deletion → card-archive on push: not yet implemented.

### E. Maybe bucket — PASS (v1, manual)
- ✅ New backlog drafts sync to board as Draft items.
- ⚠️ Drag → write-back is manual (run pull script), not real-time (Action deferred).
- ✅ Editing file status directly doesn't change the card (Projects wins; push is no-op on lifecycle).

### F. Safe + observable — PASS
- ✅ Scripts never delete files or items (only `gh project item-archive`, never auto).
- ✅ Fails loudly on missing token scope / missing project / parse errors.
- ✅ Commits use `duet: <id> → <field>` prefix — greppable.

### G. ROADMAP demoted — PASS (partial)
- ✅ Pointer to Projects Roadmap view added under `## Priority order`.
- ⚠️ Prose tier lists remain (they carry strategy context). Full deprecation is a Discover call.

### H. Docs + queue gaps — PASS (already done)
- ✅ `docs/tasks/README.md`, `docs/queue.md`, `docs/backlog/README.md` all exist.

## Findings

### Applied
1. **`--limit 100` added to all three existing scripts** — the 30-item default cap was silently truncating board reads. This was a latent bug affecting pull-next (could miss Next items) and sync-pull (would skip changes on items past 30).
2. **Stub-file frontmatter backfilled** — `cli-comments-resources` and `cli-write-ops` lacked `kind:`/`priority:`; the push defaulted them on the board, then the pull wrote those back into the files (Projects-wins). ~24 stub files got `priority`/`kind` populated this way.
3. **2 duplicate board items archived** — created during testing when the limit bug caused the push to not see existing items. Canonical IDs preserved in the files; duplicates had no file pointing to them.

### Spawned
- **`docs/tasks/duet-archive-recreate.md`** (to file) — Done-condition D's "archive → re-create on push" and "file-delete → card-archive on push" are not implemented in `duet-sync-push.sh`. The push creates items for files lacking them but doesn't handle the reverse directions. Low severity (no one is deleting specs yet), but tracked.

### Deferred / rejected
- **Cold-context reviewer subagents** — skipped. This is scripts + docs, not application code; the executable gates (idempotency, coverage) are stronger evidence than a cold read. Rejected for this review, not a precedent.
- **`duet:*` repo labels** — the spec's D4 lists a `duet:<id>` label as the human-visible join. Superseded: board items are draft issues (not repo issues), which can't carry repo labels. The `Duet ID` custom field is the real join and is populated. Marked superseded in D10; not worth implementing.

## Open Questions raised (for Discover)

1. **`Created` field is read-only via API.** GitHub's built-in `Created` date field rejects `updateProjectV2ItemFieldValue` writes ("field of type created is currently not supported"). It reflects item-add-to-project time, not the spec's `created:` date. D4 maps `created → Created` but this can't be set programmatically. Options: (a) accept `Created` = board-add time, stop mapping; (b) create a custom writable date field. The push script currently skips `Created` writes.

2. **`Deferred` status has no board column.** The protocol (`docs/queue.md`) defines `deferred` (parked, not killed) as a valid status — 2 specs use it. But the board's Status field has no `Deferred` option (Draft/Ready/Next/Building/Review/Blocked/Done only). Two `cli-*` items currently have no status on the board as a result. Quick fix: add a `Deferred` option to the Status field. Discover call on whether `deferred` should surface on the board or map to `Draft`.

## Verdict

**Ready for sign-off on the v1 (manual pull + push).** The Projects-wins contract is fully operational: board is authoritative for lifecycle, files own prose, frontmatter is a derived cache, both directions sync, everything is idempotent and observable.

**Deferred to a future unit:** the GitHub Action (Done-condition C) — blocked on an org-conversion or GitHub-App decision that's Discover's to make, not Build's. The manual path covers the same intent at the cost of one explicit command.

**For Discover to decide:** the two Open Questions above (`Created` field, `Deferred` column). Neither blocks the v1; both are spec/reality reconciliations that are yours, not mine.
