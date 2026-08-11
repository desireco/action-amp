// @vitest-environment node
// Server-op tests run in node: ops import entitlement guards that pull
// `wasp/server` (HttpError), blocked by detectServerImports in jsdom. No DOM
// APIs here — node is correct.
import { describe, it, expect, vi } from "vitest";

// Stub the server-only HttpError layer so this test never loads `wasp/server`.
vi.mock("../billing/entitlementHttp", () => ({
  assertLensAllowed: vi.fn().mockResolvedValue(undefined),
  assertLifeAreaLens: vi.fn().mockResolvedValue(undefined),
  assertUnderCap: vi.fn().mockResolvedValue(undefined),
}));
import { triageInboxItem } from "./operations";
import { mockContext } from "../test/mockContext";

/**
 * Triage — the inbox transformation. Canonical Tier C test: the op mutates
 * 4 possible entities across a 7-way decision, then deletes the seed item.
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
  content: null as string | null,
  sourceUrl: null as string | null,
  attachments: [] as { id: string }[],
};

/** Arrange the common precondition: the inbox item exists and is ours. */
function arrange(overrides: Partial<typeof BASE_ITEM> = {}) {
  const m = mockContext();
  m.entities.Lens.findFirst.mockResolvedValue({ type: "LIFE_AREA" });
  m.entities.InboxItem.findUnique.mockResolvedValue({
    ...BASE_ITEM,
    ...overrides,
  });
  return m;
}

describe("triageInboxItem — Simple-list decisions", () => {
  it("creates a flat ListItem, preserves captured context, then deletes the InboxItem", async () => {
    const m = arrange({
      text: "Read later",
      content: "Useful checklist patterns",
      sourceUrl: "https://example.com/list",
    });
    m.entities.Lens.findFirst.mockResolvedValue({ id: "shopping", type: "SIMPLE_LIST" });
    m.entities.ListItem.findFirst.mockResolvedValue({ order: 2 });
    m.entities.ListItem.create.mockResolvedValue({ id: "li-1" });

    const result = await triageInboxItem(
      { inboxItemId: "ix-1", decision: "list-item", lensId: "shopping" },
      m.context,
    );

    expect(result).toEqual({ kind: "list-item", id: "li-1" });
    expect(m.entities.ListItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        lensId: "shopping",
        text: "Read later",
        content: "Useful checklist patterns",
        sourceUrl: "https://example.com/list",
      }),
    });
    expect(m.entities.Task.create).not.toHaveBeenCalled();
    expect(m.entities.Project.findFirst).not.toHaveBeenCalled();
    expect(m.entities.Tag.upsert).not.toHaveBeenCalled();
    expect(m.entities.InboxItem.delete).toHaveBeenCalledWith({ where: { id: "ix-1" } });
    expect(m.entities.User.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", onboardingStage: "TRIAGE" },
      data: { onboardingStage: "COMPLETE" },
    });
  });

  it("keeps an attachment-backed InboxItem untouched", async () => {
    const m = arrange({ attachments: [{ id: "image-1" }] });
    m.entities.Lens.findFirst.mockResolvedValue({ id: "shopping", type: "SIMPLE_LIST" });

    await expect(
      triageInboxItem(
        { inboxItemId: "ix-1", decision: "list-item", lensId: "shopping" },
        m.context,
      ),
    ).rejects.toThrow(/image attachments cannot be filed/i);

    expect(m.entities.ListItem.create).not.toHaveBeenCalled();
    expect(m.entities.InboxItem.delete).not.toHaveBeenCalled();
  });

  it("rejects decision and Lens-type mismatches before creating output", async () => {
    const simple = arrange();
    simple.entities.Lens.findFirst.mockResolvedValue({ type: "SIMPLE_LIST" });
    await expect(
      triageInboxItem(
        { inboxItemId: "ix-1", decision: "upcoming", lensId: "shopping" },
        simple.context,
      ),
    ).rejects.toThrow(/require a Life-area Lens/i);
    expect(simple.entities.Task.create).not.toHaveBeenCalled();

    const life = arrange();
    await expect(
      triageInboxItem(
        { inboxItemId: "ix-1", decision: "list-item", lensId: "work" },
        life.context,
      ),
    ).rejects.toThrow(/require a Simple-list Lens/i);
    expect(life.entities.ListItem.create).not.toHaveBeenCalled();
  });
});

describe("triageInboxItem — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      triageInboxItem(
        { inboxItemId: "ix-1", decision: "archive", lensId: "l" },
        m.context,
      ),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects an item that belongs to another user", async () => {
    const m = mockContext();
    m.entities.InboxItem.findUnique.mockResolvedValue({
      ...BASE_ITEM,
      userId: "someone-else",
    });
    await expect(
      triageInboxItem(
        { inboxItemId: "ix-1", decision: "archive", lensId: "l" },
        m.context,
      ),
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
      expect(m.entities.InboxItem.delete).toHaveBeenCalledWith({
        where: { id: "ix-1" },
      });
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

    await triageOne(
      {
        inboxItemId: "ix-1",
        decision: "task-today",
        lensId: "l",
      },
      m,
    );

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

    await triageOne(
      {
        inboxItemId: "ix-1",
        decision: "task-today",
        lensId: "l",
      },
      m,
    );

    expect(m.entities.Tag.upsert).not.toHaveBeenCalled();
    const call = (m.entities.Task.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.data.tags).toBeUndefined();
  });

  it("files under the lens General project when no project is chosen", async () => {
    const m = arrange();
    m.entities.Project.findFirst.mockResolvedValue({
      id: "general-1",
      permalink: "general",
    });
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne(
      {
        inboxItemId: "ix-1",
        decision: "task-today",
        lensId: "l",
      },
      m,
    );

    expect(m.entities.Project.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "l", name: "General" },
      select: { id: true, permalink: true },
    });
    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "general-1",
        permalink: "general-email-sarah",
      }),
      select: { id: true },
    });
  });

  it("uses the explicit projectId when provided (no General lookup needed)", async () => {
    const m = arrange();
    m.entities.Project.findFirst.mockResolvedValue({
      id: "explicit-1",
      permalink: "mvp",
    });
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne(
      {
        inboxItemId: "ix-1",
        decision: "task-today",
        lensId: "l",
        projectId: "explicit-1",
      },
      m,
    );

    expect(m.entities.Project.findFirst).toHaveBeenCalledWith({
      where: { id: "explicit-1", userId: "user-1", lensId: "l" },
      select: { id: true, permalink: true },
    });
    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "explicit-1",
        permalink: "mvp-email-sarah",
      }),
      select: { id: true },
    });
  });

  it("does not align triaged tasks directly to goals", async () => {
    const m = arrange();
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne(
      {
        inboxItemId: "ix-1",
        decision: "task-today",
        lensId: "l",
        goalId: "goal-should-not-attach",
      },
      m,
    );

    const call = (m.entities.Task.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.data.goalId).toBeUndefined();
  });

  it("saves task notes as Task.content, trimmed", async () => {
    const m = arrange();
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne(
      {
        inboxItemId: "ix-1",
        decision: "task-today",
        lensId: "l",
        content: "  Bring the contract notes  ",
      },
      m,
    );

    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: "Bring the contract notes" }),
      select: { id: true },
    });
  });

  it("uses the edited title for the task description and permalink", async () => {
    const m = arrange();
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne(
      {
        inboxItemId: "ix-1",
        decision: "task-today",
        lensId: "l",
        name: "  Email Sarah about Q3  ",
      },
      m,
    );

    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Email Sarah about Q3",
        permalink: "email-sarah-about-q3",
      }),
      select: { id: true },
    });
  });

  it("stores blank task notes as null", async () => {
    const m = arrange();
    m.entities.Task.create.mockResolvedValue({ id: "t" });

    await triageOne(
      {
        inboxItemId: "ix-1",
        decision: "task-today",
        lensId: "l",
        content: "   \n  ",
      },
      m,
    );

    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: null }),
      select: { id: true },
    });
  });
});

/** Thin wrapper so the new tests read clearly and stay DRY. */
async function triageOne(
  args: Parameters<typeof triageInboxItem>[0],
  m: ReturnType<typeof mockContext>,
) {
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

  it("resource requires a project", async () => {
    const m = arrange();
    await expect(
      triageInboxItem(
        { inboxItemId: "ix-1", decision: "resource", lensId: "l" },
        m.context,
      ),
    ).rejects.toThrow(/filed under a project/i);
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

  it("delete hard-removes the InboxItem and creates nothing", async () => {
    const m = arrange();
    const result = await triageInboxItem(
      { inboxItemId: "ix-1", decision: "delete", lensId: "l" },
      m.context,
    );

    expect(result).toEqual({ kind: "delete", id: "ix-1" });
    expect(m.entities.Task.create).not.toHaveBeenCalled();
    expect(m.entities.Project.create).not.toHaveBeenCalled();
    expect(m.entities.Resource.create).not.toHaveBeenCalled();
    // Delete is destructive: it removes the row outright, not a status flip.
    expect(m.entities.InboxItem.delete).toHaveBeenCalledWith({
      where: { id: "ix-1" },
    });
    // And it does NOT also call update (no ARCHIVED status, no archivedAt).
    expect(m.entities.InboxItem.update).not.toHaveBeenCalled();
    // The trailing seed-delete guard runs once — but it skips delete (and
    // archive), so InboxItem.delete is called exactly once (from the case),
    // not twice. The `withCalledTimes` assertion guards against a regression
    // where someone removes delete from the guard.
    expect(m.entities.InboxItem.delete).toHaveBeenCalledTimes(1);
  });
});
