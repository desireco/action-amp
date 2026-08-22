---
slug: error-tracking
title: "Privacy-safe error and stack tracking"
feature_area: foundation
status: shipped
spec: error-tracking.md
verified: 2026-08-22
---

# Error tracking

**Wanted.** Turn a vague production failure into a searchable stack and error
ID without recording the person's work.

**Today.** Server exceptions and ActionAmp's own browser/React reports emit
bounded, sanitized JSON into Railway logs. Better Stack application `actionamp`
also collects production frontend telemetry through its public JavaScript tag;
its collection scope is configured remotely in Better Stack. Requests receive
a correlation ID, browser reports are deduplicated and rate-limited, and a
render crash shows a calm reload screen instead of a blank app.

**Spec.** `docs/specs/error-tracking.md` (`done`).

**Implementation.** `webapp/src/observability/`,
`webapp/src/auth/serverMiddleware.ts`, `webapp/src/App.tsx`, and
`webapp/main.wasp.ts`.
