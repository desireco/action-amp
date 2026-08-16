---
slug: capture
title: "Capture (⌘K quick-add + NL parsing)"
feature_area: capture-triage
status: shipped
spec: docs/specs/done/capture-grammar.md
verified: 2026-08-16
---

# Capture

**What.** `⌘K` opens a floating input from anywhere. Type, `Enter` saves + closes;
`⌘Enter` saves + keeps open (rapid-fire). Parsed tokens show as inline chips
before commit. Lands in the universal Inbox (no lens until triage).

**Images: paste or drop** (2026-08-16). `⌘V` into the input attaches clipboard
images (screenshots); dropping a file works on the open popover (the whole
overlay is the target) and on the Capture FAB, which opens the popover with the
files preloaded. Up to four images, ≤5 MB each, `image/*` only — validated
client-side with the same caps + error copy as the server's
`prepareImageAttachments` (which re-validates). Pending images show as
removable thumbnails before commit; an image alone is submittable (no text
needed). Saves through `createInboxItem`'s `attachments` — the identical
InboxItem path the Android share target and `actionamp capture --file` use.
Image-only captures use the first filename as display text (SharePage
precedent). Helpers: `shared/imageFiles.ts` (DataTransfer extraction + base64).

**NL tokens parsed** (`inbox/parseCapture.ts`) — **grammar v2** (locked
2026-07-04, `docs/specs/done/capture-grammar.md`):

| Sigil | Means | Examples |
|---|---|---|
| `#` | project first, tags after | `#mvp #deep-work`; `#[Q3 Launch] #errands` |
| `@` | date (time only) | `@today @tomorrow @tonight`; bare `today`/`tomorrow`/`tonight` + weekday/month forms also work |
| `!` | priority | `!1/!2/!3`, `!low/!normal/!important/!high`, `!/!!/!!!` |
| `~` | size | `~20m ~1h ~XL`; time tokens map to S/M/L/XL |
| `[[name]]` | lens override | `[[work]] [[personal]] [[me]] [[studio]]`; resolves on `kind` (seeded) or name (custom); unknown → literal text |
| *(free text)* | project fallback | resolver can still match project names in the active/inferred lens; whitespace/sentence-boundary, longest wins |

Replaces v1's `@` context tags. The first `#` token is the explicit project
hint; remaining `#` tokens are tags. The resolver bridges capture to lens
through a matched project's `lensId`. `[[ ]]` precedence beats project-inferred
lens.

**Files.** `components/ui/CapturePopover.tsx`; `inbox/parseCapture.ts`;
`createInboxItem` in `inbox/operations.ts`; `shared/imageFiles.ts` (client
image intake).

**Done?** Shipped: thought → inbox, keyboard-only, grammar v2 parser,
resolver, `[[ ]]`, `InboxItem.parsedLens`, and image intake (paste + drop).

**Spec.** `docs/specs/done/capture-grammar.md` (v2). Reference: FEATURES.md F1/F2
(feature-level only).
