// Unit tests for the /api/share route — ported from
// webapp/src/share/{composeShareText,shareCapture}.test.ts. The REAL composer
// runs (canonical copy lives in ./share.ts); the capture core and the session
// resolver are swapped through the injectable seams — no module mocking.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

import {
  composeShareCapture,
  composeShareText,
  createShareRoute,
  shareDeps,
} from "./share.js";

describe("composeShareText", () => {
  it("returns empty when all fields absent", () => {
    expect(composeShareText({})).toBe("");
    expect(composeShareText({ title: "", text: "", url: "" })).toBe("");
    expect(composeShareText({ title: "   ", url: " " })).toBe("");
  });

  it("title + url → 'Title — url'", () => {
    expect(composeShareText({ title: "Cool Page", url: "https://x.com" }))
      .toBe("Cool Page — https://x.com");
  });

  it("title only → title", () => {
    expect(composeShareText({ title: "Just a title" })).toBe("Just a title");
  });

  it("url only → url", () => {
    expect(composeShareText({ url: "https://x.com" })).toBe("https://x.com");
  });

  it("text + url → 'text — url'", () => {
    expect(composeShareText({ text: "a note", url: "https://x.com" }))
      .toBe("a note — https://x.com");
  });

  it("text only → text", () => {
    expect(composeShareText({ text: "just text" })).toBe("just text");
  });

  it("title + text + url → 'title: text — url'", () => {
    expect(composeShareText({
      title: "Headline", text: "body", url: "https://x.com",
    })).toBe("Headline: body — https://x.com");
  });

  it("does not repeat a title Android has also included in text", () => {
    expect(composeShareText({
      title: "Supply | Single Edge Razors | One Blade. Solid Steel.",
      text: "Supply | Single Edge Razors | One Blade. Solid Steel. https://share.google/example",
    })).toBe("Supply | Single Edge Razors | One Blade. Solid Steel. — https://share.google/example");
  });

  it("keeps Android title, body, and link as separate share properties", () => {
    expect(composeShareCapture({
      title: "Useful article",
      text: "Useful article Read this later",
      url: "https://example.com/article",
    })).toEqual({
      title: "Useful article",
      content: "Read this later",
      url: "https://example.com/article",
      text: "Useful article: Read this later — https://example.com/article",
    });
  });

  it("truncates each field to 2000 chars with ellipsis", () => {
    const long = "a".repeat(2500);
    const out = composeShareText({ title: long, url: "https://x.com" });
    // title truncated to 2000 + "…", then " — https://x.com"
    expect(out).toBe("a".repeat(2000) + "… — https://x.com");
  });

  it("trims whitespace from each field before composing", () => {
    expect(composeShareText({ title: "  Cool  ", url: "  https://x.com  " }))
      .toBe("Cool — https://x.com");
  });
});

// ----------------------------------------------------------------
// The route handler (Hono app driven via app.request)
// ----------------------------------------------------------------

function form(body: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  };
}

function makeApp(sessionUser: { id: string } | null) {
  const app = new Hono();
  app.post(
    "/api/share",
    createShareRoute({
      // SAFETY: the db handle is unused — the session seam is injected.
      db: {} as never,
      entities: { E: 1 } as never,
      getSession: async () => sessionUser,
    }),
  );
  return app;
}

const createInboxItem = vi.fn();
const realCreateInboxItem = shareDeps.createInboxItem;

beforeEach(() => {
  vi.clearAllMocks();
  // SAFETY: vi.fn() satisfies the capture-core signature at runtime.
  shareDeps.createInboxItem = createInboxItem as unknown as typeof realCreateInboxItem;
});

describe("shareCapture route", () => {
  it("redirects to /login when no session resolved", async () => {
    const res = await makeApp(null).request("/api/share", form({ title: "X", url: "https://x.com" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
    expect(createInboxItem).not.toHaveBeenCalled();
  });

  it("redirects to /share?error=empty when all fields blank", async () => {
    const res = await makeApp({ id: "u1" }).request("/api/share", form({ title: "   " }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/share?error=empty");
    expect(createInboxItem).not.toHaveBeenCalled();
  });

  it("saves composed text and redirects to /share?id= on success", async () => {
    createInboxItem.mockResolvedValue({
      id: "item-1",
      text: "Cool — https://x.com",
      createdAt: new Date(),
    });
    const res = await makeApp({ id: "u1" }).request(
      "/api/share",
      form({ title: "Cool", url: "https://x.com" }),
    );
    expect(createInboxItem).toHaveBeenCalledWith(expect.anything(), {
      userId: "u1",
      text: "Cool — https://x.com",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/share?id=item-1");
  });

  it("redirects to /share?error=server when core throws", async () => {
    createInboxItem.mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await makeApp({ id: "u1" }).request("/api/share", form({ url: "https://x.com" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/share?error=server");
    errSpy.mockRestore();
  });

  it("encodes the item id in the redirect URL", async () => {
    const trickyId = "with space&special";
    createInboxItem.mockResolvedValue({
      id: trickyId,
      text: "https://x.com",
      createdAt: new Date(),
    });
    const res = await makeApp({ id: "u1" }).request("/api/share", form({ url: "https://x.com" }));
    expect(res.headers.get("location")).toBe(`/share?id=${encodeURIComponent(trickyId)}`);
  });

  it("returns redirect data for the service-worker bridge", async () => {
    createInboxItem.mockResolvedValue({ id: "item-1", text: "x", createdAt: new Date() });
    const res = await makeApp({ id: "u1" }).request(
      "/api/share?response=json",
      form({ url: "https://x.com" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ redirect: "/share?id=item-1" });
  });
});
