// @vitest-environment node
// Server project: the REAL entitlement guards run (see vitest.config.ts).
// Guard wiring is asserted through behavior — the guard's own tenancy-safe
// Project/Lens.findFirst queries — rather than spies.
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
          id: "me-1",
          name: "Me",
          isIncluded: true,
        }),
      },
      Project: {
        findFirst: vi.fn().mockResolvedValue({
          id: "list-1",
          name: "Shopping",
          lensId: "me-1",
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

/** The guard's own project-resolution query (tenancy-safe id+userId filter). */
function projectLookup(projectId: string) {
  return expect.objectContaining({
    where: { id: projectId, userId: "user-1" },
  });
}

describe("Simple-list operation entitlement boundary", () => {
  it("checks the project's Lens entitlement before reading a list", async () => {
    const ctx = context();
    // SAFETY: mock context bypasses Wasp context type; only tested fields matter.
    await getSimpleList({ projectId: "list-1" }, ctx as never);
    // The real guard resolved the project (and its lens) tenancy-safely first.
    expect(ctx.entities.Project.findFirst).toHaveBeenCalledWith(
      projectLookup("list-1"),
    );
    expect(ctx.entities.Lens.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "me-1", userId: "user-1" } }),
    );
    expect(ctx.entities.ListItem.findMany).toHaveBeenCalled();
  });

  it("passes shared context through a direct list creation", async () => {
    const ctx = context();
    ctx.entities.ListItem.findFirst.mockResolvedValue({ order: 0 });

    await createListItem(
      {
        projectId: "list-1",
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
        projectId: "list-1",
        text: "Read this",
        content: "Useful details",
        sourceUrl: "https://example.com",
        order: 1,
      },
    });
  });

  it("resolves an item's project Lens and checks entitlement before mutation", async () => {
    const ctx = context();
    ctx.entities.ListItem.findFirst
      .mockResolvedValueOnce({ projectId: "list-1" })
      .mockResolvedValueOnce({ id: "item-1", project: { type: "SIMPLE_LIST" } });

    await renameListItem(
      { id: "item-1", text: "Milk" },
      // SAFETY: mock context bypasses Wasp context type; only tested fields matter.
      ctx as never,
    );

    expect(ctx.entities.Project.findFirst).toHaveBeenCalledWith(
      projectLookup("list-1"),
    );
    expect(ctx.entities.ListItem.update).toHaveBeenCalled();
  });

  it("does not reach list data when entitlement rejects", async () => {
    // FREE user + a list in a non-included lens → the real guard throws 402.
    const ctx = context();
    ctx.user = {
      id: "user-1",
      plan: "FREE",
      planRenewsAt: null,
      isAdmin: false,
    };
    ctx.entities.Project.findFirst.mockResolvedValue({
      id: "list-1",
      name: "Work list",
      lensId: "work-1",
      type: "SIMPLE_LIST",
    });
    ctx.entities.Lens.findFirst.mockResolvedValue({
      id: "work-1",
      name: "Work",
      isIncluded: false,
    });

    await expect(
      getSimpleList(
        { projectId: "list-1" },
        // SAFETY: mock context bypasses Wasp context type; only tested fields matter.
        ctx as never,
      ),
    ).rejects.toMatchObject({ statusCode: 402 });
    expect(ctx.entities.ListItem.findMany).not.toHaveBeenCalled();
  });
});
