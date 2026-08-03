---
slug: observability-minimal
title: "Observability minimal (anonymous acquisition + 4 funnel events)"
feature_area: foundation
status: partial
spec: observability-minimal.md    # ready — provider wired; funnel events pending
verified: 2026-08-03
---

# Observability minimal

**Wanted.** Anonymous acquisition reporting + the 4 funnel events (land →
signup → app-open → checkout). The one number that matters: visitor → checkout %.

**Today.** StatCounter's production snippet is installed on the Astro site and
Wasp app; its event funnel is not yet wired. Identified user activity and the
internal dashboard belong to `growth-analytics`, not StatCounter.

**Spec.** `docs/specs/observability-minimal.md` (`ready`).

**Why it matters.** The single highest-leverage `ready` spec. Unblocks
`retention-criticalpath` and turns GTM from guessing into measuring. This is
the last open item in the validation gauntlet.
