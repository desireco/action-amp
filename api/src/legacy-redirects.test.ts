// createLegacyRedirectRoutes — the production answers for old /app and /do
// URLs (the web +server.ts equivalents never reach the static SPA build).
// These tests pin the redirect targets + status the deployed image must send.
import { describe, it, expect } from "vitest";
import { Hono } from "hono";

import { createLegacyRedirectRoutes } from "./legacy-redirects.js";

function subject() {
  return new Hono().route("/", createLegacyRedirectRoutes());
}

describe("legacy redirects", () => {
  it("/app redirects home (307)", async () => {
    const res = await subject().request("/app");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/");
  });

  it("/do redirects home (307)", async () => {
    const res = await subject().request("/do");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/");
  });

  it("/do/<path> strips the prefix and keeps the query", async () => {
    const res = await subject().request("/do/today/write-the-docs?capture=1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/today/write-the-docs?capture=1");
  });

  it("unknown paths fall through (no redirect)", async () => {
    const res = await subject().request("/today");
    expect(res.status).toBe(404); // nothing mounted — the real app continues
  });
});
