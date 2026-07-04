---
slug: capture
title: "Capture (⌘K quick-add + NL parsing)"
feature_area: capture-triage
status: shipped       # grammar v2 is draft (see spec); v1 grammar still shipped in code
spec: docs/specs/capture-grammar.md   # grammar v2 (draft) — supersedes v1 on ship
verified: 2026-07-04
---

# Capture

**What.** `⌘K` opens a floating input from anywhere. Type, `Enter` saves + closes;
`⌘Enter` saves + keeps open (rapid-fire). Parsed tokens show as inline chips
before commit. Lands in the universal Inbox (no lens until triage).

**NL tokens parsed** (`inbox/parseCapture.ts`) — **grammar v2** (locked
2026-07-04, `docs/specs/capture-grammar.md`):

| Sigil | Means | Examples |
|---|---|---|
| `#` | tag | `#deep-work #errands` (any number, lowercased) |
| `@` | date (time only) | `@today @tomorrow @tonight`; bare `today`/`tomorrow`/`tonight` + weekday/month forms also work |
| `!` | priority | `!1/!2/!3`, `!low/!normal/!important/!high`, `!/!!/!!!` |
| `~` | size | `~20m ~1h ~XL`; time tokens map to S/M/L/XL |
| `[[name]]` | lens override | `[[work]] [[personal]] [[me]] [[studio]]`; resolves on `kind` (seeded) or name (custom); unknown → literal text |
| *(free text)* | project hint | resolver matches project names in the active/inferred lens; exact word-boundary, longest wins |

Replaces v1 (where `#` linked a project and `@` was a context tag). Projects
have no sigil in v2 — the resolver bridges capture to lens through a matched
project's `lensId`. `[[ ]]` precedence beats project-inferred lens.

**Files.** `components/ui/CapturePopover.tsx`; `inbox/parseCapture.ts`;
`createInboxItem` in `inbox/operations.ts`.

**Done?** v1 shipped (thought → inbox, keyboard-only). v2 (grammar rewrite +
resolver + `[[ ]]` + `InboxItem.parsedLens`) is `draft` — see the spec.

**Spec.** `docs/specs/capture-grammar.md` (v2, draft). Reference: FEATURES.md
F1/F2 (feature-level only).
