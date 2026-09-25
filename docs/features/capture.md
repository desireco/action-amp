---
slug: capture
title: "Capture (⌘K quick-add + NL parsing)"
feature_area: capture-triage
status: shipped
spec: docs/specs/done/capture-grammar.md
verified: 2026-09-24
---

# Capture

**What.** `⌘K` opens a floating input from anywhere. Type, `Enter` saves + closes;
`⌘Enter` saves + keeps open (rapid-fire). Parsed tokens show as inline chips
before commit. Lands in the universal Inbox (no lens until triage).

**Typeahead + cheat-sheet** (2026-09-24, #8). `#`, `[[`, and `!` at a word
start open the shared autocomplete dropdown — projects, the user's lenses,
and the priority words, filtered as you type (↑/↓ navigate, Enter/Tab
accept, Esc close). A `?` toggle in the foot reveals the token cheat-sheet:
the grammar, the bang ladder, and the image-intake paths. The picks stay in
the text grammar — the parser remains the only brain; prose exclamation
(`Hello!`) never triggers.

**Images: attach, paste, or drop** (2026-09-24, #7 + #13). The popover's attach
button splits by pointer type: touch devices get an explicit source menu —
"Take photo" (`capture="environment"`, the rear camera) and "Choose from
library" (the camera roll / files) — because Android PWA pickers skip the
camera and iOS's native sheet isn't guaranteed everywhere; pointer machines go
straight to the file-system picker. `⌘V` into the input attaches clipboard
images (screenshots); dropping a file stages it on the open popover (the whole
overlay is the target; the webapp's drop-on-closed-FAB preload is not ported).
Up to four images, ≤5 MB each, `image/*` only — staged as removable thumbnails,
validated client-side with the same caps + error copy as the server's
`prepareImageAttachments` (which re-validates). Saves through
`createInboxItem`'s `attachments` — the identical InboxItem path the Android
share target and `actionamp capture --file` use. Text stays required (the
contract's `text ≥ 1`).

**NL tokens parsed** (`inbox/parseCapture.ts`) — **grammar v2** (locked
2026-07-04, `docs/specs/done/capture-grammar.md`):

| Sigil | Means | Examples |
|---|---|---|
| `#` | project first, tags after | `#mvp #deep-work`; `#[Q3 Launch] #errands` |
| `@` | schedule/snooze time | `@today @tomorrow` become calendar schedules; `@tonight` becomes an exact local-time snooze; bare forms + weekday/month forms also work |
| `!` | priority | `!1/!2/!3`, `!low/!normal/!important/!high`; the bang ladder: `!` low · `!!` normal · `!!!` important |
| `~` | size | `~20m ~1h ~XL`; time tokens map to S/M/L/XL |
| `[[name]]` | lens override | `[[work]] [[personal]] [[me]] [[studio]]`; resolves on `kind` (seeded) or name (custom); unknown → literal text |
| *(free text)* | project fallback | resolver can still match project names in the active/inferred lens; whitespace/sentence-boundary, longest wins |

Replaces v1's `@` context tags. The first `#` token is the explicit project
hint; remaining `#` tokens are tags. The resolver bridges capture to lens
through a matched project's `lensId`. `[[ ]]` precedence beats project-inferred
lens.

**Files.** `web/src/lib/components/CapturePopover.svelte`;
`web/src/lib/capture/parse.ts`; `createInboxItem` in
`packages/contract/src/inbox.ts`; `web/src/lib/capture/files.ts` (client
image intake).

**Done?** Shipped: thought → inbox, keyboard-only, grammar v2 parser,
resolver, `[[ ]]`, `InboxItem.parsedLens`, and image intake (attach button +
touch source menu, paste, drop).

**Spec.** `docs/specs/done/capture-grammar.md` (v2). Reference: FEATURES.md F1/F2
(feature-level only).
