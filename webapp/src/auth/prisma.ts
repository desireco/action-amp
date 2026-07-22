/**
 * Shared Prisma client for the PAT/CLI auth layer.
 *
 * The PAT middleware and the `/api/cli/*` route handlers run outside Wasp's
 * operation context (PAT routes are `auth: false` custom `api` routes — they
 * receive no `context.entities`), so they need their own Prisma client. This
 * is the one place that owns it: a process-level singleton, instantiated once.
 *
 * Why a singleton, not per-request: each `new PrismaClient()` opens its own
 * connection pool (default `num_cpus * 2 + 1` connections). Instantiating
 * inside a handler creates + tears down a pool per request — under concurrent
 * CLI traffic that exhausts Postgres connections. Same pattern as
 * `create-verified-user.mjs`, `devAutologin.ts`, `feedback/operations.ts`.
 *
 * Wrapped as `entities` (PascalCase model names) so the pure entitlement
 * helpers in `billing/entitlements.ts` accept it — they type `entities` as
 * `{ Lens: { findFirst; findMany }, Task, ... }`, matching the shape Wasp
 * passes to operations. Callers that need the raw client (e.g. for
 * `$disconnect`) use `authPrisma` directly.
 */
import { PrismaClient } from "@prisma/client";

export const authPrisma = new PrismaClient();

/** The shape the pure entitlement helpers expect (PascalCase model delegates). */
export const authEntities = {
  Lens: authPrisma.lens,
  Task: authPrisma.task,
  ApiKey: authPrisma.apiKey,
};
