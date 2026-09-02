import { describe, expect, it } from "vitest";
import { mockContext } from "../test/mockContext.js";
import { getCommandPaletteIndex, searchSite } from "./operations.js";

// Ported from webapp/src/search/operations.test.ts (S9). The Wasp op wrappers
// became the domain op layer (`operations.ts`) — the REAL entitlement guard
// runs (genuine HttpError 402/400s, no module mocking). Guard wiring is
// asserted through behavior: an entitled user's op call proceeds to entity
// reads; a FREE user's call rejects with 402 before any read.
// Adaptation only: the ops take `(entities, user, args)` instead of Wasp's
// `(args, context)` — same sequence, same byte-exact errors.

// An active PRO user (plan + unexpired renewal) — the entitlement state the
// sitewide-search guard admits. planRenewsAt is load-bearing: isPlanActive
// treats a PRO plan with a null/past renewal date as FREE.
const ACTIVE_PRO = {
  id: "user-1",
  plan: "PRO",
  planRenewsAt: new Date(Date.now() + 60_000),
};

describe("searchSite operation", () => {
  it("rejects unauthenticated callers before touching data", async () => {
    const m = mockContext(null);
    await expect(
      searchSite(m.entities, null, { query: "renewal" }),
    ).rejects.toThrow(/Not authenticated/);
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });

  it("lets an entitled (active PRO) user search tenant-scoped entities", async () => {
    const m = mockContext(null);
    for (const entity of [
      "Task",
      "Project",
      "Goal",
      "Resource",
      "InboxItem",
    ] as const) {
      m.entities[entity].findMany.mockResolvedValue([]);
    }

    await searchSite(
      m.entities,
      ACTIVE_PRO,
      { query: "  vendor renewal " },
    );

    expect(m.entities.Task.findMany.mock.calls[0][0].where.userId).toBe(
      "user-1",
    );
  });

  it("returns a 400-shaped error for invalid query length", async () => {
    const m = mockContext(null);
    await expect(
      searchSite(m.entities, ACTIVE_PRO, { query: "x" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/at least 2/),
    });
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });

  it("does not read entities when the entitlement guard rejects (FREE plan)", async () => {
    const m = mockContext(null);
    await expect(
      searchSite(m.entities, { id: "user-1", plan: "FREE" }, { query: "renewal" }),
    ).rejects.toMatchObject({
      statusCode: 402,
    });
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });
});

describe("getCommandPaletteIndex operation", () => {
  it("rejects unauthenticated callers before touching index data", async () => {
    const m = mockContext(null);
    await expect(
      getCommandPaletteIndex(m.entities, null),
    ).rejects.toThrow(/Not authenticated/);
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });

  it("enforces the same entitlement before reading the compact index", async () => {
    const m = mockContext(null);
    for (const entity of [
      "Task",
      "Project",
      "Goal",
      "Resource",
      "InboxItem",
      "Lens",
    ] as const) {
      m.entities[entity].findMany.mockResolvedValue([]);
    }

    await getCommandPaletteIndex(m.entities, ACTIVE_PRO);

    expect(m.entities.Lens.findMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
    });
  });

  it("does not read index entities when the entitlement guard rejects (FREE plan)", async () => {
    const m = mockContext(null);
    await expect(
      getCommandPaletteIndex(m.entities, { id: "user-1", plan: "FREE" }),
    ).rejects.toMatchObject({ statusCode: 402 });
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });
});
