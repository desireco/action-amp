// F4a — Drizzle schema for the existing actionamp_dev database (the Wasp /
// Prisma schema, introspected read-only via `bun run db:introspect`).
// Tables live in ./schema/index.ts (generated; since F4b: timestamp(3),
// timestamptz(3) and @db.Date columns run mode:'date' for Prisma-Date parity,
// plus the sanctioned bytea hand-edit), relations in ./schema/relations.ts
// (generated). Default handling that used to live in the Prisma client
// (uuid ids, @updatedAt, permalinks) is supplied by the seam — see
// ./client.ts (`mintId`, `taskUpdateSet`) and
// docs/plans/introspection-report.md §4.
//
// F4b adds the seam: `createDb` (postgres-js + Drizzle) and `createEntities`
// (the Prisma-shaped delegate surface the ported operationsCores speak).
// Arg/row types for that surface live in ./seam.ts; Prisma-model row
// equivalents (Task, Tag, …) in ./types.ts.
export * from './schema/index.js';
export * from './schema/relations.js';
export * from './types.js';
export * from './seam.js';
export * from './client.js';
