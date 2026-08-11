---
slug: admin-workspace
title: "Dedicated admin workspace"
feature_area: foundation
status: shipped
spec: admin-workspace.md
verified: 2026-08-03
---

# Dedicated admin workspace

**What.** Admins get a separate `/app/admin` shell with its own rail on
desktop and horizontal tab row on mobile. It has Overview, Users, Funnel, and Feedback
destinations. The profile Admin entry opens Overview; the old
`/app/settings/admin` route redirects for bookmark compatibility.

**Device use.** Overview separates unique signed-in app users by mobile,
tablet, desktop, and unclassified browser-session evidence for rolling 7- and
30-day windows. One person can appear in more than one device row.

**Security.** Client navigation hides Admin from non-admin users. Every admin
page and server query/action independently checks `user.isAdmin`.

**Files.** `admin/AdminLayout.tsx`; `admin/AdminPage.tsx`;
`admin/AdminFunnelPage.tsx`; `admin/AdminFeedbackPage.tsx`; `admin/AdminUsersPage.tsx`;
`analytics/operationsCore.ts`; `app/AppShell.tsx`.
