import { randomUUID } from "node:crypto";
import type {
  ErrorRequestHandler,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { ServerSetupFn } from "wasp/server";
import {
  safePath,
  sanitizeErrorText,
  sanitizeStack,
} from "./errorSanitization";

const REQUEST_ID_HEADER = "x-actionamp-request-id";
const REQUEST_ID_LOCAL = "actionampRequestId";
const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{8,100}$/;
let processMonitorInstalled = false;

type ErrorDetails = {
  name: string;
  message: string;
  stack: string | null;
  cause?: ErrorDetails;
};

export type ErrorTelemetryEvent =
  | {
      event: "server.exception";
      errorId: string;
      request: { method: string; path: string };
      error: ErrorDetails;
    }
  | {
      event: "server.process_exception";
      origin: string;
      errorId: string;
      error: ErrorDetails;
    }
  | {
      event: "client.exception";
      errorId: string | null;
      client: {
        kind: string;
        name: string;
        message: string;
        stack: string | null;
        componentStack: string | null;
        path: string;
        release: string | null;
      };
    };

function errorDetails(error: Error, depth = 0): ErrorDetails {
  const details: ErrorDetails = {
    name: sanitizeErrorText(error.name || "Error", 100),
    message: sanitizeErrorText(error.message),
    stack: sanitizeStack(error.stack),
  };
  if (depth < 3 && error.cause instanceof Error) {
    details.cause = errorDetails(error.cause, depth + 1);
  }
  return details;
}

function requestIdFrom(req: Request): string {
  const incoming = req.header(REQUEST_ID_HEADER);
  return incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

function requestIdFromResponse(res: Response): string {
  const responseHeader = String(res.getHeader(REQUEST_ID_HEADER) ?? "");
  return VALID_REQUEST_ID.test(responseHeader) ? responseHeader : randomUUID();
}

function release(): string | null {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.SOURCE_VERSION ??
    process.env.GIT_SHA ??
    null
  );
}

export function writeErrorEvent(event: ErrorTelemetryEvent): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "actionamp-server",
      release: release(),
      ...event,
    }),
  );
}

/** Correlation middleware installed on every API and Operation route. */
export const requestTrackingMiddleware: RequestHandler = (req, res, next) => {
  const requestId = requestIdFrom(req);
  res.locals[REQUEST_ID_LOCAL] = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
};

/**
 * Wasp installs its own HttpError handler before server setup runs. Expected
 * typed 4xx responses finish there; unexpected errors are forwarded to this
 * final handler, which records the stack and returns an opaque error ID.
 */
export const unexpectedErrorHandler: ErrorRequestHandler = (
  error: Error,
  req,
  res,
  next,
) => {
  const errorId = requestIdFromResponse(res);
  writeErrorEvent({
    event: "server.exception",
    errorId,
    request: {
      method: req.method,
      path: safePath(req.path || req.originalUrl),
    },
    error: errorDetails(error),
  });

  if (res.headersSent || process.env.NODE_ENV === "development") {
    next(error);
    return;
  }

  res.status(500).json({
    message: "Internal server error.",
    data: { errorId },
  });
};

function installProcessErrorMonitor(): void {
  if (processMonitorInstalled) return;
  processMonitorInstalled = true;
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    writeErrorEvent({
      event: "server.process_exception",
      origin,
      errorId: randomUUID(),
      error: errorDetails(error),
    });
  });
}

/** Runs after Wasp has assembled its routers, so this is truly the last handler. */
export const setupErrorTracking: ServerSetupFn = async ({ app }) => {
  installProcessErrorMonitor();
  app.use(unexpectedErrorHandler);
};

export const errorTrackingTestUtils = {
  errorDetails,
  requestIdFrom,
};
