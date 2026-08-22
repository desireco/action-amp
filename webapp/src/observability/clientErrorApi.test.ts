import { describe, expect, it } from "vitest";
import {
  clientErrorApiTestUtils,
  normalizeClientError,
} from "./clientErrorApi";

describe("normalizeClientError", () => {
  it("keeps useful stack context while removing product and identity data", () => {
    const result = normalizeClientError({
      kind: "promise",
      name: "TypeError",
      message: "Failed for user@example.com",
      stack:
        "TypeError: https://app.actionamp.com/do?task=secret\n at App.tsx:2",
      componentStack: "at user@example.com",
      path: "/do?task=secret",
      release: "abc123",
    });

    expect(result).toEqual({
      kind: "promise",
      name: "TypeError",
      message: "Failed for [redacted-email]",
      stack:
        "TypeError: https://app.actionamp.com/do?[redacted]\n at App.tsx:2",
      componentStack: "at [redacted-email]",
      path: "/do",
      release: "abc123",
    });
  });

  it("rejects malformed reports", () => {
    expect(normalizeClientError(null)).toBeNull();
    expect(normalizeClientError({ stack: "at App" })).toBeNull();
  });

  it("accepts a beacon text body", () => {
    expect(
      normalizeClientError(
        JSON.stringify({ message: "Render failed", path: "/do" }),
      )?.message,
    ).toBe("Render failed");
  });

  it("redacts item permalinks from client routes", () => {
    expect(
      normalizeClientError({
        message: "Render failed",
        path: "/do/projects/confidential-launch-plan",
      })?.path,
    ).toBe("/do/projects/:item");
  });
});

describe("client error rate limiting", () => {
  it("drops reports after twenty per minute for the same source", () => {
    const key = `test-${crypto.randomUUID()}`;
    const now = Date.now();
    for (let count = 0; count < 20; count += 1) {
      expect(clientErrorApiTestUtils.rateLimited(key, now)).toBe(false);
    }
    expect(clientErrorApiTestUtils.rateLimited(key, now)).toBe(true);
  });
});
