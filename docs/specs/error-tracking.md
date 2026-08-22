---
feature: error-tracking
status: done
priority: P2
kind: spec
---

# Feature: Error tracking

## Summary

Make unexpected production failures traceable. ActionAmp's own error records
remain bounded and sanitized in Railway; the app also loads Better Stack's
frontend Error Tracking tag in production.

## Done-conditions

- [x] Every API and Operation response carries `x-actionamp-request-id`.
- [x] Unexpected server exceptions record a sanitized message, stack, cause
      chain, release, request method/path, and error ID.
- [x] React render failures, browser errors, and unhandled promise rejections
      report sanitized browser/component stacks through a write-only endpoint.
- [x] The root React boundary replaces a blank screen with a calm reload action.
- [x] Browser reports are deduplicated, bounded, and rate-limited server-side.
- [x] Better Stack's public frontend tag token is loaded only outside local
      development; it never enters the server environment.
- [x] ActionAmp's structured error records do not intentionally include email
      addresses, credentials, URL query strings, cookies, user IDs, or task
      content. Better Stack tag collection is governed by its remote settings.
- [x] Expected typed HTTP failures are not reported as exceptions.
- [x] Focused tests, Oxlint, and `wasp compile` pass.

## Non-goals

- A new admin dashboard.
- Configuring Better Stack's remotely managed collection and replay settings.
- Server-side Better Stack ingestion. Railway remains the server error sink.
- Swallowing fatal process errors; Node retains its normal crash behavior.
