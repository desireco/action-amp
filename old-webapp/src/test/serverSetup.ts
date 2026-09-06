// Server-project setup — runs before each server test file's imports.
//
// The server project has NO Wasp client plugin, so modules that
// runtime-import `wasp/server` (billing/entitlementHttp, auth/sessionAuth,
// onboarding's PrismaClient) load for real here. Those modules validate env
// at import time, so the vars must exist before any test module loads:
// vitest sets NODE_ENV=test (the server schema wants development|production)
// and no DATABASE_URL/RESEND_API_KEY exist in the bare test process. Values
// are inert — no query ever reaches a database (entity delegates are mocks).

// Vitest forces NODE_ENV=test; the Wasp server env schema accepts only
// development|production.
process.env.NODE_ENV = "development";
// Schema-required placeholders — never used to connect (all delegates mocked).
process.env.DATABASE_URL ??= "postgresql://vitest:vitest@localhost:5432/vitest";
process.env.RESEND_API_KEY ??= "vitest-placeholder";
