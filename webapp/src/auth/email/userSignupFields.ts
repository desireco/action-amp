import { defineUserSignupFields } from "wasp/server/auth";

export const userSignupFields = defineUserSignupFields({
  firstName: (data) => {
    if (typeof data.firstName !== "string" || data.firstName.trim() === "") {
      throw new Error("First name is required.");
    }
    return data.firstName.trim();
  },
  lastName: (data) => {
    if (typeof data.lastName !== "string" || data.lastName.trim() === "") {
      throw new Error("Last name is required.");
    }
    return data.lastName.trim();
  },
});
