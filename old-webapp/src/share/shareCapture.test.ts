// @vitest-environment node
// Server project (see vititest.config.ts in webapp root): the REAL
// getSessionAuth runs (it just reads req.sessionAuth — the old mock
// reimplemented it verbatim), and the capture core is swapped through the
// injectable shareDeps seam exported from ./shareCapture — no module mocking.
import { describe, it, expect, vi, beforeEach } from "vitest";

import { shareCapture, shareDeps } from "./shareCapture";
import type { Request, Response } from "express";

const createInboxItem = vi.fn();
const realCreateInboxItem = shareDeps.createInboxItem;

beforeEach(() => {
  // SAFETY: vi.fn() satisfies the capture-core signature at runtime.
  shareDeps.createInboxItem = createInboxItem as typeof realCreateInboxItem;
});

function makeReq(body: unknown, sessionAuth?: { userId: string }): Request {
  // SAFETY: Express Request is wide; fixture provides only the fields the handler accesses.
  // Chained assertion is necessary because the literal doesn't structurally overlap Request.
  return Object.assign({} as Request, { body, sessionAuth });
}

function makeRes(): Response {
  // SAFETY: Express Response is wide; fixture provides only the fields the handler accesses.
  // Chained assertion is necessary because the literal doesn't structurally overlap Response.
  return Object.assign({} as Response, {
    redirect: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shareCapture", () => {
  it("redirects to /login when no session authenticated", async () => {
    const req = makeReq({ title: "X", url: "https://x.com" });
    const res = makeRes();
    await shareCapture(req, res, { entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/login");
    expect(createInboxItem).not.toHaveBeenCalled();
  });

  it("redirects to /share?error=empty when all fields blank", async () => {
    const req = makeReq({ title: "   " }, { userId: "u1" });
    const res = makeRes();
    await shareCapture(req, res, { entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?error=empty");
    expect(createInboxItem).not.toHaveBeenCalled();
  });

  it("saves composed text and redirects to /share?id= on success", async () => {
    const req = makeReq(
      { title: "Cool", url: "https://x.com" },
      { userId: "u1" },
    );
    const res = makeRes();
    createInboxItem.mockResolvedValue({
      id: "item-1",
      text: "Cool — https://x.com",
      createdAt: new Date(),
    });
    await shareCapture(req, res, { entities: { E: 1 } });
    expect(createInboxItem).toHaveBeenCalledWith(
      { E: 1 },
      {
        userId: "u1",
        text: "Cool — https://x.com",
      },
    );
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?id=item-1");
  });

  it("redirects to /share?error=server when core throws", async () => {
    const req = makeReq({ url: "https://x.com" }, { userId: "u1" });
    const res = makeRes();
    createInboxItem.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await shareCapture(req, res, { entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?error=server");
    errSpy.mockRestore();
  });

  it("encodes the item id in the redirect URL", async () => {
    const trickyId = "with space&special";
    const req = makeReq({ url: "https://x.com" }, { userId: "u1" });
    const res = makeRes();
    createInboxItem.mockResolvedValue({
      id: trickyId,
      text: "https://x.com",
      createdAt: new Date(),
    });
    await shareCapture(req, res, { entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(
      303,
      `/share?id=${encodeURIComponent(trickyId)}`,
    );
  });

  it("returns redirect data for the service-worker bridge", async () => {
    // SAFETY: Record<string, unknown> cast for partial request body; makeReq adds typed fields.
    const req = makeReq({ url: "https://x.com" } as Record<string, unknown>, {
      userId: "u1",
    });
    Object.assign(req, { query: { response: "json" } });
    const res = makeRes();
    createInboxItem.mockResolvedValue({ id: "item-1" });

    await shareCapture(req, res, { entities: {} });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ redirect: "/share?id=item-1" });
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
