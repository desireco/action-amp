---
slug: logbook
title: "Logbook (completed + Archived section, Restore)"
feature_area: review
status: shipped
spec: —
verified: 2026-07-03
---

# Logbook

**What.** The catch-all record of things no longer active (`/app/logbook`,
`logbook/LogbookPage.tsx`). Groups completed tasks + completed projects +
archived notes by day (Today / Yesterday / weekday / date). Archived rows get an
"Archived" chip and a **Restore** action that returns the note to the Inbox.

**Op.** `getLogbook` merges all three kinds.

**Files.** `logbook/LogbookPage.tsx`; `logbook/operations.ts`.

**Done?** Shipped.

**Note.** WORKFLOW.md §2.5 flags the broader Review/reporting area (metrics,
trends, stuck items) as the *least-built area* — net-new work, not in this
catalog entry.
