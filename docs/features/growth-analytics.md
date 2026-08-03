---
slug: growth-analytics
title: "First-party growth analytics and admin dashboard"
feature_area: foundation
status: missing
spec: growth-analytics.md    # ready
verified: 2026-08-03
---

# First-party growth analytics

**Wanted.** An admin-only, first-party session and event ledger with source
attribution, activation/checkout funnels, retention cohorts, and individual
user timelines. StatCounter remains anonymous acquisition reporting; the
database is the source of truth for signed-in activity and payment facts.

**Today.** StatCounter's base snippet runs on the public site and app. The app
has no first-party analytics session/event models or Growth dashboard.

**Spec.** `docs/specs/growth-analytics.md` (`ready`).

**Why it matters.** Shows which channels create active, paying users and where
they stop without sending account identity or product content to StatCounter.
