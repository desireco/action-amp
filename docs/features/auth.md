---
slug: auth
title: "Auth (passwordless email live; Google OAuth written but disabled)"
feature_area: foundation
status: partial
spec: social-auth-google.md     # done (code-side) — but see reality note
verified: 2026-07-29
---

# Auth

**Passwordless email — live (2026-07-28, replacing passwords).** `/login` sends
a six-digit code *and* a sign-in link; either creates a normal Wasp session.
`auth/magicLogin.ts` owns the `MagicLoginChallenge` flow: 10-min TTL, 1-min
resend throttle, 5-attempt cap, atomic `consumedAt` consume (no double-session
races), delivery failures logged + the credential deleted so nothing usable
leaks. A newer request supersedes every older challenge for the same address.
Passwords + password reset are gone from the UI; the email provider stays on
for identity + code delivery. Localhost uses a fixed `111111` for manual QA.

**Successful-login evidence.** Both magic login and Wasp's built-in successful
login hook best-effort update `User.lastLoginAt` and append a bounded-provider
`LoginEvent`. Recorder failures never invalidate an already-created session;
legacy accounts are not backfilled.

**Google OAuth — written, NOT wired.** Code exists (`auth/google/`,
`GoogleButton.tsx`) but:
- The google provider block in `main.wasp.ts` is **commented out** ("disabled to
  skip GOOGLE_CLIENT_ID/SECRET setup for now").
- `GoogleButton.tsx` **returns `null`** (body commented).

So only email auth actually works in the running app.

**Reality vs. spec.** The `social-auth-google` spec is marked `done (code-side)`,
which is accurate as far as it goes — the code is written and the
`userSignupFields` never-throws name resolution is verified. But the feature is
**not wired on**, so from a user's perspective it does not exist. Catalog status
= `partial`.

**Non-code gate (user-owned, GTM §B):** create the Google Cloud OAuth client +
register `actionamp.com/auth/google/callback` (+ localhost) + add a test user +
set `GOOGLE_CLIENT_ID`/`SECRET` in Railway. Then uncomment the provider block.
The callback verifies once the client exists.
