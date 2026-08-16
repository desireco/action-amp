import { defineConfig } from "vitest/config";
import { wasp } from "wasp/client/vite";

// Vitest config for the ActionAmp webapp — two projects:
//
//  - client: jsdom + Wasp's client plugin (test setup, jest-dom matchers).
//    Everything that renders or imports wasp/client/*. The plugin's
//    detectServerImports rule blocks `wasp/server` runtime imports here —
//    which is why server-importing tests used to vi.mock entire modules.
//
//  - server: node, NO Wasp client plugin. Server-op tests that exercise the
//    real server modules (entitlement guards with genuine HttpError 402s,
//    session auth, module-owned Prisma clients). `wasp/server` resolves via
//    the node_modules/wasp symlink to the generated SDK; src/test/
//    serverSetup.ts pre-sets the env those modules validate at import.
//    Module mocking is banned in this project's test style — server tests
//    drive real guards through mocked entity delegates instead.
//
// Both run from one `npx vitest run`.

const SERVER_TESTS = [
  // Entitlement-guard wiring (real guards; spy assertions became behavior
  // assertions on the guards' own entity queries).
  "src/billing/entitlements.ops.test.ts",
  "src/search/operations.test.ts",
  "src/simpleLists/operations.test.ts",
  "src/goals/operations.test.ts",
  "src/projects/operations.test.ts",
  "src/inbox/operations.test.ts",
  "src/inbox/operations.capture.test.ts",
  "src/tasks/operations.test.ts",
  "src/lenses/operations.test.ts",
  "src/share/shareCapture.test.ts",
];

export default defineConfig({
  // With `projects`, root-level define does not propagate — each project
  // carries its own (notifications/client.ts reads __APP_VERSION__ at effect
  // time; a missing define throws ReferenceError in jsdom).
  define: {
    __APP_VERSION__: JSON.stringify("test"),
  },
  test: {
    projects: [
      {
        define: {
          __APP_VERSION__: JSON.stringify("test"),
        },
        // The server project MUST be listed first: it registers its include
        // list before the client project's catch-all exclude takes effect.
        test: {
          name: "server",
          environment: "node",
          include: SERVER_TESTS,
          setupFiles: ["./src/test/serverSetup.ts"],
        },
      },
      {
        define: {
          __APP_VERSION__: JSON.stringify("test"),
        },
        plugins: [wasp()],
        test: {
          name: "client",
          environment: "jsdom",
          environmentOptions: {
            jsdom: {
              url: "http://localhost",
            },
          },
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["node_modules", ".wasp", ...SERVER_TESTS],
        },
      },
    ],
  },
});
