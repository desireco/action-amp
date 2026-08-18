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

**Bare URLs in captured text are real links** (2026-08-18). The row's title
and body run through `components/ui/Linkify.tsx`: `http(s)://` and `www.`
tokens render as anchors (`target="_blank"`, `rel="noopener noreferrer"`;
bare `www.` hosts get the `https://` scheme, trailing sentence punctuation
stays text, only URL-constructor-valid matches linkify). The row still
navigates to triage on click via a **stretched link** (`.aa-inbox__row-link`,
an absolute overlay over the row) so the URL anchors and the media cover
remain clickable siblings above it — never anchors nested inside the triage
anchor. Links follow the Markdown.tsx treatment (subtle underline, teal on
hover; base styles ship with `Linkify.css`). The **triage card's read-only
Classify body linkifies the same way** — the Spec step's title editor stays
raw text (an editor, not a viewer).

**Image attachments are viewable** (2026-08-16). Items captured with images
(Android share target, ⌘K paste/drop, or the CLI) show their media inline.
The **inbox row leads with a square media cover on the left** — 96px (72px
narrow screens), first image, `+N` badge when more follow — with the text,
source hostname, and parsed chips to its right; the link chip shows the
share's hostname, not a generic label. The **triage card shows media large** —
the first image at ~2–3× thumbnail size spanning the card (`clamp(144px, 26vh,
224px)`, `object-fit: contain` — never cropped), with multiple images as a
scroll-snap carousel (swipe/trackpad, prev/next chevrons, clickable dots) so
an item can be judged by what was actually shared. Clicking any image opens
the **lightbox**: an in-app ~70% modal over a dimmed backdrop (popover-family
shell, INTERACTION.md §9.2/§9.5) with Esc/backdrop-click dismissal and ←/→
cycling for multi-image items. Bytes are served by
`GET /api/attachments/:id` (`attachments/serveAttachment.ts`), the only
reader of the attachment `data` blobs (InboxAttachment + ListItemAttachment

- TaskAttachment, owner-gated, `Cache-Control: private, immutable`). The route is the storage
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

**Image attachments survive every dispatch decision** (2026-08-16). Items
captured with images and triaged to a task (Today/Upcoming/Someday) carry
their blobs onto `TaskAttachment` rows — created in the same atomic write as
the Task, then the seed `InboxItem` delete cascades only the originals. The
**project decision carries too** (`ProjectAttachment`): a captured mockup
triaged into "Website redesign" becomes the project's own media, shown as
display-only thumbs under the project detail header. The **resource decision
carries as well** (`ResourceAttachment`): a screenshot filed as project
reference material renders as row thumbs in the project's Resources section.
(Simple lists already did this via `ListItemAttachment` — every dispatch
decision now preserves media.) The task/project detail pages render the same
thumbs + lightbox, and `task show --json` / `project show --json` /
`resource list --json` (CLI) include the attachment metadata.

**Files.** `inbox/InboxPage.tsx`; `inbox/TriagePage.tsx`; `inbox/operations.ts`
(`triageInboxItem`).

**Done?** Shipped. Canonical pattern: TRIAGE.md §4; structural: WORKFLOW.md §2.2.

**Spec.** None (predates duet) for the wizard itself. The v2 capture grammar +
resolver that feeds the Context pre-fill is spec'd at
`docs/specs/done/capture-grammar.md` (draft). Note: FEATURES.md F6's one-key keymap
is obsolete.
