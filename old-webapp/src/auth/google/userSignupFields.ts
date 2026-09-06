import { defineUserSignupFields } from "wasp/server/auth";

/**
 * Google social-auth signup fields.
 *
 * Maps Google's `/userinfo` profile data to the existing `User` schema fields
 * (`fullName`, `firstName`), mirroring what the email signup collects. Wasp
 * passes the Google profile under `data.profile`; the fields available depend
 * on the scopes requested (see ./config.ts — we request `profile` + `email`).
 *
 * Google's `name` field is the display name; `given_name` is the first name.
 * Some Google accounts have NO profile name (e.g. org-managed accounts with
 * restricted profiles), so we must NEVER throw — we fall back to the email's
 * local-part so the user always lands with a usable name (re-editable in
 * onboarding/Settings). `fullName`/`firstName` are NOT NULL on `User`.
 *
 * Reference: Wasp 0.24 social-auth/google docs (data.profile shape).
 */

// The shape Wasp hands to a Google `userSignupFields` callback. Kept loose to
// match the docs' example; Wasp types the provider data at the generated layer.
type GoogleSignupData = {
  profile?: {
    name?: string;
    given_name?: string;
    email?: string;
  };
};

/** A safe, non-empty display name — never throws. */
function resolveFullName(data: GoogleSignupData): string {
  const name = data.profile?.name?.trim();
  if (name) return name;
  // Fall back to the email local-part (everything before @).
  const email = data.profile?.email?.trim();
  if (email) return email.split("@")[0] || "there";
  return "there";
}

export const userSignupFields = defineUserSignupFields({
  fullName: (data: GoogleSignupData) => resolveFullName(data),

  firstName: (data: GoogleSignupData) => {
    // Prefer Google's explicit given_name; else the first token of the full
    // name we resolved; else the email local-part.
    const given = data.profile?.given_name?.trim();
    if (given) return given;
    return resolveFullName(data).split(/\s+/)[0];
  },
});
