// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createResourceCore } from "./operationsCore";

function delegate() {
  return {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function entities() {
  return { Project: delegate(), Resource: delegate() };
}

const standardProject = { id: "project-1", lensId: "lens-1" };

describe("createResourceCore", () => {
  it("requires an owned project and trims the title", async () => {
    const db = entities();
    db.Project.findFirst.mockResolvedValue(standardProject);
    db.Resource.create.mockResolvedValue({ id: "resource-1" });

    await createResourceCore(db, {
      userId: "user-1",
      projectId: "project-1",
      title: "  Design tokens reference  ",
    });

    expect(db.Project.findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", userId: "user-1" },
      select: { id: true, lensId: true },
    });
    expect(db.Resource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Design tokens reference",
          userId: "user-1",
          projectId: "project-1",
        }),
      }),
    );
  });

  it("rejects an empty title and an unknown project", async () => {
    const db = entities();
    db.Project.findFirst.mockResolvedValue(standardProject);
    await expect(
      createResourceCore(db, { userId: "user-1", projectId: "project-1", title: "   " }),
    ).rejects.toThrow(/cannot be empty/i);

    db.Project.findFirst.mockResolvedValue(null);
    await expect(
      createResourceCore(db, { userId: "user-1", projectId: "gone", title: "x" }),
    ).rejects.toThrow(/project not found/i);
  });

  it("stores image attachments on the created resource", async () => {
    const db = entities();
    db.Project.findFirst.mockResolvedValue(standardProject);
    db.Resource.create.mockResolvedValue({ id: "resource-1" });

    await createResourceCore(db, {
      userId: "user-1",
      projectId: "project-1",
      title: "Reference screenshots",
      attachments: [
        { filename: "first.jpg", mimeType: "image/jpeg", dataBase64: Buffer.from("first").toString("base64") },
        { filename: "second.png", mimeType: "image/png", dataBase64: Buffer.from("second").toString("base64") },
      ],
    });

    expect(db.Resource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: {
            create: [
              expect.objectContaining({ filename: "first.jpg", mimeType: "image/jpeg" }),
              expect.objectContaining({ filename: "second.png", mimeType: "image/png" }),
            ],
          },
        }),
      }),
    );
  });

  it("rejects non-image attachments and oversized images", async () => {
    const db = entities();
    db.Project.findFirst.mockResolvedValue(standardProject);
    await expect(
      createResourceCore(db, {
        userId: "user-1",
        projectId: "project-1",
        title: "x",
        attachments: [{ filename: "doc.pdf", mimeType: "application/pdf", dataBase64: "eA==" }],
      }),
    ).rejects.toThrow(/only images/i);
    // 8 MB of base64 chars decodes to ~6 MB of bytes — over the 5 MB cap.
    await expect(
      createResourceCore(db, {
        userId: "user-1",
        projectId: "project-1",
        title: "x",
        attachments: [{ filename: "big.jpg", mimeType: "image/jpeg", dataBase64: "A".repeat(8 * 1024 * 1024) }],
      }),
    ).rejects.toThrow(/5 MB/i);
  });

  it("normalizes http(s) urls and rejects other schemes", async () => {
    const db = entities();
    db.Project.findFirst.mockResolvedValue(standardProject);
    db.Resource.create.mockResolvedValue({ id: "resource-1" });

    await createResourceCore(db, {
      userId: "user-1",
      projectId: "project-1",
      title: "Spec",
      url: "https://example.com/spec",
    });
    expect(db.Resource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ url: "https://example.com/spec" }),
      }),
    );

    await expect(
      createResourceCore(db, {
        userId: "user-1",
        projectId: "project-1",
        title: "Weird",
        url: "content://media/external/file/1",
      }),
    ).rejects.toThrow(/full http/i);
  });
});
