// S5 — the HTTP-ish error the ports of webapp's op-layer throw. Webapp ops
// threw `HttpError` from `wasp/server` (with `statusCode`); the domain keeps
// the exact message+status surface without any framework import. The API
// layer (`apps/api`) maps these onto oRPC's typed errors — NOT_FOUND → 404,
// CONFLICT → 409, BAD_REQUEST → 400 — and the unit tests ported from webapp
// assert on the same `statusCode` field.
export class HttpError extends Error {
  readonly statusCode: number;
  /** Structured payload — the 402 gate carries `{ feature, reason }`. */
  readonly data?: Record<string, string>;

  constructor(
    statusCode: number,
    message: string,
    data?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

/** Throw an error carrying an HTTP status (webapp entitlementHttp.ts's
 *  `throwHttpStatus`, freed of `wasp/server`). */
export function throwHttpStatus(statusCode: number, message: string): never {
  throw new HttpError(statusCode, message);
}
