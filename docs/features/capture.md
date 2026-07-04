---
slug: capture
title: "Capture (⌘K quick-add + NL parsing)"
feature_area: capture-triage
status: shipped
spec: —             # no spec; predates the duet protocol
verified: 2026-07-03
---

# Capture

**What.** `⌘K` opens a floating input from anywhere. Type, `Enter` saves + closes;
`⌘Enter` saves + keeps open (rapid-fire). Parsed tokens show as inline chips
before commit. Lands in the universal Inbox (no lens until triage).

**NL tokens parsed** (`inbox/parseCapture.ts`):
- Dates: `today`, `tomorrow`/`tmrw`, `tonight`, `next week`/`next month`, weekday
  names, `jun 30`, `6/30`, plus `@today`/`@tomorrow`/`@tonight` prefixed forms.
- `#mvp` → project hint (first `#` only); resolved at triage.
- `@errands @phone` → context tags.
- Priority: `!1/!2/!3`, `!low/!normal/!important/!high`, `!/!!/!!!`.
- Size: `~20m ~1h ~XL`; time tokens map to S/M/L/XL.

**Files.** `components/ui/CapturePopover.tsx`; `inbox/parseCapture.ts`;
`createInboxItem` in `inbox/operations.ts`.

**Done?** Shipped. Target met: thought → inbox, keyboard-only.

**Spec.** None (predates duet). Reference: FEATURES.md F1/F2 (feature-level only).
