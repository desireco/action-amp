import { defineConfig } from "vitest/config";
import { wasp } from "wasp/client/vite";

// Vitest config for the ActionAmp webapp.
// Harness: jsdom + Wasp's test setup (jest-dom matchers + RTL cleanup).
// Scope: src/** only — excludes .wasp/out generated code.
export default defineConfig({
  plugins: [wasp()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".wasp"],
  },
});
