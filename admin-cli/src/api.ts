/**
 * API client — the thin fetch wrapper every admin command uses.
 *
 * Identical mechanics to the user CLI: reads the token from config, sets
 * Authorization: Bearer, JSON-encodes the body. Returns a typed result or
 * throws ApiError (caught by the command layer, which formats it for output).
 *
 * The admin-specific behavior lives in login.ts (admin gate) and the command
 * set — the transport is unchanged because admin + user hit the same backend.
 */
import { readConfig } from "./config.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: string } & Record<string, unknown>,
  ) {
    const message = body.error ?? `Request failed (${status}).`;
    super(message);
    this.name = "ApiError";
  }
}

export type ApiResult<T> = { status: number; body: T };

/** Options for fetchApi/request — our own type, not RequestInit, to avoid body clashes. */
export type ApiInit = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Low-level fetch — takes an explicit apiUrl + token (so tests can inject).
 * Most commands should use `request()` below, which reads config.
 */
export async function fetchApi<T>(
  apiUrl: string,
  token: string,
  path: string,
  init?: ApiInit,
): Promise<ApiResult<T>> {
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
    method: init?.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

/**
 * High-level request — reads config, throws ApiError on failure.
 * Use this in commands. Returns the parsed body on success.
 */
export async function request<T>(path: string, init?: ApiInit): Promise<T> {
  const cfg = readConfig();
  if (!cfg) {
    throw new ApiError(401, { error: "Not logged in. Run: actionamp-admin login" });
  }
  const { status, body } = await fetchApi<T>(cfg.apiUrl, cfg.token, path, init);
  if (status === 401) {
    throw new ApiError(401, { error: "Token rejected (401). Run: actionamp-admin login" });
  }
  // Admin routes return 403 for non-admins. Surface the server's message.
  if (status === 403) {
    const errBody = (body ?? {}) as { error?: string };
    throw new ApiError(403, errBody);
  }
  if (status >= 400) {
    const errBody = (body ?? {}) as { error?: string };
    throw new ApiError(status, errBody);
  }
  return body;
}
