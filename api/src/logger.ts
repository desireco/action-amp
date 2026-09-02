/**
 * Dual-mode logging:
 *   development (default) → human-readable colored lines, for the terminal.
 *   production (NODE_ENV=production, or LOG_FORMAT=json) → one JSON line per
 *   event, for machines (Railway log drain).
 *
 * The content is the same either way: who called what, with what outcome.
 */

export type LogLevel = "info" | "warn" | "error";

const HUMAN =
  process.env.LOG_FORMAT === "human" ||
  (process.env.LOG_FORMAT !== "json" && process.env.NODE_ENV !== "production");

/** Local time without the date (the date is today; the file has it). */
function clock(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function statusTone(status: number): string {
  if (status >= 500) return "\x1b[31m"; // red
  if (status >= 400) return "\x1b[33m"; // yellow
  return "\x1b[32m"; // green
}
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

export interface RequestLog {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  /** The acting user's email (F10 resolution), when the request had one. */
  user?: string | null;
  /** 1-char app marker so mixed stacks stay readable: A=api, W=webhook, C=cli. */
  app?: string;
  /** Optional detail (e.g. the Stripe event type, the rejected reason). */
  detail?: string;
}

/** True when a request line is noise and should not be logged at all. */
export function isNoise(req: RequestLog): boolean {
  // K8s/Railway/vite health polls — failures still surface (they're never 2xx).
  return (
    (req.path === "/health" || req.path === "/ready") &&
    req.status >= 200 &&
    req.status < 400
  );
}

export function logRequest(req: RequestLog): void {
  if (isNoise(req)) return;
  if (!HUMAN) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: req.status >= 500 ? "error" : "info",
        reqId: undefined,
        method: req.method,
        path: req.path,
        status: req.status,
        durationMs: req.durationMs,
        user: req.user ?? null,
        detail: req.detail ?? undefined,
      }),
    );
    return;
  }
  const time = clock();
  const status = `${statusTone(req.status)}${req.status}${RESET}`;
  const method = `${CYAN}${req.method.padEnd(4)}${RESET}`;
  const dur =
    req.durationMs >= 1000
      ? `${statusTone(500)}${(req.durationMs / 1000).toFixed(1)}s${RESET}`
      : `${DIM}${Math.round(req.durationMs)}ms${RESET}`;
  const who = req.user ? ` ${DIM}${req.user}${RESET}` : "";
  const detail = req.detail ? ` ${DIM}· ${req.detail}${RESET}` : "";
  console.log(`${DIM}${time}${RESET} ${status} ${dur} ${method} ${req.path}${who}${detail}`);
}

/** A non-request event (startup, reminder pass, webhook outcome, seed...). */
export function logEvent(
  level: LogLevel,
  message: string,
  fields?: Record<string, unknown>,
): void {
  if (!HUMAN) {
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields }),
    );
    return;
  }
  const tone = level === "error" ? "\x1b[31m" : level === "warn" ? "\x1b[33m" : "";
  const fieldsText = fields && Object.keys(fields).length > 0
    ? ` ${DIM}${JSON.stringify(fields)}${RESET}`
    : "";
  console.log(`${tone}${clock()} ${level.toUpperCase()} ${message}${RESET}${fieldsText}`);
}

export const isHumanFormat = HUMAN;
