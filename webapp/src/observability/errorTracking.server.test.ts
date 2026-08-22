import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { sanitizeErrorText } from "./errorSanitization";
import {
  requestTrackingMiddleware,
  unexpectedErrorHandler,
} from "./errorTracking.server";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error telemetry sanitization", () => {
  it("redacts identity, credentials, tokens, and URL queries", () => {
    const text = sanitizeErrorText(
      "user@example.com Bearer secret-token https://app.actionamp.com/do?task=private postgresql://jake:password@localhost/db eyJabcdef.abcdefgh.abcdefgh",
    );
    expect(text).not.toContain("user@example.com");
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("task=private");
    expect(text).not.toContain(":password@");
    expect(text).not.toContain("eyJabcdef.abcdefgh.abcdefgh");
  });
});

describe("requestTrackingMiddleware", () => {
  it("keeps a safe upstream request ID and returns it to the caller", () => {
    const req = {
      header: () => "railway_request-123",
    } as unknown as Request;
    const headers = new Map<string, string>();
    const res = {
      locals: {},
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestTrackingMiddleware(req, res, next);

    expect(headers.get("x-actionamp-request-id")).toBe("railway_request-123");
    expect(res.locals.actionampRequestId).toBe("railway_request-123");
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("unexpectedErrorHandler", () => {
  it("logs a sanitized stack with correlation context and returns an opaque ID", () => {
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = {
      method: "POST",
      path: "/operations/create-task",
      originalUrl: "/operations/create-task?title=private",
    } as Request;
    const responseBody = vi.fn();
    const res = {
      locals: { actionampRequestId: "request_12345678" },
      headersSent: false,
      getHeader: () => "request_12345678",
      status: vi.fn().mockReturnValue({ json: responseBody }),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    const cause = new Error("failed for user@example.com");

    unexpectedErrorHandler(cause, req, res, next);

    const event = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(event.event).toBe("server.exception");
    expect(event.errorId).toBe("request_12345678");
    expect(event.request).toEqual({
      method: "POST",
      path: "/operations/create-task",
    });
    expect(event.error.message).toBe("failed for [redacted-email]");
    expect(responseBody).toHaveBeenCalledWith({
      message: "Internal server error.",
      data: { errorId: "request_12345678" },
    });
    expect(next).not.toHaveBeenCalled();
    process.env.NODE_ENV = priorNodeEnv;
  });
});
