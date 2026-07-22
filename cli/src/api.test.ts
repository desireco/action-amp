/**
 * Tests for the API client — error handling, auth, status codes.
 * Uses a mocked global fetch (no msw needed for these unit-level tests).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `actionamp-api-test-${process.pid}-${Date.now()}`) };
});
vi.mock("node:os", () => ({ homedir: () => TMP_HOME }));

const { writeConfig, deleteConfig, getConfigPath } = await import("./config.js");
const { request, fetchApi, ApiError } = await import("./api.js");

// Helper: build a fake fetch Response
function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status < 400,
    json: async () => body,
  } as Response;
}

describe("fetchApi", () => {
  it("sets Authorization header + JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchApi("http://localhost:3001", "aa_token", "/api/cli/now", {
      method: "POST",
      body: { text: "hello" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/cli/now",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer aa_token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ text: "hello" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("does not set Content-Type when no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchApi("http://localhost:3001", "aa_token", "/api/cli/now");

    const call = fetchMock.mock.calls[0][1] as RequestInit;
    expect(call.headers).not.toHaveProperty("Content-Type");
    expect(call.body).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe("request — error handling", () => {
  beforeEach(() => {
    mkdirSync(TMP_HOME, { recursive: true });
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
  });

  afterEach(() => {
    rmSync(TMP_HOME, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("returns body on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { task: null })));
    const result = await request("/api/cli/now");
    expect(result).toEqual({ task: null });
  });

  it("throws ApiError(401) when not logged in (no config)", async () => {
    deleteConfig();
    await expect(request("/api/cli/now")).rejects.toThrow("Not logged in");
  });

  it("throws ApiError(401) when token rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Invalid" })));
    await expect(request("/api/cli/now")).rejects.toThrow("Token rejected");
  });

  it("throws ApiError(402) for Pro features, with friendly message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(402, { feature: "the Work lens", reason: "pro" }),
      ),
    );
    try {
      await request("/api/cli/now");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("the Work lens is a Pro feature.");
      expect((err as ApiError).status).toBe(402);
    }
  });

  it("throws ApiError for other 4xx/5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: "Boom" })));
    await expect(request("/api/cli/now")).rejects.toThrow("Boom");
  });

  it("handles non-JSON error responses (body parse fails → empty)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(503, null)), // json() returns null
    );
    await expect(request("/api/cli/now")).rejects.toThrow("Request failed (503)");
  });
});
