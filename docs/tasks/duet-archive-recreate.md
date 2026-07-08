---
id: duet-archive-recreate
kind: task
title: "Push script: handle archive re-create + file-delete archive (Done-condition D)"
status: draft
priority: P3
feature: github-projects-sync
parent: github-projects-sync
created: 2026-07-08
---

# Task: Push script — archive/file-delete reconciliation

Spawned from `reviews/github-projects-sync.md`. Done-condition D of
`docs/specs/github-projects-sync.md` specifies two reverse-direction
behaviors the push script (`scripts/duet-sync-push.sh`) does not yet
implement:

## What's missing

1. **Archive → re-create.** When a board item is archived but the file still
   exists (with `gh_node_id` pointing at the archived item), the next
   `--push` should detect the orphaned `gh_node_id`, create a new item, and
   emit a warning ("orphaned unit re-created"). Currently the push matches on
   `gh_node_id`, finds nothing (archived items don't appear in `item-list`),
   falls back to Duet ID, and may create a duplicate.

2. **File-delete → archive.** When a file is deleted from the repo but its
   board item still exists, the next `--push` should archive the matching
   card with a sync note. Currently the push only iterates files; it has no
   "find board items with no file" pass.

## Done-conditions

- [ ] Archiving a card leaves the file untouched; next `--push` re-creates
      the item with a warning.
- [ ] Deleting a file from the repo archives the matching card on next
      `--push` (with a sync note in the item body before archiving).
- [ ] Both paths are idempotent and fail loudly on API errors.

## Why P3

No specs are being deleted or archived today. The gap is real but dormant;
it only bites when someone archives a card or removes a spec file. Track it,
don't rush it.
