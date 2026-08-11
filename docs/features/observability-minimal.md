---
slug: observability-minimal
title: "Observability minimal (anonymous acquisition + 4 funnel events)"
feature_area: foundation
status: shipped
spec: observability-minimal.md
verified: 2026-08-11
---

# Observability minimal

**Wanted.** Anonymous acquisition reporting + the 4 funnel events (land →
signup → app-open → checkout). The one number that matters: visitor → checkout %.

**Today.** StatCounter runs on the production Astro site and Wasp app and its
four-event funnel is working. Local development traffic is excluded. A
first-party event ledger and admin Funnel add acquisition, activation, payment,
and D1/D7 retention reporting without sending identity or product content to
StatCounter.

**Spec.** `docs/specs/observability-minimal.md` (`done`).

**Why it matters.** Unblocks `retention-criticalpath` and turns GTM from
guessing into measuring. Traffic volume, not missing observability, is now the
constraint.
