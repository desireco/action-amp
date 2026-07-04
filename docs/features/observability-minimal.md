---
slug: observability-minimal
title: "Observability minimal (one tracker + 4 funnel events)"
feature_area: foundation
status: missing
spec: observability-minimal.md    # ready — GATED (provider pick)
verified: 2026-07-03
---

# Observability minimal

**Wanted.** One privacy-respecting tracker + the 4 funnel events (land →
signup → app-open → checkout). The one number that matters: visitor → checkout %.

**Today.** No analytics. The number is unmeasurable. Every GTM decision is a
guess until this ships.

**Spec.** `docs/specs/observability-minimal.md` (`ready`).

**⚠ Gate (user-owned):** pick Plausible vs PostHog (spec leans Plausible) and
create the site/account + get the key. Code cannot go live without it.

**Why it matters.** The single highest-leverage `ready` spec. Unblocks
`retention-criticalpath` and turns GTM from guessing into measuring. This is
the last open item in the validation gauntlet.
