---
id: session-cookie-finish-race
kind: task
title: "Session cookie write races with res finish (ERR_HTTP_HEADERS_SENT)"
status: review             # fix applied in cli-pat-plumbing's review pass; awaits sign-off
priority: P2
feature: null
spec_owner: discover
build_owner: build
parent: cli-pat-plumbing     # surfaced + fixed during that review
created: 2026-07-22

# sync-managed (do not hand-edit; written by duet sync):
# gh_node_id: (pending first duet-sync-push.sh run)
# gh_synced_at: (pending)
---

# Task: Session cookie write races with `res` finish

> **Surfaced + fixed during the `cli-pat-plumbing` review pass** (see
> `docs/reviews/cli-pat-plumbing.md`). Filed as its own task because it is a
> pre-existing bug in `src/auth/sessionCookie.ts`, not part of the PAT scope.
> The fix already shipped with the cli-pat-plumbing branch; this card exists
> so Discover can sign off on the *decision* (best-effort cookie refresh vs a
> deeper rewrite of the finish hook).

## Summary

`sessionCookie.ts:124` calls `res.cookie(SESSION_COOKIE_NAME, ...)` inside a
`res.on("finish")` callback. The `finish` event fires *after* the response has
been written to the wire, so `res.cookie()` (which calls `setHeader`) throws
`ERR_HTTP_HEADERS_SENT` and **crashes the entire dev server process**. Reproduces
on every login (`POST /auth/email/login`) and intermittently on other authed
requests, depending on timing.

This is a real production-crash bug, not a dev-only annoyance: any login where
the response flushes before the `finish` listener runs takes the API down.

## Fix applied (in cli-pat-plumbing branch)

Guarded the cookie write with `!res.headersSent`:

```ts
// src/auth/sessionCookie.ts
if (shouldRefresh && typeof sessionId === "string" && !res.headersSent) {
  res.cookie(SESSION_COOKIE_NAME, sessionId, cookieOptions());
}
```

Rationale: the sliding-refresh cookie is best-effort. If headers already went
out, the client still holds a valid session (its existing cookie / Bearer
token); only this response's refresh is skipped. Crashing the process is
strictly worse than skipping a refresh.

## Done-conditions

- [x] Guard added at `src/auth/sessionCookie.ts:123` (cli-pat-plumbing branch).
- [x] Verified: `POST /auth/email/login` no longer crashes the server (10-step
      PAT e2e in `docs/reviews/cli-pat-plumbing.md` completes with the server
      alive throughout).
- [ ] **Discover sign-off** on the best-effort semantics: is "skip refresh if
      headers sent" acceptable, or should the finish hook move to an earlier
      event (`close` vs `finish`), or should the cookie write happen in the
      route handler before `res.send()`? The applied guard is the minimal,
      obviously-correct fix; the alternatives are larger and out of scope here.

## Non-goals

- No rewrite of the session-cookie refresh mechanism. The guard unblocks; a
  deeper fix (if Discover prefers one) is a separate card.
- No new tests — the race is timing-dependent and not unit-testable without
  mocking the entire response lifecycle. The e2e verification in the cli-pat-
  plumbing review is the evidence.

## Open questions

- Is best-effort refresh acceptable long-term, or do we want the cookie write
  to happen *before* the response starts flowing (in which case `res.cookie`
  should move out of the `finish` hook entirely)? The current fix is
  intentionally minimal; this question is for Discover to decide whether to
  spawn a follow-up.
