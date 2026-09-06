import { defineUserSignupFields } from "wasp/server/auth";

/**
 * Signup collects ONE field: `fullName`. We extract `firstName` (first token)
 * server-side so the client form stays a single input. `preferredName` is set
 * later during onboarding and defaults to `firstName` when unset.
 */
/** A JSON value as the signup request body can carry (concrete arms only). */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Primitive-string test — the signup body only ever carries JSON primitives,
 *  so constructor identity is exact. */
function isText(value: Json | undefined): value is string {
  return value?.constructor === String;
}

function requiredFullName(data: { fullName?: Json }): string {
  const raw = data.fullName;
  if (!isText(raw) || raw.trim() === "") {
    throw new Error("Full name is required.");
  }
  return raw.trim();
}

export const userSignupFields = defineUserSignupFields({
  fullName: (data: { fullName?: Json }) => requiredFullName(data),
  firstName: (data: { fullName?: Json }) =>
    requiredFullName(data).split(/\s+/)[0],
});
