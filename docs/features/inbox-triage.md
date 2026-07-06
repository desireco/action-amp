---
slug: inbox-triage
title: "Inbox + Triage (co-author wizard; lossless Archive)"
feature_area: capture-triage
status: shipped
spec: —             # no spec; predates the duet protocol
verified: 2026-07-04
---

# Inbox + Triage

**What.** Two surfaces.
- **Inbox** (`inbox/InboxPage.tsx`) — lists unprocessed items newest-first with
  parsed-token chips; row click or "Triage" → `/app/inbox/review?i=N`.
- **Triage** (`inbox/TriagePage.tsx`) — a per-item **specification wizard**, not
  one-key dispatch: (1) Context/Lens radio, (2) Type — Task / Project /
  Note(Resource) / Archive, (3) Spec — inline-expanding rows (When/Size/Priority/
  Project/Goal). Complete is gated until lens + filing target set.

**Resolver pre-fill** (grammar v2, `docs/specs/done/capture-grammar.md`, shipped).
The Context step pre-fills from two inference paths, neither of which silently
files — the user still hits Continue:
- **`[[lens]]` token** (explicit): `[[work]]` / `[[personal]]` / `[[me]]` /
  `[[custom-name]]` resolves on `kind` (seeded) or name (custom); pre-fills the
  Context radio with a "from `[[ ]]`" chip.
- **Project-bridged** (explicit or inferred): the resolver matches the first
  `#project` hint or project names in the cleaned text against the inferred
  lens's projects (whitespace/sentence-boundary, longest wins). A matched
  project pre-fills both the Project row and that project's lens on the Context
  step. `[[ ]]` precedence wins on disagreement.

**Archive is lossless.** `triageInboxItem` "archive" sets `InboxItem.status =
ARCHIVED` (does **not** delete). Recoverable from the Logbook via
`restoreArchivedItem` (clears `archivedAt`, returns to UNPROCESSED).

**Files.** `inbox/InboxPage.tsx`; `inbox/TriagePage.tsx`; `inbox/operations.ts`
(`triageInboxItem`, `restoreArchivedItem`).

**Done?** Shipped. Canonical pattern: TRIAGE.md §4; structural: WORKFLOW.md §2.2.

**Spec.** None (predates duet) for the wizard itself. The v2 capture grammar +
resolver that feeds the Context pre-fill is spec'd at
`docs/specs/done/capture-grammar.md` (draft). Note: FEATURES.md F6's one-key keymap
is obsolete.
