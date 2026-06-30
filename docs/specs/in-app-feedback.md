---
feature: in-app-feedback
status: done
spec_owner: build
build_owner: build
---

# Feature: In-app feedback

## Summary

Authenticated users can leave feedback from a loudspeaker button near the `?`
shortcut control. The app stores the feedback with enough context to respond and
debug: user, email, route, Work/Plan/Review section, active lens, and user agent.

In production, the server also emails the configured admin address after the DB
write. In local development and tests, it only stores the row.

## Configuration

- `ACTIONAMP_ADMIN_EMAIL` controls the notification recipient.
- Default: `zeljko@dakic.com`.
- Email sends only when `NODE_ENV === "production"`.

## Done Conditions

- [x] `Feedback` Prisma model exists and belongs to `User`.
- [x] Authenticated `submitFeedback` action stores message + context.
- [x] Production-only email notification uses the configured admin address.
- [x] Local dev/test do not send email.
- [x] Shell has a loudspeaker button near `?`.
- [x] Modal is a simple text form with submit/cancel states.
