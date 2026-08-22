---
feature: error-tracking
status: done
priority: P2
kind: spec
---

# Feature: Error tracking

## Summary

Make unexpected production failures traceable without introducing user or task
data into telemetry. Railway's existing log stream is the sink; ActionAmp emits
one-line JSON records that can be searched by an opaque error/request ID.

## Done-conditions

- [x] Every API and Operation response carries `x-actionamp-request-id`.
- [x] Unexpected server exceptions record a sanitized message, stack, cause
      chain, release, request method/path, and error ID.
- [x] React render failures, browser errors, and unhandled promise rejections
      report sanitized browser/component stacks through a write-only endpoint.
- [x] The root React boundary replaces a blank screen with a calm reload action.
- [x] Browser reports are deduplicated, bounded, and rate-limited server-side.
- [x] Email addresses, bearer/JWT/database credentials, URL query strings,
      cookies, user IDs, and task content are not intentional telemetry fields.
- [x] Expected typed HTTP failures are not reported as exceptions.
- [x] Focused tests, Oxlint, and `wasp compile` pass.

## Non-goals

- A new admin dashboard.
- Session replay or user identification.
- A third-party error provider. Structured logs keep that choice reversible.
- Swallowing fatal process errors; Node retains its normal crash behavior.
