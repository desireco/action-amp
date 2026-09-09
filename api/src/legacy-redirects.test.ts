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
  it("/app redirects home (308 permanent)", async () => {
    const res = await subject().request("/app");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/");
  });

  it("/app/<path> forwards the subpath (the old /app→/do chain)", async () => {
    const res = await subject().request("/app/today?capture=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/today?capture=1");
  });

  it("/do redirects home (308 permanent)", async () => {
    const res = await subject().request("/do");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/");
  });

  it("/do/<path> strips the prefix and keeps the query", async () => {
    const res = await subject().request("/do/today/write-the-docs?capture=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/today/write-the-docs?capture=1");
  });

  it("old review routes land on the logbook, not a 404", async () => {
    const subjectApp = subject();
    for (const path of ["/do/review", "/do/review/today", "/do/review/week", "/do/review/month"]) {
      const res = await subjectApp.request(path);
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("/logbook");
    }
  });

  it("/do/settings/pat → settings hub; /do/settings/admin → admin", async () => {
    const subjectApp = subject();
    const pat = await subjectApp.request("/do/settings/pat");
    expect(pat.headers.get("location")).toBe("/settings");
    const admin = await subjectApp.request("/do/settings/admin");
    expect(admin.headers.get("location")).toBe("/admin");
  });

  it("the remap applies to /app/* too (the forwarded chain)", async () => {
    const res = await subject().request("/app/review/week");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/logbook");
  });

  it("unknown paths fall through (no redirect)", async () => {
    const res = await subject().request("/today");
    expect(res.status).toBe(404); // nothing mounted — the real app continues
  });
});
