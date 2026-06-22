import { defineUserSignupFields } from "wasp/server/auth";

/**
 * Signup collects ONE field: `fullName`. We extract `firstName` (first token)
 * server-side so the client form stays a single input. `preferredName` is set
 * later during onboarding and defaults to `firstName` when unset.
 */
export const userSignupFields = defineUserSignupFields({
  fullName: (data: { fullName?: unknown }) => {
    if (typeof data.fullName !== "string" || data.fullName.trim() === "") {
      throw new Error("Full name is required.");
    }
    return data.fullName.trim();
  },
  firstName: (data: { fullName?: unknown }) => {
    const full = typeof data.fullName === "string" ? data.fullName.trim() : "";
    if (full === "") {
      throw new Error("Full name is required.");
    }
    return full.split(/\s+/)[0];
  },
});
