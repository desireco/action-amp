---
slug: inbox-triage
title: "Inbox + Triage (co-author wizard; lossless Archive)"
feature_area: capture-triage
status: shipped
spec: —             # no spec; predates the duet protocol
verified: 2026-07-03
---

# Inbox + Triage

**What.** Two surfaces.
- **Inbox** (`inbox/InboxPage.tsx`) — lists unprocessed items newest-first with
  parsed-token chips; row click or "Triage" → `/app/inbox/review?i=N`.
- **Triage** (`inbox/TriagePage.tsx`) — a per-item **specification wizard**, not
  one-key dispatch: (1) Context/Lens radio, (2) Type — Task / Project /
  Note(Resource) / Archive, (3) Spec — inline-expanding rows (When/Size/Priority/
  Project/Goal). Complete is gated until lens + filing target set.

**Archive is lossless.** `triageInboxItem` "archive" sets `InboxItem.status =
ARCHIVED` (does **not** delete). Recoverable from the Logbook via
`restoreArchivedItem` (clears `archivedAt`, returns to UNPROCESSED).

**Files.** `inbox/InboxPage.tsx`; `inbox/TriagePage.tsx`; `inbox/operations.ts`
(`triageInboxItem`, `restoreArchivedItem`).

**Done?** Shipped. Canonical pattern: TRIAGE.md §4; structural: WORKFLOW.md §2.2.

**Spec.** None (predates duet). Note: FEATURES.md F6's one-key keymap is obsolete.
