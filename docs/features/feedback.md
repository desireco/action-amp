---
slug: feedback
title: "In-app feedback (loudspeaker → modal → admin email)"
feature_area: foundation
status: shipped
spec: in-app-feedback.md       # done
verified: 2026-07-03
---

# In-app feedback

**What.** A loudspeaker icon in the AppShell utility cluster opens a feedback
dialog (`app/FeedbackDialog.tsx`; textarea, 4000-char limit, send/cancel).
`submitFeedback` records message + current route + Work/Plan/Review section +
lens + user agent. Production sends an admin email to `ACTIONAMP_ADMIN_EMAIL`
(default `zeljko@dakic.com`) after the DB write; dev stores only.

**Files.** `app/AppShell.tsx` (trigger); `app/FeedbackDialog.tsx`;
`feedback/operations.ts`.

**Done?** Shipped (in-app-feedback spec, done 2026-06-30).
