// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { assertLensAllowed } = vi.hoisted(() => ({
  assertLensAllowed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../billing/entitlementHttp", () => ({ assertLensAllowed }));

import { createListItem, getSimpleList, renameListItem } from "./operations";

function context() {
  return {
    user: { id: "user-1", plan: "PRO", planRenewsAt: null, isAdmin: false },
    entities: {
      Lens: { findFirst: vi.fn().mockResolvedValue({ id: "list-1", type: "SIMPLE_LIST" }) },
      ListItem: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "item-2" }),
        update: vi.fn().mockResolvedValue({ id: "item-1" }),
      },
    },
  };
}

describe("Simple-list operation entitlement boundary", () => {
  it("checks Lens entitlement before reading a list", async () => {
    const ctx = context();
    await getSimpleList({ lensId: "list-1" }, ctx as never);
    expect(assertLensAllowed).toHaveBeenCalledWith(ctx, "list-1");
  });

  it("passes shared context through a direct list creation", async () => {
    const ctx = context();
    ctx.entities.ListItem.findFirst.mockResolvedValue({ order: 0 });

    await createListItem({
      lensId: "list-1",
      text: "Read this",
      content: "Useful details",
      sourceUrl: "https://example.com",
    }, ctx as never);

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

    await renameListItem({ id: "item-1", text: "Milk" }, ctx as never);

    expect(assertLensAllowed).toHaveBeenCalledWith(ctx, "list-1");
    expect(ctx.entities.ListItem.update).toHaveBeenCalled();
  });

  it("does not reach list data when entitlement rejects", async () => {
    const ctx = context();
    assertLensAllowed.mockRejectedValueOnce(new Error("Pro feature"));

    await expect(getSimpleList({ lensId: "list-1" }, ctx as never)).rejects.toThrow(
      /Pro feature/,
    );
    expect(ctx.entities.ListItem.findMany).not.toHaveBeenCalled();
  });
});
