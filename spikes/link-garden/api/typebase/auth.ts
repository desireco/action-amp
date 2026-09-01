import { defineAuth } from "typebase-io/server";

// Static literals only: typebase's codegen statically extracts trustedOrigins
// into the generated server — dynamic/env-driven values are silently dropped.
// Clients are pinned to 5173 (SvelteKit) and 3000 (Imba) by the dispatch files.
export const auth = defineAuth({
  trustedOrigins: ["http://localhost:5173", "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
  },
});
