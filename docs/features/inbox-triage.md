---
slug: inbox-triage
title: "Inbox + Triage (co-author wizard)"
feature_area: capture-triage
status: shipped
spec: —             # no spec; predates the duet protocol
verified: 2026-07-04
---

# Inbox + Triage

**What.** Two surfaces.
- **Inbox** (`inbox/InboxPage.tsx`) — a centered queue surface that lists
  unprocessed items newest-first with parsed-token chips. Its queue header keeps
  count + Start triage together; the empty state uses the same bounded surface
  so zero, one, and many items all retain a deliberate composition. Row click
  or "Start triage" → `/do/inbox/review?i=N`.
- **Triage** (`inbox/TriagePage.tsx`) — a per-item **specification wizard**, not
  one-key dispatch: (1) Context/Lens radio, (2) Type — Task / Project /
  Note(Resource) / Delete, (3) Spec — inline-expanding rows (When/Size/Priority/
  Project/Goal). Ready is gated until lens + filing target set.

**Image attachments are viewable** (2026-08-16). Items captured with images
(Android share target) show their thumbnails inline — on the inbox row and on
the triage card while deciding; click opens the full image. Served by
`GET /api/attachments/:id` (`attachments/serveAttachment.ts`), the only
reader of the attachment `data` blobs (InboxAttachment + ListItemAttachment,
owner-gated, `Cache-Control: private, immutable`). The route is the storage
seam: if attachments move to object storage, that handler is the single
place to rewrite. Auth is `auth:false` + `auth/sessionAuth.ts` (session-cookie
middleware — `<img>` loads can't send an Authorization header; see the
session-cookie notes in `auth/sessionCookie.ts` + `auth/sessionCookieMirror.ts`).

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

**Files.** `inbox/InboxPage.tsx`; `inbox/TriagePage.tsx`; `inbox/operations.ts`
(`triageInboxItem`).

**Done?** Shipped. Canonical pattern: TRIAGE.md §4; structural: WORKFLOW.md §2.2.

**Spec.** None (predates duet) for the wizard itself. The v2 capture grammar +
resolver that feeds the Context pre-fill is spec'd at
`docs/specs/done/capture-grammar.md` (draft). Note: FEATURES.md F6's one-key keymap
is obsolete.
