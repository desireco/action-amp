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

/**
 * The shape the pure entitlement helpers + the operation cores expect
 * (PascalCase model delegates — the same shape Wasp passes to operations).
 *
 * Every model a `/api/cli/*` route's core touches is exposed here so the route
 * can pass a single `entities` object to any core. The PAT middleware resolves
 * the user via `authPrisma.apiKey` directly (it needs the join to User/Auth that
 * the cores never touch), so ApiKey is included for completeness but the cores
 * themselves don't read it.
 */
export const authEntities = {
  User: authPrisma.user,
  Lens: authPrisma.lens,
  Task: authPrisma.task,
  TaskSession: authPrisma.taskSession,
  TaskUpdate: authPrisma.taskUpdate,
  InboxItem: authPrisma.inboxItem,
  InboxAttachment: authPrisma.inboxAttachment,
  // createListItemCore (CLI triage's list-item decision + the share-page
  // direct-to-list path) creates ListItems; without this delegate the CLI
  // route would crash on `undefined.create` at runtime. TaskAttachment,
  // ProjectAttachment, and ResourceAttachment join the set for triage's
  // task/project/resource decisions (same nested-create pattern).
  TaskAttachment: authPrisma.taskAttachment,
  ProjectAttachment: authPrisma.projectAttachment,
  ResourceAttachment: authPrisma.resourceAttachment,
  ListItem: authPrisma.listItem,
  ListItemAttachment: authPrisma.listItemAttachment,
  Project: authPrisma.project,
  Goal: authPrisma.goal,
  Tag: authPrisma.tag,
  Resource: authPrisma.resource,
  Feedback: authPrisma.feedback,
  Review: authPrisma.review,
  Payment: authPrisma.payment,
  AnalyticsSession: authPrisma.analyticsSession,
  AnalyticsEvent: authPrisma.analyticsEvent,
  ApiKey: authPrisma.apiKey,
};
