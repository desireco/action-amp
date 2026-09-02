// F4a — Drizzle schema for the existing actionamp_dev database (the Wasp /
// Prisma schema, introspected read-only via `bun run db:introspect`).
// Tables live in ./schema/index.ts (generated, bytea hand-bound), relations
// in ./schema/relations.ts (generated). Default handling that used to live
// in the Prisma client (uuid ids, @updatedAt) is documented in
// docs/plans/introspection-report.md — the domain layer must supply those
// values on insert.
export * from './schema/index.js';
export * from './schema/relations.js';
