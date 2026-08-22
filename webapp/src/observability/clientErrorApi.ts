import express, { type Request, type Response } from "express";
import type { MiddlewareConfigFn } from "wasp/server";
import {
  safePath,
  sanitizeErrorText,
  sanitizeStack,
} from "./errorSanitization";
import { writeErrorEvent } from "./errorTracking.server";
import { isJsonString, type JsonValue } from "../shared/jsonValue";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const buckets = new Map<string, { count: number; startedAt: number }>();

type JsonObject = { [key: string]: JsonValue };

function object(value: JsonValue | undefined): JsonObject | null {
  if (!value || !(value instanceof Object) || Array.isArray(value)) return null;
  // SAFETY: JsonValue's only non-array object member is a string-keyed JsonObject.
  return value as JsonObject;
}

function rateLimited(key: string, now = Date.now()): boolean {
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { count: 1, startedAt: now });
    return false;
  }
  current.count += 1;
  return current.count > MAX_PER_WINDOW;
}

export function normalizeClientError(value: JsonValue | string | undefined) {
  let decoded: JsonValue | undefined = value;
  if (isJsonString(value)) {
    try {
      decoded = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const body = object(decoded);
  if (!body) return null;
  if (!isJsonString(body.message) || !body.message.trim()) return null;
  const message = sanitizeErrorText(body.message);
  const kind = isJsonString(body.kind) ? body.kind : "unknown";
  return {
    kind: sanitizeErrorText(kind, 80),
    name: sanitizeErrorText(isJsonString(body.name) ? body.name : "Error", 100),
    message,
    stack: sanitizeStack(isJsonString(body.stack) ? body.stack : null),
    componentStack: sanitizeStack(
      isJsonString(body.componentStack) ? body.componentStack : null,
    ),
    path: safePath(isJsonString(body.path) ? body.path : null),
    release: isJsonString(body.release)
      ? sanitizeErrorText(body.release, 100)
      : null,
  };
}

/** Beacon uses a CORS-safelisted text body so crash reports survive unload. */
export const clientErrorMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  middlewareConfig.set(
    "express.text.client-error",
    express.text({ type: "text/plain", limit: "32kb" }),
  );
  return middlewareConfig;
};

/** Anonymous, write-only browser error sink. It logs no IP or user identity. */
export function reportClientErrorApi(req: Request, res: Response) {
  const clientError = normalizeClientError(req.body);
  if (!clientError) {
    return res.status(400).json({ error: "Invalid error report." });
  }

  const rateKey = req.ip || req.socket.remoteAddress || "unknown";
  if (rateLimited(rateKey)) return res.status(204).end();

  const requestId = sanitizeErrorText(
    String(res.getHeader("x-actionamp-request-id") ?? ""),
    100,
  );
  writeErrorEvent({
    event: "client.exception",
    errorId: requestId || null,
    client: clientError,
  });
  return res.status(204).end();
}

export const clientErrorApiTestUtils = { rateLimited };
