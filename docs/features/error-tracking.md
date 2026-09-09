---
slug: error-tracking
title: "Privacy-safe error and stack tracking"
feature_area: foundation
status: shipped
spec: error-tracking.md
verified: 2026-09-09
---

# Error tracking

**Wanted.** Turn a vague production failure into a searchable stack and error
ID without recording the person's work.

**Today.** Server exceptions land as structured JSON in Railway's log drain
(`api/src/logger.ts`; every request carries a request ID). The frontend
reports to the Better Stack application `actionamp` through its public
JavaScript tag (`web/static/betterstack.js`), injected by the root layout on
the app surface only — the flow/marketing pages (`/login`, `/signup`,
`/welcome`, `/founding-100`, `/share`, `/cli`) and the separate `site/`
marketing app stay out of telemetry, and local dev never loads it. The tag's
collection scope is configured remotely in Better Stack.

The old webapp additionally had its own sanitized client-error endpoint and a
render-crash reload screen (`old-webapp/src/observability/`, retired
reference); those pieces are not ported to the new stack yet.

**Spec.** `docs/specs/error-tracking.md` (`done` — original Wasp build).

**Implementation.** `web/static/betterstack.js` + `web/src/lib/telemetry.ts` +
`web/src/routes/+layout.svelte` (frontend tag, live); `api/src/logger.ts` +
`api/src/index.ts` (server side → Railway drain).
