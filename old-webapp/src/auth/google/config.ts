/**
 * Google OAuth scope configuration.
 *
 * Wasp's DEFAULT scope for Google is `profile` only — which gives us the user's
 * name but NOT their email. We need the email too (it's the user's identity, it
 * populates the auth record, and the onboarding flow references it). So we
 * request both `profile` and `email`.
 *
 * Reference: Wasp 0.24 social-auth/google docs (configFn + scopes).
 *
 * (No explicit return-type import: `GoogleConfigFn` isn't re-exported from
 * `wasp/server/auth` in 0.24; the `configFn` field in main.wasp.ts type-checks
 * this against the spec's expected shape. Mirrors the docs' own example, which
 * doesn't annotate getConfig.)
 */
export function getConfig() {
  return {
    scopes: ["profile", "email"],
  };
}
