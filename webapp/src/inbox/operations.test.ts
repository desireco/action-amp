// @vitest-environment node
// Server-op tests run in node: ops import entitlement guards that pull
// `wasp/server` (HttpError), blocked by detectServerImports in jsdom. No DOM
// APIs here — node is correct.
import { describe, it, expect, vi } from "vitest";

// Stub the server-only HttpError layer so this test never loads `wasp/server`.
vi.mock("../billing/entitlementHttp", () => ({
  assertLensAllowed: vi.fn().mockResolvedValue(undefined),
  assertUnderCap: vi.fn().mockResolvedValue(undefined),
}));
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
  parsedTags: [] as string[],
  parsedProject: null as string | null,
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
      triageInboxItem({ inboxItemId: "ix-1", decision: "archive", lensId: "l" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects an item that belongs to another user", async () => {
    const m = mockContext();
    m.entities.InboxItem.findUnique.mockResolvedValue({
      ...BASE_ITEM,
      userId: "someone-else",
    });
    await expect(
      triageInboxItem({ inboxItemId: "ix-1", decision: "archive", lensId: "l" }, m.context),
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

  it("carries parsedTags onto the task (resolve-or-create, legacy prefixes stripped)", async () => {
    const m = arrange({ parsedTags: ["#phone", "#mvp"] });
    m.entities.Tag.upsert
      .mockResolvedValueOnce({ id: "tag-phone" })
      .mockResolvedValueOnce({ id: "tag-mvp" });
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne({
      inboxItemId: "ix-1", decision: "task-today", lensId: "l" }, m);

    // Two upserts — one per tag, stripped of # (and legacy @) and lowercased.
    expect(m.entities.Tag.upsert).toHaveBeenCalledTimes(2);
    expect(m.entities.Tag.upsert).toHaveBeenCalledWith({
      where: { userId_name: { userId: "user-1", name: "phone" } },
      create: expect.objectContaining({ name: "phone" }),
      update: {},
      select: { id: true },
    });
    expect(m.entities.Tag.upsert).toHaveBeenCalledWith({
      where: { userId_name: { userId: "user-1", name: "mvp" } },
      create: expect.objectContaining({ name: "mvp" }),
      update: {},
      select: { id: true },
    });
    // Both tags connected to the created task.
    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tags: { connect: [{ id: "tag-phone" }, { id: "tag-mvp" }] },
      }),
      select: { id: true },
    });
  });

  it("does NOT attach tags when the item has none (no tags key, no upserts)", async () => {
    const m = arrange({ parsedTags: [] });
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne({
      inboxItemId: "ix-1", decision: "task-today", lensId: "l" }, m);

    expect(m.entities.Tag.upsert).not.toHaveBeenCalled();
    const call = (m.entities.Task.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.tags).toBeUndefined();
  });

  it("files under the lens General project when no project is chosen", async () => {
    const m = arrange();
    m.entities.Project.findFirst.mockResolvedValue({ id: "general-1" });
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne({
      inboxItemId: "ix-1", decision: "task-today", lensId: "l" }, m);

    expect(m.entities.Project.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "l", name: "General" },
      select: { id: true },
    });
    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: "general-1" }),
      select: { id: true },
    });
  });

  it("uses the explicit projectId when provided (no General lookup needed)", async () => {
    const m = arrange();
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne({
      inboxItemId: "ix-1", decision: "task-today", lensId: "l", projectId: "explicit-1" }, m);

    expect(m.entities.Project.findFirst).not.toHaveBeenCalled();
    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: "explicit-1" }),
      select: { id: true },
    });
  });

  it("does not align triaged tasks directly to goals", async () => {
    const m = arrange();
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne({
      inboxItemId: "ix-1",
      decision: "task-today",
      lensId: "l",
      goalId: "goal-should-not-attach",
    }, m);

    const call = (m.entities.Task.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.goalId).toBeUndefined();
  });

  it("saves task notes as Task.content, trimmed", async () => {
    const m = arrange();
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne({
      inboxItemId: "ix-1",
      decision: "task-today",
      lensId: "l",
      content: "  Bring the contract notes  ",
    }, m);

    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: "Bring the contract notes" }),
      select: { id: true },
    });
  });

  it("stores blank task notes as null", async () => {
    const m = arrange();
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne({
      inboxItemId: "ix-1",
      decision: "task-today",
      lensId: "l",
      content: "   \n  ",
    }, m);

    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: null }),
      select: { id: true },
    });
  });
});

/** Thin wrapper so the new tests read clearly and stay DRY. */
async function triageOne(args: Parameters<typeof triageInboxItem>[0], m: ReturnType<typeof mockContext>) {
  return triageInboxItem(args, m.context);
}

describe("triageInboxItem — project / resource / archive", () => {
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

  it("archive marks the item ARCHIVED (kept) and creates nothing", async () => {
    const m = arrange();
    const result = await triageInboxItem(
      { inboxItemId: "ix-1", decision: "archive", lensId: "l" },
      m.context,
    );

    expect(result).toEqual({ kind: "archive", id: "ix-1" });
    expect(m.entities.Task.create).not.toHaveBeenCalled();
    expect(m.entities.Project.create).not.toHaveBeenCalled();
    // Archive is lossless: it updates the status + stamps archivedAt, and does
    // NOT delete (unlike the create-type decisions).
    expect(m.entities.InboxItem.update).toHaveBeenCalledWith({
      where: { id: "ix-1" },
      data: { status: "ARCHIVED", archivedAt: expect.any(Date) },
    });
    expect(m.entities.InboxItem.delete).not.toHaveBeenCalled();
  });
});
