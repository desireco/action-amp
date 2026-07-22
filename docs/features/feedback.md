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

**Triage (status workflow).** Each feedback row carries a `status`
(`FeedbackStatus`: `OPEN → IN_PROGRESS → RESOLVED → CLOSED`, default `OPEN`).
Users never see or set it — it's the admin's triage state. The admin CLI
(`admin-cli/`, `actionamp-admin feedback list/show/status`) is the triage
surface; the three `/api/cli/feedback/*` routes are admin-gated (403 for
non-admins). No in-app admin view yet; the core + routes are ready to power one.

**Files.** `app/AppShell.tsx` (trigger); `app/FeedbackDialog.tsx`;
`feedback/operations.ts` (Wasp action, delegates to the core);
`feedback/operationsCore.ts` (pure: submit / list / show / updateStatus — shared
with the routes); `auth/patRoutes.ts` (`/api/cli/feedback/*`, admin-gated);
`admin-cli/src/commands/feedback.ts` (the triage CLI).

**Done?** Shipped (in-app-feedback spec, done 2026-06-30; status workflow +
admin CLI added 2026-07-22).
