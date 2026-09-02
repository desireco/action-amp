import { defineConfig } from 'drizzle-kit';

// F4a — introspection config. `bun run db:introspect` (drizzle-kit pull) is
// READ-ONLY against the live actionamp_dev DB (the Wasp/Prisma schema); it
// writes the pull baseline to ./drizzle (sql + meta snapshot). The curated
// schema it seeds lives in src/db/schema/ — after any regen, reconcile there
// and re-apply the one sanctioned hand-edit (the bytea customType; see
// docs/plans/introspection-report.md §7). Never run db:push against that DB.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://jake@localhost:5432/actionamp_dev',
  },
});
