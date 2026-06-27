---
feature: social-auth-google
status: review
spec_owner: discover
build_owner: build
---

# Feature: Google social auth

## Summary

Add Google as a second auth method alongside email, so visitors can sign up
and log in with one click instead of creating and verifying a password. This
is the #1 predictable checkout-friction remover for an unknown, no-reputation
app. Scope is intentionally Google-only (no GitHub/Apple/etc.) — one provider
covers the overwhelming majority, and each added provider is ongoing
maintenance + a broken-flow risk.

> **Depends on `legal-pages-oauth`.** Google's consent screen verification
> requires the Privacy Policy to disclose Google as a processor, and both
> Privacy + Terms linked at the signup form. Land that spec first (or in the
> same PR); otherwise the OAuth flow works technically but shows users a
> "Google hasn't verified this app" warning.

## Why

The landing page sells a calm, low-friction promise; the signup asks for the
opposite — a password + email-verification round-trip before the visitor has
felt any value. For a focus app aimed at the easily-overwhelmed, that's the
cheapest possible bounce. Social auth collapses the moment-of-truth to a
single Google click. `webapp/AGENTS.md` flags social auth as a known backlog
item; this spec locks it.

## Done-conditions

- [ ] **`main.wasp.ts` declares the Google method.** `auth.methods.google`
      exists with its own `userSignupFields` import (per Wasp 0.24 —
      `auth.methods.google.userSignupFields`), alongside the existing
      `auth.methods.email`. Verified by reading the spec file.
- [ ] **A Google `userSignupFields` is defined.** New file
      `src/auth/google/userSignupFields.ts` using `defineUserSignupFields`,
      mapping Google's profile data to the existing `User` schema:
      `fullName` ← `data.profile.name` (or
      `data.names[0].displayName`); `firstName` ← first token of the same.
      Must NOT throw if Google omits the name (fall back to email-localpart),
      because some Google accounts have no profile name.
- [ ] **Env vars are wired.** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
      are referenced (Wasp reads them from `.env.server` in dev and Railway
      service vars in prod). Added to `.env.server` (empty placeholder +
      comment) and to the prod env checklist. **No secret values committed.**
- [ ] **The login + signup pages offer Google.** `LoginPage.tsx` and
      `SignupPage.tsx` render a "Continue with Google" button (Wasp provides
      `loginWithGoogle` / `signupForm` helpers — use the Wasp-generated OAuth
      flow, not a hand-rolled one). Styled to match the existing
      `AuthLayout` tokens (the `AuthLayout.css` is already modified in the
      working tree — confirm visual consistency).
- [ ] **OAuth callback works in dev.** The Google OAuth consent screen has a
      test user; logging in as that user in dev (`localhost:4000`) creates a
      `User`, runs `ensureOnboarded`, and lands on `/app` (or `/welcome` once
      `first-run-experience` ships — whichever merges first). Verified
      manually by Build.
- [ ] **OAuth callback works in prod.** `actionamp.com`'s authorized redirect
      URI is registered in the Google Cloud console (Wasp's standard
      `/auth/google/callback` path). A prod login completes end-to-end. If
      Build cannot verify prod (no access), flag it as an Open Question for
      Discover to confirm after merge.
- [ ] **The Google consent screen references the live `/privacy` and `/terms`
      URLs.** Done as part of Google Cloud console setup (not code); recorded
      in the review so Discover can verify the screen passes verification.
- [ ] **Account linking is not required for v1.** A user who signs up with
      email and later uses Google with the same address: Wasp's default
      behavior applies (document what it is in the review). No custom
      merge/merge-prompt UI in this spec — that's a follow-up if it causes
      duplicate accounts.
- [ ] **`wasp compile` passes.**
- [ ] **Existing email auth + its e2e (`e2e/login.spec.ts`) still pass.**
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No other providers** (GitHub, Apple, Microsoft). Google only.
- **No account-merge UI.** Document default Wasp linking behavior; defer.
- **No "magic link" / passwordless email.** Out of scope.
- **No changes to the email-verification flow.** It stays as-is for email users.
- **No changes to the `User` schema.** `fullName`/`firstName` already exist
  and hold the Google-provided names. No migration.
- **No Founding-100 / billing interaction.** Google users are FREE by default,
  same as email users; they upgrade via the same Stripe flow.

## Open questions

- **Prod redirect URI registration.** Build: if you don't have Google Cloud
  access, list the exact URI(s) Wasp expects (dev + prod) in the review so
  Discover/the user can register them. Don't block on it — register after.
- **Wasp default account-linking behavior.** Confirm what Wasp 0.24 does when
  a Google email matches an existing email account, and state it in the
  review. Discover will decide if a merge UI is needed later.

## Prototypes

_(none — standard Wasp OAuth flow; the UI is one button in the existing
AuthLayout.)_
