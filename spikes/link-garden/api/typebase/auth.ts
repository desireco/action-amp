import { defineAuth } from "typebase-io/server";

export const auth = defineAuth({
  trustedOrigins: ["http://localhost:5173", "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
  },
});
