import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockContext } from "../test/mockContext";

const { assertSitewideSearchAccess, throwHttpStatus } = vi.hoisted(() => ({
  assertSitewideSearchAccess: vi.fn(),
  throwHttpStatus: vi.fn((status: number, message: string) => {
    throw new Error(`${status}: ${message}`);
  }),
}));

vi.mock("../billing/entitlementHttp", () => ({
  assertSitewideSearchAccess,
  throwHttpStatus,
}));

import { getCommandPaletteIndex, searchSite } from "./operations";

describe("searchSite operation", () => {
  beforeEach(() => {
    assertSitewideSearchAccess.mockReset();
    throwHttpStatus.mockClear();
  });

  it("rejects unauthenticated callers before touching data", async () => {
    const m = mockContext(null);
    await expect(searchSite({ query: "renewal" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
    expect(assertSitewideSearchAccess).not.toHaveBeenCalled();
  });

  it("enforces entitlement before every tenant-scoped search", async () => {
    const m = mockContext({
      id: "user-1",
      plan: "PRO",
      planRenewsAt: new Date(Date.now() + 60_000),
    });
    for (const entity of [
      "Task",
      "Project",
      "Goal",
      "Resource",
      "InboxItem",
    ] as const) {
      m.entities[entity].findMany.mockResolvedValue([]);
    }

    await searchSite({ query: "  vendor renewal " }, m.context);

    expect(assertSitewideSearchAccess).toHaveBeenCalledWith(m.context);
    expect(m.entities.Task.findMany.mock.calls[0][0].where.userId).toBe(
      "user-1",
    );
  });

  it("returns a 400-shaped error for invalid query length", async () => {
    const m = mockContext();
    await expect(searchSite({ query: "x" }, m.context)).rejects.toThrow(/400/);
    expect(throwHttpStatus).toHaveBeenCalledWith(
      400,
      expect.stringMatching(/at least 2/),
    );
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });

  it("does not read entities when the entitlement guard rejects", async () => {
    const m = mockContext({ id: "user-1", plan: "FREE" });
    assertSitewideSearchAccess.mockImplementationOnce(() => {
      throw new Error("402: Command palette and search is a Pro feature.");
    });
    await expect(searchSite({ query: "renewal" }, m.context)).rejects.toThrow(
      /402/,
    );
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });
});

describe("getCommandPaletteIndex operation", () => {
  beforeEach(() => assertSitewideSearchAccess.mockReset());

  it("rejects unauthenticated callers before touching index data", async () => {
    const m = mockContext(null);
    await expect(getCommandPaletteIndex(undefined, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
    expect(assertSitewideSearchAccess).not.toHaveBeenCalled();
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });

  it("enforces the same entitlement before reading the compact index", async () => {
    const m = mockContext({ id: "user-1", plan: "PRO" });
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

    await getCommandPaletteIndex(undefined, m.context);

    expect(assertSitewideSearchAccess).toHaveBeenCalledWith(m.context);
    expect(m.entities.Lens.findMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
    });
  });

  it("does not read index entities when the entitlement guard rejects", async () => {
    const m = mockContext({ id: "user-1", plan: "FREE" });
    assertSitewideSearchAccess.mockImplementationOnce(() => {
      throw new Error("402: Command palette and search is a Pro feature.");
    });
    await expect(getCommandPaletteIndex(undefined, m.context)).rejects.toThrow(
      /402/,
    );
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });
});
