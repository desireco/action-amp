import { vi } from "vitest";

/**
 * Mock context for testing Wasp server operations as plain functions.
 *
 * Wasp doesn't ship a server-op test helper (see project/testing.md —
 * "currently does not provide a way to test your server-side code"). But every
 * op is just `(args, context) => ...`, so we call it directly with a hand-rolled
 * context whose entity delegates are vi.fn() spies.
 *
 * ponytail: the `any` on the returned context is deliberate. Matching Wasp's
 * generated context type exactly isn't worth it for test internals — we assert
 * on Prisma-method call args, not on context typing. Upgrade path: if Wasp
 * ships a test context factory, swap this out wholesale.
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
    Project: entitySpy(),
    Goal: entitySpy(),
    InboxItem: entitySpy(),
    Resource: entitySpy(),
    Lens: entitySpy(),
    Tag: entitySpy(),
    Payment: entitySpy(),
    Feedback: entitySpy(),
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
