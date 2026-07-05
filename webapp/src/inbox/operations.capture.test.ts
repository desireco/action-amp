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
import { mockContext } from "../test/mockContext";
import { createInboxItem, getInboxItems, getProjectsForResolver } from "./operations";

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
  });

  it("recognizes a custom [[lens]] token via the user's CUSTOM lenses", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-2", text: "ship", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([{ name: "Studio" }]);

    await createInboxItem({ text: "ship [[studio]]" }, m.context);

    const call = m.entities.InboxItem.create.mock.calls[0][0];
    expect(call.data.parsedLens).toBe("studio");
    expect(call.data.text).toBe("ship");
  });

  it("persists an explicit projectName override from the typeahead", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-3", text: "x", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([]);

    await createInboxItem({ text: "do the thing", projectName: "MVP" }, m.context);

    const call = m.entities.InboxItem.create.mock.calls[0][0];
    expect(call.data.parsedProject).toBe("mvp");
  });
});

describe("getInboxItems — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
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

    const result = await getInboxItems({} as never, m.context);

    expect(result).toEqual(items);
    expect(m.entities.InboxItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "UNPROCESSED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        text: true,
        createdAt: true,
        parsedDate: true,
        parsedPriority: true,
        parsedSize: true,
        parsedTags: true,
        parsedProject: true,
        parsedLens: true,
      },
    });
  });
});

describe("getProjectsForResolver — lens-agnostic source for capture + triage", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
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
      { id: "lens-me", name: "Me", kind: "PERSONAL" },
      { id: "lens-work", name: "Work", kind: "WORK" },
    ]);
    m.entities.Project.findMany.mockResolvedValue([
      { id: "p-1", name: "MVP", lensId: "lens-work" },
      { id: "p-2", name: "Groceries", lensId: "lens-me" },
    ]);

    const result = await getProjectsForResolver({} as never, m.context);

    expect(result).toEqual([
      { id: "p-1", name: "MVP", lensId: "lens-work", lensName: "Work" },
      { id: "p-2", name: "Groceries", lensId: "lens-me", lensName: "Me" },
    ]);
    // No lensId filter — all projects, all lenses.
    expect(m.entities.Project.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        isDone: false,
      },
      select: { id: true, name: true, lensId: true },
      orderBy: [{ name: "asc" }],
    });
  });

  it("FREE user: WORK/CUSTOM lens projects surface (filter removed)", async () => {
    const m = mockContext(); // no plan → FREE
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-me", name: "Me" },
      { id: "lens-work", name: "Work" },
      { id: "lens-studio", name: "Studio" },
    ]);
    m.entities.Project.findMany.mockResolvedValue([
      { id: "p-1", name: "MVP", lensId: "lens-work" },
      { id: "p-2", name: "Studio work", lensId: "lens-studio" },
    ]);

    const result = await getProjectsForResolver({} as never, m.context);

    // All lenses visible — no lensId { in: [...] } filter at all.
    expect(m.entities.Project.findMany.mock.calls[0][0].where).not.toHaveProperty("lensId");
    expect(result).toHaveLength(2);
  });
});
