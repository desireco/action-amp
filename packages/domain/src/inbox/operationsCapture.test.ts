// Ported from webapp/src/inbox/operations.capture.test.ts (S2) — the core
// assertions unchanged; the Wasp-wrapper concerns (auth checks, the onboarding
// CAPTURE→TRIAGE advance, analytics) moved to the API layer with their tests.
import { describe, it, expect } from "vitest";

import { mockContext } from "../test/mockContext.js";
import {
  createInboxItemCore,
  getInboxItemsCore,
} from "./operationsCore.js";

/**
 * Capture + read — the lighter half of inbox operations (triage is covered in
 * operationsCore.test.ts). createInboxItemCore delegates parsing to parseCapture
 * (its own tests live in ../shared/capture/parse.test.ts); here we only assert
 * that the core threads the parsed result into InboxItem.create and enforces
 * the text guard.
 */

// SAFETY: mocks replace the delegates entirely; cast to each core's slice.
type CaptureCore = Parameters<typeof createInboxItemCore>[0];
type ListCore = Parameters<typeof getInboxItemsCore>[0];

describe("createInboxItemCore — text guard", () => {
  it("rejects empty text", async () => {
    const m = mockContext();
    await expect(
      createInboxItemCore(m.entities as unknown as CaptureCore, { userId: "user-1", text: "" }),
    ).rejects.toThrow(/Capture text is required/);
  });

  it("rejects whitespace-only text", async () => {
    const m = mockContext();
    await expect(
      createInboxItemCore(m.entities as unknown as CaptureCore, { userId: "user-1", text: "   " }),
    ).rejects.toThrow(/Capture text is required/);
  });
});

describe("createInboxItemCore — happy path", () => {
  it("creates an InboxItem with cleaned text + parsed-* fields + userId", async () => {
    const m = mockContext();
    const created = { id: "ix-1", text: "Email Sarah", createdAt: new Date("2026-06-24") };
    m.entities.InboxItem.create.mockResolvedValue(created);
    // createInboxItemCore queries the user's CUSTOM lenses to recognize [[ ]] tokens.
    m.entities.Lens.findMany.mockResolvedValue([]);

    const result = await createInboxItemCore(m.entities as unknown as CaptureCore, {
      userId: "user-1",
      text: "Email Sarah !important #work",
    });

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

  it("recognizes a custom [[lens]] token via the user's lens names", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-2", text: "ship", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([{ name: "Studio" }]);

    await createInboxItemCore(m.entities as unknown as CaptureCore, {
      userId: "user-1",
      text: "ship [[studio]]",
    });

    const call = m.entities.InboxItem.create.mock.calls[0][0];
    expect(call.data.parsedLens).toBe("studio");
    expect(call.data.text).toBe("ship");
    expect(m.entities.Lens.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { name: true },
    });
  });

  it("persists an explicit projectName override from the typeahead", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-3", text: "x", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([]);

    await createInboxItemCore(m.entities as unknown as CaptureCore, {
      userId: "user-1",
      text: "do the thing",
      projectName: "MVP",
    });

    const call = m.entities.InboxItem.create.mock.calls[0][0];
    expect(call.data.parsedProject).toBe("mvp");
  });

  it("persists an explicit pre-triage destination by ID", async () => {
    const m = mockContext();
    m.entities.InboxItem.create.mockResolvedValue({ id: "ix-destination", text: "Read", createdAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.Project.findFirst.mockResolvedValue({ id: "project-1", lensId: "lens-work" });
    m.entities.Lens.findFirst.mockResolvedValue({ id: "lens-work" });

    await createInboxItemCore(m.entities as unknown as CaptureCore, {
      userId: "user-1",
      text: "Read this",
      projectId: "project-1",
    });

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

    await createInboxItemCore(m.entities as unknown as CaptureCore, {
      userId: "user-1",
      text: "Article — https://example.com",
      title: "Article",
      content: "Read later",
      sourceUrl: "https://example.com",
    });

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

    await createInboxItemCore(m.entities as unknown as CaptureCore, {
      userId: "user-1",
      text: "Shared image",
      attachments: [{ filename: "photo.jpg", mimeType: "image/jpeg", dataBase64: "aGVsbG8=" }],
    });

    expect(
      (m.entities.InboxItem.create.mock.calls[0][0].data.attachments?.create ?? [])[0],
    ).toMatchObject({
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 5,
    });
  });
});

describe("getInboxItemsCore — scoping", () => {
  it("queries only the user's UNPROCESSED items, newest first", async () => {
    const m = mockContext();
    const items = [
      { id: "ix-2", text: "Second", createdAt: new Date("2026-06-24T12:00") },
      { id: "ix-1", text: "First", createdAt: new Date("2026-06-24T10:00") },
    ];
    m.entities.InboxItem.findMany.mockResolvedValue(items);

    const result = await getInboxItemsCore(m.entities as unknown as ListCore, {
      userId: "user-1",
    });

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
