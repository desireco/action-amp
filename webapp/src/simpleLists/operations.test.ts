// @vitest-environment node
// Server project: the REAL entitlement guards run (see vitest.config.ts).
// Guard wiring is asserted through behavior — the guard's own tenancy-safe
// Lens.findFirst query — rather than spies.
import { describe, expect, it, vi } from "vitest";

import { createListItem, getSimpleList, renameListItem } from "./operations";

// planRenewsAt is load-bearing: isPlanActive treats PRO with a null/past
// renewal as FREE (the old mocked guard hid this).
const FUTURE = new Date(Date.now() + 60_000);

function context() {
  return {
    user: {
      id: "user-1",
      plan: "PRO",
      planRenewsAt: FUTURE as Date | null,
      isAdmin: false,
    },
    entities: {
      Lens: {
        findFirst: vi.fn().mockResolvedValue({
          id: "list-1",
          name: "Shopping",
          isIncluded: true,
          type: "SIMPLE_LIST",
        }),
      },
      ListItem: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "item-2" }),
        update: vi.fn().mockResolvedValue({ id: "item-1" }),
      },
    },
  };
}

/** The guard's own lens-resolution query (tenancy-safe id+userId filter). */
function lensLookup(lensId: string) {
  return expect.objectContaining({
    where: { id: lensId, userId: "user-1" },
  });
}

describe("Simple-list operation entitlement boundary", () => {
  it("checks Lens entitlement before reading a list", async () => {
    const ctx = context();
    // SAFETY: mock context bypasses Wasp context type; only tested fields matter.
    await getSimpleList({ lensId: "list-1" }, ctx as never);
    // The real guard resolved the lens tenancy-safely before the read.
    expect(ctx.entities.Lens.findFirst).toHaveBeenCalledWith(
      lensLookup("list-1"),
    );
    expect(ctx.entities.ListItem.findMany).toHaveBeenCalled();
  });

  it("passes shared context through a direct list creation", async () => {
    const ctx = context();
    ctx.entities.ListItem.findFirst.mockResolvedValue({ order: 0 });

    await createListItem(
      {
        lensId: "list-1",
        text: "Read this",
        content: "Useful details",
        sourceUrl: "https://example.com",
      },
      // SAFETY: mock context bypasses Wasp context type; only tested fields matter.
      ctx as never,
    );

    expect(ctx.entities.ListItem.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        lensId: "list-1",
        text: "Read this",
        content: "Useful details",
        sourceUrl: "https://example.com",
        order: 1,
      },
    });
  });

  it("resolves an item's Lens and checks entitlement before mutation", async () => {
    const ctx = context();
    ctx.entities.ListItem.findFirst
      .mockResolvedValueOnce({ lensId: "list-1" })
      .mockResolvedValueOnce({ id: "item-1", lens: { type: "SIMPLE_LIST" } });

    await renameListItem(
      { id: "item-1", text: "Milk" },
      // SAFETY: mock context bypasses Wasp context type; only tested fields matter.
      ctx as never,
    );

    expect(ctx.entities.Lens.findFirst).toHaveBeenCalledWith(
      lensLookup("list-1"),
    );
    expect(ctx.entities.ListItem.update).toHaveBeenCalled();
  });

  it("does not reach list data when entitlement rejects", async () => {
    // FREE user + a non-included lens → the real guard throws HttpError 402.
    const ctx = context();
    ctx.user = {
      id: "user-1",
      plan: "FREE",
      planRenewsAt: null,
      isAdmin: false,
    };
    ctx.entities.Lens.findFirst.mockResolvedValue({
      id: "list-1",
      name: "Work",
      isIncluded: false,
      type: "SIMPLE_LIST",
    });

    await expect(
      getSimpleList(
        { lensId: "list-1" },
        // SAFETY: mock context bypasses Wasp context type; only tested fields matter.
        ctx as never,
      ),
    ).rejects.toMatchObject({ statusCode: 402 });
    expect(ctx.entities.ListItem.findMany).not.toHaveBeenCalled();
  });
});
