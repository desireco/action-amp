import { vi } from "vitest";

/**
 * Mock context for testing domain cores as plain functions (ported verbatim
 * from webapp/src/test/mockContext.ts — F4c).
 *
 * Every core is just `(entities, args) => ...`, so we call it directly with
 * hand-rolled entity delegates that are vi.fn() spies. The spies REPLACE the
 * delegates entirely: they record the core's exact payloads and never run the
 * seam's client-side defaults (`mintId`, the `updatedAt` re-stamp) — see
 * docs/plans/tasks-port-inventory.md §6. Assertions therefore port from the
 * webapp suite unchanged.
 *
 * ponytail: the `any` on the returned context is deliberate. Matching the
 * seam's `Entities` type exactly isn't worth it for test internals — we assert
 * on delegate call args, not on context typing; the per-test
 * `as Parameters<typeof core>[0]` casts do the (runtime-safe) narrowing.
 */

type EntitySpy = {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

function entitySpy(): EntitySpy {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
    // groupBy resolves to an empty array by default — most callers don't use it,
    // and an empty group is the safe "no aggregated rows" shape.
    groupBy: vi.fn().mockResolvedValue([]),
  };
}

export interface MockContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any;
  entities: Record<string, EntitySpy>;
}

/** A user shape with the fields entitlement guards read (plan/planRenewsAt). */
export interface MockUser {
  id: string;
  plan?: string | null;
  planRenewsAt?: Date | null;
}

/**
 * Build a mock context.
 * - `userId` (string) — a minimal authenticated user (FREE, no plan fields).
 * - `null` — an unauthenticated request (context.user === null).
 * - `MockUser` object — an authenticated user with explicit plan/planRenewsAt,
 *   for entitlement tests (FREE / active-PRO / expired-PRO / FOUNDER).
 */
export function mockContext(userId: string | MockUser | null = "user-1"): MockContext {
  const entities = {
    User: entitySpy(),
    Task: entitySpy(),
    TaskUpdate: entitySpy(),
    TaskSession: entitySpy(),
    Project: entitySpy(),
    Goal: entitySpy(),
    InboxItem: entitySpy(),
    InboxAttachment: entitySpy(),
    TaskAttachment: entitySpy(),
    ProjectAttachment: entitySpy(),
    ResourceAttachment: entitySpy(),
    ListItemAttachment: entitySpy(),
    ListItem: entitySpy(),
    Resource: entitySpy(),
    Lens: entitySpy(),
    Tag: entitySpy(),
    Payment: entitySpy(),
    AnalyticsSession: entitySpy(),
    AnalyticsEvent: entitySpy(),
    LoginEvent: entitySpy(),
    AdminUserAction: entitySpy(),
    Feedback: entitySpy(),
    Review: entitySpy(),
  };
  // Normalize: string → { id }, MockUser → as-is, null → unauthenticated.
  const user =
    userId === null
      ? null
      : typeof userId === "string"
        ? { id: userId }
        : userId;
  return {
    context: {
      user,
      entities,
    },
    entities,
  };
}
