import { describe, it, expect } from "vitest";
import { triageInboxItem } from "./operations";
import { mockContext } from "../test/mockContext";

/**
 * Triage — the inbox transformation. Canonical Tier C test: the op mutates
 * 4 possible entities across a 6-way decision, then deletes the seed item.
 * Highest server-side risk surface in the app, so it gets the deepest cover.
 *
 * Strategy: call the op directly with a mocked context, assert the right
 * Prisma method fired with the right payload + that the seed was deleted.
 */

const BASE_ITEM = {
  id: "ix-1",
  userId: "user-1",
  text: "Email Sarah",
  parsedPriority: "IMPORTANT" as string | null,
  parsedSize: "S" as string | null,
  parsedDate: null as Date | null,
};

/** Arrange the common precondition: the inbox item exists and is ours. */
function arrange(overrides: Partial<typeof BASE_ITEM> = {}) {
  const m = mockContext();
  m.entities.InboxItem.findUnique.mockResolvedValue({ ...BASE_ITEM, ...overrides });
  return m;
}

describe("triageInboxItem — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      triageInboxItem({ inboxItemId: "ix-1", decision: "trash", lensId: "l" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects an item that belongs to another user", async () => {
    const m = mockContext();
    m.entities.InboxItem.findUnique.mockResolvedValue({
      ...BASE_ITEM,
      userId: "someone-else",
    });
    await expect(
      triageInboxItem({ inboxItemId: "ix-1", decision: "trash", lensId: "l" }, m.context),
    ).rejects.toThrow(/not found/i);
  });
});

describe("triageInboxItem — task decisions", () => {
  it.each([
    ["task-today", "TODAY"],
    ["upcoming", "UPCOMING"],
    ["someday", "SOMEDAY"],
  ] as const)(
    "%s creates a Task with status %s, carrying parsed priority/size",
    async (decision, status) => {
      const m = arrange();
      m.entities.Task.create.mockResolvedValue({ id: "task-9" });

      const result = await triageInboxItem(
        { inboxItemId: "ix-1", decision, lensId: "lens-1" },
        m.context,
      );

      expect(result).toEqual({ kind: "task", id: "task-9" });
      expect(m.entities.Task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status,
          priority: "IMPORTANT",
          size: "S",
          lensId: "lens-1",
          description: "Email Sarah",
        }),
        select: { id: true },
      });
      expect(m.entities.InboxItem.delete).toHaveBeenCalledWith({ where: { id: "ix-1" } });
    },
  );

  it("falls back to NORMAL/M when the item has no parsed tokens", async () => {
    const m = arrange({ parsedPriority: null, parsedSize: null });
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageInboxItem(
      { inboxItemId: "ix-1", decision: "task-today", lensId: "l" },
      m.context,
    );

    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priority: "NORMAL", size: "M" }),
      select: { id: true },
    });
  });
});

describe("triageInboxItem — project / resource / trash", () => {
  it("project creates a Project named after the item text", async () => {
    const m = arrange();
    m.entities.Project.create.mockResolvedValue({ id: "proj-1" });

    const result = await triageInboxItem(
      { inboxItemId: "ix-1", decision: "project", lensId: "lens-1" },
      m.context,
    );

    expect(result).toEqual({ kind: "project", id: "proj-1" });
    expect(m.entities.Project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Email Sarah", lensId: "lens-1" }),
      select: { id: true },
    });
    expect(m.entities.InboxItem.delete).toHaveBeenCalled();
  });

  it("resource requires a parent project or goal", async () => {
    const m = arrange();
    await expect(
      triageInboxItem({ inboxItemId: "ix-1", decision: "resource", lensId: "l" }, m.context),
    ).rejects.toThrow(/project or goal/i);
  });

  it("trash deletes the item and creates nothing", async () => {
    const m = arrange();
    const result = await triageInboxItem(
      { inboxItemId: "ix-1", decision: "trash", lensId: "l" },
      m.context,
    );

    expect(result).toEqual({ kind: "trash", id: "ix-1" });
    expect(m.entities.Task.create).not.toHaveBeenCalled();
    expect(m.entities.Project.create).not.toHaveBeenCalled();
    expect(m.entities.InboxItem.delete).toHaveBeenCalledWith({ where: { id: "ix-1" } });
  });
});
