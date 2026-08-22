// @vitest-environment node
// Server project (see vitest.config.ts): the wasp/server import chain loads
// for real — no module mocking. createInboxItem/getInboxItems call no
// entitlement guards (filing guards gate triage, covered in
// operations.test.ts), so plain fixtures suffice.
import { describe, it, expect } from "vitest";

import { mockContext } from "../test/mockContext";
import { createInboxItem, getInboxItem, getInboxItems, getProjectsForResolver } from "./operations";

/**
 * Capture + read — the lighter half of inbox operations (triage is covered in
 * operations.test.ts). createInboxItem delegates parsing to parseCapture (its
 * own tests live in parseCapture.test.ts); here we only assert that the op
 * threads the parsed result into InboxItem.create and enforces the auth/text
 * guards.
 */

describe("createInboxItem — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(createInboxItem({ text: "Email Sarah" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("rejects empty text", async () => {
    const m = mockContext();
    await expect(createInboxItem({ text: "" }, m.context)).rejects.toThrow(
      /Capture text is required/,
    );
  });

  it("rejects whitespace-only text", async () => {
    const m = mockContext();
    await expect(createInboxItem({ text: "   " }, m.context)).rejects.toThrow(
      /Capture text is required/,
    );
  });
});

describe("createInboxItem — happy path", () => {
  it("creates an InboxItem with cleaned text + parsed-* fields + userId", async () => {
    const m = mockContext();
    const created = { id: "ix-1", text: "Email Sarah", createdAt: new Date("2026-06-24") };
    m.entities.InboxItem.create.mockResolvedValue(created);
    // createInboxItem queries the user's CUSTOM lenses to recognize [[ ]] tokens.
    m.entities.Lens.findMany.mockResolvedValue([]);

    const result = await createInboxItem({ text: "Email Sarah !important #work" }, m.context);

    expect(result).toEqual(created);
    const call = m.entities.InboxItem.create.mock.calls[0][0];
    // parseCapture strips tokens — cleanText should not contain !important or #work
    expect(call.data.text).toBe("Email Sarah");
    expect(call.data.userId).toBe("user-1");
    // #work is the project hint (first #token wins).
    expect(call.data.parsedPriority).toBe("IMPORTANT");
    expect(call.data.parsedProject).toBe("work");
    expect(call.data.parsedTags).toEqual([]);
    expect(call.data.parsedLens).toBeNull();
    expect(call.select).toEqual({ id: true, text: true, createdAt: true });
    expect(m.entities.User.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", onboardingStage: "CAPTURE" },
      data: { onboardingStage: "TRIAGE" },
    });
  });

  it("recognizes a custom [[lens]] token via the user's lens names", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-2", text: "ship", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([{ name: "Studio" }]);

    await createInboxItem({ text: "ship [[studio]]" }, m.context);

    const call = m.entities.InboxItem.create.mock.calls[0][0];
    expect(call.data.parsedLens).toBe("studio");
    expect(call.data.text).toBe("ship");
    expect(m.entities.Lens.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { name: true },
    });
  });

  it("recognizes a Simple-list [[lens]] token for later triage", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-list", text: "milk", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([{ name: "Shopping", type: "SIMPLE_LIST" }]);

    await createInboxItem({ text: "milk [[shopping]]" }, m.context);

    expect(m.entities.InboxItem.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ text: "milk", parsedLens: "shopping" }),
    );
  });

  it("persists an explicit projectName override from the typeahead", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-3", text: "x", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([]);

    await createInboxItem({ text: "do the thing", projectName: "MVP" }, m.context);

    const call = m.entities.InboxItem.create.mock.calls[0][0];
    expect(call.data.parsedProject).toBe("mvp");
  });

  it("persists an explicit pre-triage destination by ID", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-destination", text: "Read", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.Project.findFirst.mockResolvedValue({ id: "project-1", lensId: "lens-work" });
    m.entities.Lens.findFirst.mockResolvedValue({ id: "lens-work" });

    await createInboxItem({ text: "Read this", projectId: "project-1" }, m.context);

    expect(m.entities.InboxItem.create.mock.calls[0][0].data).toMatchObject({
      parsedProjectId: "project-1",
      parsedLensId: "lens-work",
    });
    expect(m.entities.Project.findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", userId: "user-1" },
      select: { id: true, lensId: true },
    });
  });

  it("stores structured share fields alongside the capture text", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-4", text: "Article", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([]);

    await createInboxItem({
      text: "Article — https://example.com",
      title: "Article",
      content: "Read later",
      sourceUrl: "https://example.com",
    }, m.context);

    expect(m.entities.InboxItem.create.mock.calls[0][0].data).toMatchObject({
      title: "Article",
      content: "Read later",
      sourceUrl: "https://example.com",
    });
  });

  it("stores one shared image as an Inbox attachment", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-image", text: "Shared image", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([]);

    await createInboxItem({
      text: "Shared image",
      attachments: [{ filename: "photo.jpg", mimeType: "image/jpeg", dataBase64: "aGVsbG8=" }],
    }, m.context);

    expect(m.entities.InboxItem.create.mock.calls[0][0].data.attachments.create[0]).toMatchObject({
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 5,
    });
  });
});

describe("getInboxItems — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    // SAFETY: op takes no positional input; Wasp passes empty object at call site.
    await expect(getInboxItems({} as never, m.context)).rejects.toThrow(/Not authenticated/);
  });
});

describe("getInboxItems — scoping", () => {
  it("queries only the user's UNPROCESSED items, newest first", async () => {
    const m = mockContext();
    const items = [
      { id: "ix-2", text: "Second", createdAt: new Date("2026-06-24T12:00") },
      { id: "ix-1", text: "First", createdAt: new Date("2026-06-24T10:00") },
    ];
    m.entities.InboxItem.findMany.mockResolvedValue(items);

    // SAFETY: op takes no positional input; Wasp passes empty object at call site.
    const result = await getInboxItems({} as never, m.context);

    expect(result).toEqual(items);
    expect(m.entities.InboxItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "UNPROCESSED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        text: true,
        title: true,
        content: true,
        sourceUrl: true,
        attachments: { select: { id: true, filename: true, mimeType: true } },
        createdAt: true,
        parsedScheduledDate: true,
        parsedSnoozedUntil: true,
        parsedPriority: true,
        parsedSize: true,
        parsedTags: true,
        parsedProject: true,
        parsedLens: true,
        parsedProjectId: true,
        parsedLensId: true,
      },
    });
  });
});

describe("getInboxItem — guards + ownership", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      getInboxItem({ id: "ix-1" }, m.context),
    ).rejects.toThrow("Not authenticated.");
  });

  it("returns the full row for the requesting user's own item", async () => {
    const m = mockContext("user-1");
    const item = {
      id: "ix-1", userId: "user-1", text: "Cool — https://x.com",
      createdAt: new Date("2026-07-25T10:00"), status: "UNPROCESSED",
      archivedAt: null, parsedScheduledDate: null, parsedPriority: null,
      parsedSize: null, parsedTags: [], parsedProject: null, parsedLens: null,
    };
    m.entities.InboxItem.findUnique.mockResolvedValue(item);

    const result = await getInboxItem({ id: "ix-1" }, m.context);

    expect(result).toEqual(item);
    expect(m.entities.InboxItem.findUnique).toHaveBeenCalledWith({
      where: { id: "ix-1" },
    });
  });

  it("returns null when the item belongs to another user", async () => {
    const m = mockContext("user-1");
    // A different user's item leaks out of findUnique (shouldn't, but defense).
    m.entities.InboxItem.findUnique.mockResolvedValue({
      id: "ix-1",
      userId: "user-2",
      text: "theirs",
    });
    const result = await getInboxItem({ id: "ix-1" }, m.context);
    expect(result).toBeNull();
  });

  it("returns null when the item does not exist", async () => {
    const m = mockContext("user-1");
    m.entities.InboxItem.findUnique.mockResolvedValue(null);
    const result = await getInboxItem({ id: "nope" }, m.context);
    expect(result).toBeNull();
  });
});

describe("getProjectsForResolver — lens-agnostic source for capture + triage", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    // SAFETY: op takes no positional input; Wasp passes empty object at call site.
    await expect(getProjectsForResolver({} as never, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("returns all projects across all lenses with lensName attached", async () => {
    // No entitlement filter — all the user's projects surface regardless of
    // plan. Visibility ≠ write access (triageInboxItem's assertLensAllowed
    // still gates filing at commit time).
    const m = mockContext();
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-me", name: "Me", color: "emerald", isIncluded: true },
      { id: "lens-work", name: "Work", color: "indigo", isIncluded: false },
    ]);
    m.entities.Project.findMany.mockResolvedValue([
      { id: "p-1", name: "MVP", permalink: "mvp", type: "STANDARD", lensId: "lens-work" },
      { id: "p-2", name: "Groceries", permalink: "groceries", type: "SIMPLE_LIST", lensId: "lens-me" },
    ]);

    // SAFETY: op takes no positional input; Wasp passes empty object at call site.
    const result = await getProjectsForResolver({} as never, m.context);

    expect(result).toEqual([
      { id: "p-1", name: "MVP", permalink: "mvp", type: "STANDARD", lensId: "lens-work", lensName: "Work", lensColor: "indigo" },
      { id: "p-2", name: "Groceries", permalink: "groceries", type: "SIMPLE_LIST", lensId: "lens-me", lensName: "Me", lensColor: "emerald" },
    ]);
    // Resolver stays cross-entitlement — every lens's projects surface with
    // their type, so consumers filter STANDARD (mentions) vs SIMPLE_LIST
    // (triage list picker, share optgroup).
    expect(m.entities.Project.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        isDone: false,
        archivedAt: null,
      },
      select: { id: true, name: true, permalink: true, type: true, lensId: true },
      orderBy: [{ name: "asc" }],
    });
  });

  it("FREE user: WORK/CUSTOM lens projects surface (filter removed)", async () => {
    const m = mockContext(); // no plan → FREE
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-me", name: "Me", color: "emerald" },
      { id: "lens-work", name: "Work", color: "indigo" },
      { id: "lens-studio", name: "Studio", color: "coral" },
    ]);
    m.entities.Project.findMany.mockResolvedValue([
      { id: "p-1", name: "MVP", permalink: "mvp", type: "STANDARD", lensId: "lens-work" },
      { id: "p-2", name: "Studio work", permalink: "studio-work", type: "SIMPLE_LIST", lensId: "lens-studio" },
    ]);

    // SAFETY: op takes no positional input; Wasp passes empty object at call site.
    const result = await getProjectsForResolver({} as never, m.context);

    // Every lens's projects remain visible regardless of entitlement.
    expect(m.entities.Project.findMany.mock.calls[0][0].where).not.toHaveProperty("lensId");
    expect(result).toHaveLength(2);
    expect(result.map((r: { name: string }) => r.name)).toEqual(["MVP", "Studio work"]);
  });
});
