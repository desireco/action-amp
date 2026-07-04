---
slug: retention-criticalpath
title: "Retention critical path (first-7-days funnel + dead-end fixes)"
feature_area: foundation
status: missing
spec: retention-criticalpath.md   # ready — depends on observability
verified: 2026-07-03
---

# Retention critical path

**Wanted.** Instrument the first-7-days funnel (`lastSeenAt` + 3 activation
events: seed-completed, first-capture, first-triage) and close the known
dead-ends (onboarding→seed disconnect, post-completion dead-end, empty-Inbox
affordance).

**Today.** Not built.

**Spec.** `docs/specs/retention-criticalpath.md` (`ready`). **Depends on
`observability-minimal`.** Data-gated fixes (re-engagement email, etc.) are
explicitly deferred to wait on the numbers.

**Why it matters.** Retention is the second bet (after "do they want this?").
Only worth building once the gauntlet produces a signal.
