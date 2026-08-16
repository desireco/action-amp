// @vitest-environment node
// Server-route tests run in node: the handler imports wasp/server types.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { serveAttachment } from "./serveAttachment";

const UUID = "6daf2cad-c07a-4453-882e-ce04f3a60e15";

function makeReq(id: string, userId = "u1"): Request {
  return { params: { id }, sessionAuth: { userId } } as unknown as Request;
}

function makeReqUnauthenticated(id: string): Request {
  return { params: { id } } as unknown as Request;
}

function makeRes(): Response & { headers: Record<string, string>; body: Buffer | null } {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    body: null as Buffer | null,
    // Node's ServerResponse.setHeader validation (node:_http_outgoing) —
    // anything outside tab + printable ASCII + latin1 throws. The mock must
    // match, or header-breaking filenames pass tests but 500 in production
    // (the macOS screenshot bug).
    setHeader: (key: string, value: string) => {
      if (/[^\t\x20-\x7e\x80-\xff]/.test(String(value))) {
        throw new TypeError(`Invalid character in header content ["${key}"]`);
      }
      headers[key.toLowerCase()] = String(value);
    },
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    end: vi.fn((chunk?: Buffer) => { if (chunk) res.body = Buffer.from(chunk); }),
  };
  return res as unknown as Response & { headers: Record<string, string>; body: Buffer | null };
}

function makeEntities(inboxResult: unknown = null, listResult: unknown = null) {
  return {
    InboxAttachment: { findUnique: vi.fn().mockResolvedValue(inboxResult) },
    ListItemAttachment: { findUnique: vi.fn().mockResolvedValue(listResult) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("serveAttachment", () => {
  it("returns 401 without a session", async () => {
    const res = makeRes();
    await serveAttachment(makeReqUnauthenticated(UUID), res, { entities: makeEntities() });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 404 for a non-uuid id before touching the database", async () => {
    const entities = makeEntities();
    const res = makeRes();
    await serveAttachment(makeReq("../../etc/passwd"), res, { entities });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(entities.InboxAttachment.findUnique).not.toHaveBeenCalled();
  });

  it("serves an inbox attachment owned by the user", async () => {
    const data = Buffer.from("png-bytes");
    const entities = makeEntities({
      data, filename: "shot.png", mimeType: "image/png", size: data.length,
      inboxItem: { userId: "u1" },
    });
    const res = makeRes();
    await serveAttachment(makeReq(UUID), res, { entities });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["content-length"]).toBe(String(data.length));
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(res.headers["content-disposition"]).toContain("shot.png");
    expect(res.body?.toString()).toBe("png-bytes");
    // Owner match short-circuits — the list table is never consulted.
    expect(entities.ListItemAttachment.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to list-item attachments", async () => {
    const data = Buffer.from("jpg-bytes");
    const entities = makeEntities(null, {
      data, filename: "pic.jpg", mimeType: "image/jpeg", size: data.length,
      listItem: { userId: "u2" },
    });
    const res = makeRes();
    await serveAttachment(makeReq(UUID, "u2"), res, { entities });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.body?.toString()).toBe("jpg-bytes");
  });

  it("returns 404 — never a foreign user's attachment", async () => {
    const entities = makeEntities({
      data: Buffer.from("x"), filename: "a.png", mimeType: "image/png", size: 1,
      inboxItem: { userId: "someone-else" },
    });
    const res = makeRes();
    await serveAttachment(makeReq(UUID), res, { entities });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 404 when nothing matches", async () => {
    const res = makeRes();
    await serveAttachment(makeReq(UUID), res, { entities: makeEntities() });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 404 for a non-image mimeType, whatever the row says", async () => {
    const entities = makeEntities({
      data: Buffer.from("<script>"), filename: "evil.html", mimeType: "text/html", size: 8,
      inboxItem: { userId: "u1" },
    });
    const res = makeRes();
    await serveAttachment(makeReq(UUID), res, { entities });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 500 when the lookup throws", async () => {
    const entities = {
      InboxAttachment: { findUnique: vi.fn().mockRejectedValue(new Error("db down")) },
      ListItemAttachment: { findUnique: vi.fn() },
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();
    await serveAttachment(makeReq(UUID), res, { entities });
    expect(res.status).toHaveBeenCalledWith(500);
    errSpy.mockRestore();
  });

  it("strips header-breaking characters from the filename", async () => {
    const entities = makeEntities({
      data: Buffer.from("x"), filename: 'bad"name\r\nx: injected', mimeType: "image/png", size: 1,
      inboxItem: { userId: "u1" },
    });
    const res = makeRes();
    await serveAttachment(makeReq(UUID), res, { entities });
    expect(res.headers["content-disposition"]).not.toContain("\r\n");
    expect(res.headers["content-disposition"]).toContain('badname');
  });

  // Regression (2026-08-16): macOS screenshot filenames use narrow no-break
  // spaces (U+202F), which Node's setHeader rejects — every thumbnail 500'd.
  // The ASCII fallback must be header-safe; the true name rides in filename*.
  it("serves macOS screenshot filenames (narrow no-break spaces) without throwing", async () => {
    const filename =
      "Screenshot 2026-08-16\u202fat\u202f12.53.46\u202fPM.png";
    const entities = makeEntities({
      data: Buffer.from("x"), filename, mimeType: "image/png", size: 1,
      inboxItem: { userId: "u1" },
    });
    const res = makeRes();
    await serveAttachment(makeReq(UUID), res, { entities });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.headers["content-disposition"]).toContain(
      "Screenshot 2026-08-16_at_12.53.46_PM.png",
    );
    expect(res.headers["content-disposition"]).toContain(
      `filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
  });
});
