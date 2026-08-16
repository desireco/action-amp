// @vitest-environment node
// Server-op tests run in node: imports pull wasp/server types; jsdom is wrong.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock createInboxItemCore so no DB is touched. The handler's own logic +
// composeShareText (real) is what we exercise. getSessionAuth is mocked for
// the same reason — the real module pulls `wasp/server` (prisma), which the
// client-side import detector blocks in tests.
vi.mock("../inbox/operationsCore", () => ({
  createInboxItemCore: vi.fn(),
}));
vi.mock("../auth/sessionAuth", () => ({
  getSessionAuth: (req: { sessionAuth?: { userId: string } }) => req.sessionAuth,
}));

import { shareCapture } from "./shareCapture";
import { createInboxItemCore } from "../inbox/operationsCore";
import type { Request, Response } from "express";

function makeReq(body: unknown, sessionAuth?: { userId: string }): Request {
  // SAFETY: Express Request is wide; fixture provides only the fields the handler accesses.
  // Chained assertion is necessary because the literal doesn't structurally overlap Request.
  return { body, sessionAuth } as unknown as Request;
}

function makeRes(): Response {
  // SAFETY: Express Response is wide; fixture provides only the fields the handler accesses.
  // Chained assertion is necessary because the literal doesn't structurally overlap Response.
  return { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
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
    expect(createInboxItemCore).not.toHaveBeenCalled();
  });

  it("redirects to /share?error=empty when all fields blank", async () => {
    const req = makeReq({ title: "   " }, { userId: "u1" });
    const res = makeRes();
    await shareCapture(req, res, { entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?error=empty");
    expect(createInboxItemCore).not.toHaveBeenCalled();
  });

  it("saves composed text and redirects to /share?id= on success", async () => {
    const req = makeReq({ title: "Cool", url: "https://x.com" }, { userId: "u1" });
    const res = makeRes();
    // SAFETY: mock function needs .mockResolvedValue; casting to any avoids generic mismatch.
    vi.mocked(createInboxItemCore).mockResolvedValue({
      id: "item-1", text: "Cool — https://x.com", createdAt: new Date(),
    });
    await shareCapture(req, res, { entities: { E: 1 } });
    expect(createInboxItemCore).toHaveBeenCalledWith({ E: 1 }, {
      userId: "u1",
      text: "Cool — https://x.com",
    });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?id=item-1");
  });

  it("redirects to /share?error=server when core throws", async () => {
    const req = makeReq({ url: "https://x.com" }, { userId: "u1" });
    const res = makeRes();
    // SAFETY: mock function needs .mockRejectedValue; casting to any avoids generic mismatch.
    vi.mocked(createInboxItemCore).mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await shareCapture(req, res, { entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?error=server");
    errSpy.mockRestore();
  });

  it("encodes the item id in the redirect URL", async () => {
    const trickyId = "with space&special";
    const req = makeReq({ url: "https://x.com" }, { userId: "u1" });
    const res = makeRes();
    // SAFETY: mock function needs .mockResolvedValue; casting to any avoids generic mismatch.
    vi.mocked(createInboxItemCore).mockResolvedValue({
      id: trickyId, text: "https://x.com", createdAt: new Date(),
    });
    await shareCapture(req, res, { entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(
      303,
      `/share?id=${encodeURIComponent(trickyId)}`,
    );
  });

  it("returns redirect data for the service-worker bridge", async () => {
    // SAFETY: Record<string, unknown> cast for partial request body; makeReq adds typed fields.
    const req = makeReq({ url: "https://x.com" } as Record<string, unknown>, { userId: "u1" });
    Object.assign(req, { query: { response: "json" } });
    const res = makeRes();
    // SAFETY: mock function needs .mockResolvedValue; casting to any avoids generic mismatch.
    vi.mocked(createInboxItemCore).mockResolvedValue({ id: "item-1" });

    await shareCapture(req, res, { entities: {} });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ redirect: "/share?id=item-1" });
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
