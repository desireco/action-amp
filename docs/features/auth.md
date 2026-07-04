---
slug: auth
title: "Auth (email live; Google OAuth written but disabled)"
feature_area: foundation
status: partial
spec: social-auth-google.md     # done (code-side) — but see reality note
verified: 2026-07-03
---

# Auth

**Email — live.** `auth/email/*` (Login, Signup, EmailVerification,
PasswordReset, RequestPasswordReset) + `userSignupFields`. Enabled in
`main.wasp.ts`.

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
