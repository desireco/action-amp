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
import { createInboxItem, getInboxItems } from "./operations";

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

    const result = await createInboxItem({ text: "Email Sarah !important #work" }, m.context);

    expect(result).toEqual(created);
    const call = m.entities.InboxItem.create.mock.calls[0][0];
    // parseCapture strips tokens — cleanText should not contain !important or #work
    expect(call.data.text).toBe("Email Sarah");
    expect(call.data.userId).toBe("user-1");
    // Parsed tokens are threaded through. #work is a project hint, not a tag.
    expect(call.data.parsedPriority).toBe("IMPORTANT");
    expect(call.data.parsedProject).toBe("work");
    expect(call.data.parsedTags).toEqual([]);
    expect(call.select).toEqual({ id: true, text: true, createdAt: true });
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
      },
    });
  });
});
