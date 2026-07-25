// @vitest-environment node
// Server-op tests run in node: imports pull wasp/server types; jsdom is wrong.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock createInboxItemCore so no DB is touched. The handler's own logic +
// composeShareText (real) is what we exercise.
vi.mock("../inbox/operationsCore", () => ({
  createInboxItemCore: vi.fn(),
}));

import { shareCapture } from "./shareCapture";
import { createInboxItemCore } from "../inbox/operationsCore";
import type { Response } from "express";

function makeRes(): Response {
  return { redirect: vi.fn() } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shareCapture", () => {
  it("redirects to /login when context.user is null", async () => {
    const req = { body: { title: "X", url: "https://x.com" } } as any;
    const res = makeRes();
    await shareCapture(req, res, { user: undefined, entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/login");
    expect(createInboxItemCore).not.toHaveBeenCalled();
  });

  it("redirects to /share?error=empty when all fields blank", async () => {
    const req = { body: { title: "   " } } as any;
    const res = makeRes();
    await shareCapture(req, res, { user: { id: "u1" }, entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?error=empty");
    expect(createInboxItemCore).not.toHaveBeenCalled();
  });

  it("saves composed text and redirects to /share?id= on success", async () => {
    const req = { body: { title: "Cool", url: "https://x.com" } } as any;
    const res = makeRes();
    (createInboxItemCore as any).mockResolvedValue({
      id: "item-1", text: "Cool — https://x.com", createdAt: new Date(),
    });
    await shareCapture(req, res, { user: { id: "u1" }, entities: { E: 1 } });
    expect(createInboxItemCore).toHaveBeenCalledWith({ E: 1 }, {
      userId: "u1",
      text: "Cool — https://x.com",
    });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?id=item-1");
  });

  it("redirects to /share?error=server when core throws", async () => {
    const req = { body: { url: "https://x.com" } } as any;
    const res = makeRes();
    (createInboxItemCore as any).mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await shareCapture(req, res, { user: { id: "u1" }, entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(303, "/share?error=server");
    errSpy.mockRestore();
  });

  it("encodes the item id in the redirect URL", async () => {
    const trickyId = "with space&special";
    const req = { body: { url: "https://x.com" } } as any;
    const res = makeRes();
    (createInboxItemCore as any).mockResolvedValue({
      id: trickyId, text: "https://x.com", createdAt: new Date(),
    });
    await shareCapture(req, res, { user: { id: "u1" }, entities: {} });
    expect(res.redirect).toHaveBeenCalledWith(
      303,
      `/share?id=${encodeURIComponent(trickyId)}`,
    );
  });
});
