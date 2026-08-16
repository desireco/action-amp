/**
 * API client — the thin fetch wrapper every command uses.
 *
 * Reads the token from config, sets Authorization: Bearer, JSON-encodes the
 * body. Returns a typed result or throws ApiError (caught by the command
 * layer, which formats it for human/json output).
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
    throw new ApiError(401, { error: "Not logged in. Run: actionamp login" });
  }
  const { status, body } = await fetchApi<T>(cfg.apiUrl, cfg.token, path, init);
  if (status === 401) {
    throw new ApiError(401, { error: "Token rejected (401). Run: actionamp login" });
  }
  if (status === 402) {
    const b = body as unknown as { feature?: string };
    throw new ApiError(402, {
      error: b.feature ? `${b.feature} is a Pro feature.` : "Pro feature required (402).",
    });
  }
  if (status >= 400) {
    const errBody = (body ?? {}) as { error?: string };
    throw new ApiError(status, errBody);
  }
  return body;
}

/** A successful binary download: the bytes plus the response metadata. */
export type DownloadResult = {
  buffer: Buffer;
  mimeType: string;
  /** Filename from Content-Disposition, when the server sent one. */
  filename: string | null;
  size: number;
};

/**
 * Binary download — like request(), but for file bytes (attachment
 * downloads). Throws the same ApiErrors on 401/402/4xx/5xx (those responses
 * are JSON error bodies, so they parse the same way).
 */
export async function download(path: string): Promise<DownloadResult> {
  const cfg = readConfig();
  if (!cfg) {
    throw new ApiError(401, { error: "Not logged in. Run: actionamp login" });
  }
  const res = await fetch(
    `${cfg.apiUrl.replace(/\/$/, "")}${path}`,
    { headers: { Authorization: `Bearer ${cfg.token}` } },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
    if (res.status === 401) {
      throw new ApiError(401, { error: "Token rejected (401). Run: actionamp login" });
    }
    throw new ApiError(res.status, body);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get("content-type") ?? "application/octet-stream",
    filename: match?.[1] ?? null,
    size: Number(res.headers.get("content-length") ?? 0),
  };
}
