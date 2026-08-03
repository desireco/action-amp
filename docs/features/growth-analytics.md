---
slug: growth-analytics
title: "First-party growth analytics and admin dashboard"
feature_area: foundation
status: shipped
spec: growth-analytics.md    # ready
verified: 2026-08-03
---

# First-party growth analytics

**Wanted.** An admin-only, first-party session and event ledger with source
attribution, activation/checkout funnels, retention cohorts, and individual
user timelines. StatCounter remains anonymous acquisition reporting; the
database is the source of truth for signed-in activity and payment facts.

**Today.** The app records typed first-party sessions/events at landing, signup,
app open, onboarding, capture, triage, focus, task completion, checkout, and
verified payment boundaries. Admin Funnel reads those aggregates; StatCounter
remains the anonymous acquisition context.

**Spec.** `docs/specs/growth-analytics.md` (`ready`).

**Why it matters.** Shows which channels create active, paying users and where
they stop without sending account identity or product content to StatCounter.

**Files.** `analytics/operationsCore.ts` (validated writes + funnel
aggregates); `analytics/tracking.ts` (client boundary); `analytics/eventApi.ts`
(public site intake); `admin/AdminFunnelPage.tsx`; `schema.prisma`
(`AnalyticsSession`, `AnalyticsEvent`).
