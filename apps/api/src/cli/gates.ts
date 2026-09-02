/**
 * S18 — shared HTTP-layer helpers for the `/api/cli/*` routes.
 *
 * Ported from `webapp/src/auth/patRoutes.ts` (the helper block at the top of
 * that file). The lens-resolution + entitlement decision is an HTTP-layer
 * concern: it resolves to a 402 response, which the pure cores (rightfully)
 * know nothing about. Request-boundary parsing (query/body string reads with
 * "non-string = absent" semantics) also lives here — it is the ONLY place that
 * decodes external CLI values.
 *
 * Express→Hono mapping: the webapp handlers read `req.query` / `req.body` and
 * respond via `res.status(..).json(..)`. Here handlers read through
 * `queryString(req)` / `bodyString(body)` over Hono's request and respond via
 * `json(c, status, body)` — same bodies, same key order, same statuses.
 */
import type { Context } from "hono";
import {
  resolveLens,
  resolveAccessibleLenses,
  lensViolation,
  WORK_LENS_MESSAGE,
  type EntitlementUser,
  type EntitlementMessage,
} from "@actionamp/domain/billing";
import type { Entities } from "@actionamp/domain/db";

/** The PAT-resolved user slice every CLI handler reads (F10b PatUser). */
export type CliUser = {
  id: string;
  plan: string;
  planRenewsAt: Date | null;
  isAdmin: boolean;
  manualAccessGrant: "PRO" | "FOUNDER" | "FRIEND" | null;
  email: string | null;
  fullName: string;
};

/** Build the account-access slice the entitlement helpers read. */
export function toEntUser(user: CliUser): EntitlementUser {
  return {
    plan: user.plan,
    planRenewsAt: user.planRenewsAt,
    isAdmin: user.isAdmin,
    manualAccessGrant: user.manualAccessGrant,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Lens gate — resolve (tenancy) → 404 → FREE violation 402 → core.
// `not-found` and `not-owned` are the same 404 (no existence leak).
// ───────────────────────────────────────────────────────────────────────────

export type LensGateResult =
  | { status: "not-found" }
  | { status: "denied"; msg: EntitlementMessage }
  | {
      status: "ok";
      lens: { name: string; isIncluded?: boolean };
    };

export async function gateLens(
  entities: Entities,
  entUser: EntitlementUser,
  userId: string,
  lensId: string,
  msg: EntitlementMessage = WORK_LENS_MESSAGE,
): Promise<LensGateResult> {
  const lens = await resolveLens(entities, userId, lensId);
  if (!lens) return { status: "not-found" };
  const violation = lensViolation(entUser, lens, msg);
  if (violation) return { status: "denied", msg: violation };
  return { status: "ok", lens };
}

export async function firstAccessibleLensId(
  entities: Entities,
  entUser: EntitlementUser,
  userId: string,
): Promise<string | null> {
  const accessible = await resolveAccessibleLenses(entities, entUser, userId);
  return accessible[0]?.id ?? null;
}

/** Send the 402 entitlement body (the shape `cliNow` established). */
export function violationBody(msg: EntitlementMessage) {
  return {
    error: `${msg.feature} is a Pro feature.`,
    feature: msg.feature,
    reason: msg.reason,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Request-boundary parsing — the ONLY layer that reads query params / body.
// Non-string JSON values in string fields are treated as ABSENT (not errors)
// — the webapp's `isJsonString` constructor check.
// ───────────────────────────────────────────────────────────────────────────

/** A JSON value as JSON.parse produces it — every arm is concrete. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

/** A parsed CLI request body (all fields optional — routes read what they own). */
export type CliBody = { [key: string]: Json | undefined };

/**
 * Primitive-string test for JSON-parsed values. JSON.parse only ever produces
 * primitive strings (never boxed), so constructor identity is exact here —
 * numbers, booleans, arrays, and plain objects all fail it.
 */
function isJsonString(value: Json | undefined): value is string {
  return value?.constructor === String;
}

/**
 * Safely read a string query param or null. Express's qs produces strings,
 * arrays, and plain objects — a real param value is the one arm that is not
 * an Object instance, so a repeated param (`?a=1&a=2` → array) is ABSENT,
 * not "first value". Replicated via getAll: zero or 2+ values → null.
 */
export function queryString(req: Request, key: string): string | null {
  const values = new URL(req.url).searchParams.getAll(key);
  if (values.length !== 1) return null;
  const v = values[0];
  return v !== null && v !== undefined ? v : null;
}

/**
 * Parse the request body once (routes call this at the top). Invalid or
 * missing JSON → `{}` — the CLIs always send well-formed bodies, and the
 * body-parser-absent behavior matches Express leaving `req.body` at `{}`.
 */
export async function parseBody(req: Request): Promise<CliBody> {
  try {
    const parsed: unknown = await req.json();
    if (parsed instanceof Object && !Array.isArray(parsed)) {
      return parsed as CliBody;
    }
    return {};
  } catch {
    return {};
  }
}

/** Safely read a string field from a parsed JSON body or undefined. */
export function bodyString(
  body: CliBody | null | undefined,
  key: string,
): string | undefined {
  const v = body?.[key];
  return isJsonString(v) ? v : undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// Enum-boundary validation (triage decisions, priority, size) — an invalid
// value is a 400 at the boundary via InvalidCliField, never a downstream
// Prisma enum failure.
// ───────────────────────────────────────────────────────────────────────────

export const TRIAGE_DECISIONS = [
  "task-today",
  "upcoming",
  "someday",
  "project",
  "resource",
  "list-item",
  "archive",
  "delete",
] as const;

export type TriageDecisionString = (typeof TRIAGE_DECISIONS)[number];

const TRIAGE_DECISION_SET = new Set<string>(TRIAGE_DECISIONS);

export function isTriageDecision(value: string): value is TriageDecisionString {
  return TRIAGE_DECISION_SET.has(value);
}

const PRIORITIES = new Set<string>(["LOW", "NORMAL", "IMPORTANT"]);

function isPriority(value: string): value is "LOW" | "NORMAL" | "IMPORTANT" {
  return PRIORITIES.has(value);
}

const SIZES = new Set<string>(["S", "M", "L", "XL"]);

function isSize(value: string): value is "S" | "M" | "L" | "XL" {
  return SIZES.has(value);
}

/** A boundary-validation failure thrown by the read* helpers (mapped to 400). */
export class InvalidCliField extends Error {}

/** Read + validate `priority`; an invalid value is a 400 at the boundary. */
export function readPriority(body: CliBody | null | undefined) {
  const raw = bodyString(body, "priority");
  if (raw === undefined) return undefined;
  if (!isPriority(raw)) {
    throw new InvalidCliField("priority must be LOW, NORMAL, or IMPORTANT.");
  }
  return raw;
}

/** Read + validate `size` (same boundary treatment as priority). */
export function readSize(body: CliBody | null | undefined) {
  const raw = bodyString(body, "size");
  if (raw === undefined) return undefined;
  if (!isSize(raw)) {
    throw new InvalidCliField("size must be S, M, L, or XL.");
  }
  return raw;
}

/** An inbox/list capture attachment as the CLI sends it (base64 image parts). */
export type CliAttachment = {
  filename: string;
  mimeType: string;
  dataBase64: string;
};

/** Structural check for the attachment objects the CLI posts. */
export function isCliAttachment(value: Json): value is CliAttachment {
  return (
    value instanceof Object &&
    !Array.isArray(value) &&
    isJsonString(value.filename) &&
    isJsonString(value.mimeType) &&
    isJsonString(value.dataBase64)
  );
}

/**
 * A thrown entitlement rejection from an injected `assertLens` /
 * `assertProjectCap` callback. Tagged with `__entitlement` so the route's catch
 * can distinguish it from the core's own thrown `Error`s (which are 404 "not
 * found" or 500 unexpected). Built by the callbacks in the triage + add-task
 * routes; the catch translates `{httpStatus, message, feature, reason}` to the
 * matching HTTP response.
 */
export interface EntitlementRejection {
  __entitlement: true;
  httpStatus: 400 | 402 | 404;
  message: string;
  feature?: string;
  reason?: string;
}

/** Type guard for the entitlement-rejection objects the callbacks throw. */
export function isEntitlementRejection(
  cause: unknown,
): cause is EntitlementRejection {
  return (
    cause instanceof Object &&
    "__entitlement" in cause &&
    cause.__entitlement === true &&
    "httpStatus" in cause &&
    "message" in cause
  );
}

/**
 * Shared error handler for the task write cores. The cores throw plain
 * `Error("Task not found.")` on missing/wrong-tenancy; everything else is
 * unexpected. Mirrors how the Wasp ops surface these (404 vs 500 fallback).
 */
export function taskWriteErrorResponse(
  c: Context,
  cause: unknown,
  op: string,
): Response {
  if (cause instanceof Error && /not found/i.test(cause.message)) {
    return c.json({ error: cause.message }, 404);
  }
  console.error(`[cli/task/${op}] failed:`, cause);
  return c.json({ error: `Could not ${op} task.` }, 500);
}

/** The 402 lens-gate short-circuits, shared by every lens-scoped route. */
export function lensGateResponse(
  c: Context,
  gate: LensGateResult,
): Response | null {
  if (gate.status === "not-found") {
    return c.json({ error: "No such lens for this account." }, 404);
  }
  if (gate.status === "denied") {
    return c.json(violationBody(gate.msg), 402);
  }
  return null;
}
