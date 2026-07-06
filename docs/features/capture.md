---
slug: capture
title: "Capture (⌘K quick-add + NL parsing)"
feature_area: capture-triage
status: shipped
spec: docs/specs/done/capture-grammar.md
verified: 2026-07-04
---

# Capture

**What.** `⌘K` opens a floating input from anywhere. Type, `Enter` saves + closes;
`⌘Enter` saves + keeps open (rapid-fire). Parsed tokens show as inline chips
before commit. Lands in the universal Inbox (no lens until triage).

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
`createInboxItem` in `inbox/operations.ts`.

**Done?** Shipped: thought → inbox, keyboard-only, grammar v2 parser,
resolver, `[[ ]]`, and `InboxItem.parsedLens`.

**Spec.** `docs/specs/done/capture-grammar.md` (v2). Reference: FEATURES.md F1/F2
(feature-level only).
