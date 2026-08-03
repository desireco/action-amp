/**
 * PAT route handlers + the full `/api/cli/*` command surface.
 *
 * Three session-authed routes (issue / revoke / list) manage tokens from the
 * Settings UI. They run behind Wasp's normal `auth: true` (the logged-in user
 * is `context.user`). The `/api/cli/*` routes run behind `patRouteMiddleware`
 * instead (Bearer auth) and delegate to the pure operation cores.
 *
 * Every `/api/cli/*` handler follows the same shape:
 *   1. Read `req.patUser` (resolved by `patRouteMiddleware`). 401 if absent
 *      (defensive — the middleware already rejects bad tokens).
 *   2. Build `entUser` (the `{plan, planRenewsAt, isAdmin}` slice the pure
 *      entitlement helpers read).
 *   3. For lens-scoped reads/writes, resolve the lens via `resolveLens` +
 *      enforce the FREE-lens rule via the PURE `lensViolation` (NOT
 *      `assertLensAllowed` from `entitlementHttp.ts`, which imports
 *      `wasp/server` for `HttpError` — these routes have no Wasp operation
 *      context). A non-null violation → 402 with `{error, feature, reason}`.
 *   4. Delegate to the pure core (the `operationsCore.ts` files), passing
 *      `authEntities` (the shared Prisma singleton from ./prisma.ts).
 *
 * The entitlement guards use the SAME pure helpers the Wasp op wrappers use
 * (`lensViolation`/`capViolation`/`resolveLens`/`resolveAccessibleLenses`) —
 * the op wrappers just route the violation through `entitlementHttp.ts`'s
 * `HttpError`-throwing shim. Here we translate a non-null violation to
 * `res.status(402).json(...)` directly.
 */
import type { Request, Response } from "express";
import { generateToken, hashToken } from "./pat";
import { authEntities } from "./prisma";
// Side-effect import: loads the `declare module "express-serve-static-core"`
// augmentation that adds `req.patUser` / `req.patApiKeyId` to Express's
// Request type. Without this, tsc compiling this file in isolation (the
// server bundle's tsc --build) can't see the augmentation and reports
// "Property 'patUser' does not exist on type 'Request'".
import "./patMiddleware";
import {
  resolveLens,
  resolveAccessibleLenses,
  lensViolation,
  capViolation,
  WORK_LENS_MESSAGE,
  type EntitlementUser,
  type EntitlementMessage,
} from "../billing/entitlements";
import { FREE_LIMITS } from "../billing/config";
import {
  getTaskData,
  getTodayTasksData,
  getDoneTodayData,
  getTopTaskData,
  toggleTaskDoneCore,
  snoozeTaskCore,
  updateTaskStatusCore,
  startTaskCore,
  pauseTaskCore,
} from "../tasks/operationsCore";
import {
  createInboxItemCore,
  getInboxItemsCore,
  triageInboxItemCore,
  type TriageDecision,
} from "../inbox/operationsCore";
import {
  getProjectsData,
  getProjectData,
  createProjectCore,
  createTaskCore,
} from "../projects/operationsCore";
import {
  getGoalsData,
  getGoalData,
  createGoalCore,
} from "../goals/operationsCore";
import { getLensesCore, getLensCore } from "../lenses/operationsCore";
import { getLogbookData } from "../logbook/operationsCore";
import {
  createResourceCore,
  deleteResourceCore,
  getProjectResourcesData,
  getResourceData,
  updateResourceCore,
} from "../resources/operationsCore";
import {
  listFeedbackCore,
  showFeedbackCore,
  updateFeedbackStatusCore,
  deleteFeedbackCore,
  isFeedbackStatus,
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "../feedback/operationsCore";
import { getAdminStatsCore, getRecentFeedbackCore } from "../admin/operationsCore";
import { getFunnelStatsCore, type FunnelRange } from "../analytics/operationsCore";

// Wasp injects `context.entities.<EntityName>` (Prisma clients) for every
// entity listed in the route's `entities:` array. We type the slice we use so
// the handler is self-documenting; Wasp's runtime types this as `any`.
type WaspApiContext = {
  user?: { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any;
};

// ───────────────────────────────────────────────────────────────────────────
// Shared helpers — the lens-resolution + entitlement decision shared by every
// lens-scoped CLI handler. Kept here (not in operationsCore) because the
// decision is an HTTP-layer concern: it resolves to a 402 response, which the
// pure cores (rightfully) know nothing about.
// ───────────────────────────────────────────────────────────────────────────

/** Build the `{plan, planRenewsAt, isAdmin}` slice the entitlement helpers read. */
function toEntUser(user: {
  plan: string;
  planRenewsAt: Date | null;
  isAdmin: boolean;
}): EntitlementUser {
  return {
    plan: user.plan,
    planRenewsAt: user.planRenewsAt,
    isAdmin: user.isAdmin,
  };
}

/**
 * Resolve a lensId to its `{name, kind}` (tenancy-safe) and return the FREE-lens
 * violation if the user isn't entitled to it. Returns `null` when the lens
 * doesn't exist (so the caller can 404) or the resolved lens (entitled), or the
 * violation message (gated). Mirrors `assertLensAllowed` from
 * `entitlementHttp.ts` but returns data instead of throwing `HttpError` — the
 * route handler decides the HTTP status.
 *
 * Returns a discriminated result so the caller branches cleanly:
 *   - `{status: "not-found"}`    → 404 (no such lens for this account)
 *   - `{status: "denied", msg}`  → 402 (FREE user, gated lens)
 *   - `{status: "ok", lens}`     → proceed (the resolved `{name, kind}`)
 */
type LensGateResult =
  | { status: "not-found" }
  | { status: "denied"; msg: EntitlementMessage }
  | { status: "ok"; lens: { name: string; kind: "PERSONAL" | "WORK" | "CUSTOM" } };

async function gateLens(
  entUser: EntitlementUser,
  userId: string,
  lensId: string,
  msg: EntitlementMessage = WORK_LENS_MESSAGE,
): Promise<LensGateResult> {
  const lens = await resolveLens(authEntities, userId, lensId);
  if (!lens) return { status: "not-found" };
  const violation = lensViolation(entUser, lens, msg);
  if (violation) return { status: "denied", msg: violation };
  return { status: "ok", lens };
}

/** Send the 402 entitlement body (the shape `cliNow` established). */
function sendViolation(res: Response, msg: EntitlementMessage) {
  return res.status(402).json({
    error: `${msg.feature} is a Pro feature.`,
    feature: msg.feature,
    reason: msg.reason,
  });
}

/** Safely read a string from an Express query param or null. */
function queryString(req: Request, key: string): string | null {
  const v = req.query[key];
  return typeof v === "string" ? v : null;
}

/** Safely read a string field from a JSON body or undefined. */
function bodyString(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const v = (body as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * A thrown entitlement rejection from an injected `assertLens` /
 * `assertProjectCap` callback. Tagged with `__entitlement` so the route's catch
 * can distinguish it from the core's own thrown `Error`s (which are 404 "not
 * found" or 500 unexpected). Built by the callbacks in the triage + add-task
 * routes; the catch translates `{httpStatus, message, feature, reason}` to the
 * matching HTTP response.
 */
interface EntitlementRejection {
  __entitlement: true;
  httpStatus: 402 | 404;
  message: string;
  feature?: string;
  reason?: string;
}

/** Type guard for the entitlement-rejection objects the callbacks throw. */
function isEntitlementRejection(err: unknown): err is EntitlementRejection {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { __entitlement?: unknown }).__entitlement === true
  );
}

/**
 * Shared error handler for the task write cores. The cores throw plain
 * `Error("Task not found.")` on missing/wrong-tenancy; everything else is
 * unexpected. Mirrors how the Wasp ops surface these (404 via throwHttpStatus
 * vs 500 fallback) without needing wasp/server here.
 */
function taskWriteError(
  res: Response,
  err: unknown,
  op: string,
) {
  if (err instanceof Error && /not found/i.test(err.message)) {
    return res.status(404).json({ error: err.message });
  }
  console.error(`[cli/task/${op}] failed:`, err);
  return res.status(500).json({ error: `Could not ${op} task.` });
}

// ───────────────────────────────────────────────────────────────────────────
// POST /api/pat/issue — session-authed. Body: { label }. Returns plaintext once.
// ───────────────────────────────────────────────────────────────────────────
export const patIssue = async (req: Request, res: Response, context: WaspApiContext) => {
  if (!context.user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const label =
    typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 80) : "";
  if (!label) {
    return res.status(400).json({ error: "A label is required." });
  }

  const plaintext = generateToken();
  const hashedToken = hashToken(plaintext);
  const created = await context.entities.ApiKey.create({
    data: { hashedToken, label, userId: context.user.id },
    select: { id: true, label: true, createdAt: true },
  });

  // Plaintext returned exactly once. The DB row only has the hash; the client
  // is responsible for storing/copying the plaintext now or never.
  return res.status(201).json({
    token: plaintext,
    id: created.id,
    label: created.label,
    createdAt: created.createdAt,
    // Friendly reminder for the UI to show next to the copy button.
    notice: "This token won't be shown again. Copy it now.",
  });
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/pat/revoke — session-authed. Body: { id }. Tenancy-safe delete.
// ───────────────────────────────────────────────────────────────────────────
export const patRevoke = async (req: Request, res: Response, context: WaspApiContext) => {
  if (!context.user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = typeof req.body?.id === "string" ? req.body.id : null;
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }

  // Tenancy check: find first constrained to this user, then delete by id.
  // A raw deleteMany with `{ id, userId }` would also work; findFirst makes
  // the missing-vs-not-owned distinction explicit (404 vs 200).
  const owned = await context.entities.ApiKey.findFirst({
    where: { id, userId: context.user.id },
    select: { id: true },
  });
  if (!owned) {
    return res.status(404).json({ error: "No such token for this account." });
  }
  await context.entities.ApiKey.delete({ where: { id: owned.id } });
  return res.status(200).json({ revoked: true, id: owned.id });
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/pat/list — session-authed. Returns the user's keys, never the hash.
// ───────────────────────────────────────────────────────────────────────────
export const patList = async (_req: Request, res: Response, context: WaspApiContext) => {
  if (!context.user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const keys = await context.entities.ApiKey.findMany({
    where: { userId: context.user.id },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
  return res.status(200).json({ keys });
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/cli/now — PAT-middleware protected. Returns the user's top task.
//
// Lens resolution + the FREE-lens entitlement gate stay in the route (HTTP-
// layer concerns); the candidate pool + ranking live in `getTopTaskData` (the
// pure core shared with `getTopTask`). Without both gates the CLI either
// surfaces snoozed tasks the home screen hides, or lets a FREE user read
// Pro-gated lens data.
// ───────────────────────────────────────────────────────────────────────────
export const cliNow = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    // Defensive — middleware should have caught this. Never silently proceed.
    return res.status(401).json({ error: "Not authenticated." });
  }

  const entUser = toEntUser(user);

  try {
    const requestedLensId = queryString(req, "lensId");
    let lensId: string | null;

    if (requestedLensId) {
      // Explicit lens: tenancy lookup + FREE-lens rule. 404 for not-owned
      // keeps "no such lens" indistinguishable from "exists but not yours".
      const gate = await gateLens(entUser, user.id, requestedLensId);
      if (gate.status === "not-found") {
        return res.status(404).json({ error: "No such lens for this account." });
      }
      if (gate.status === "denied") {
        return sendViolation(res, gate.msg);
      }
      lensId = requestedLensId;
    } else {
      // No lens specified: default to the user's first *accessible* lens.
      // resolveAccessibleLenses already applies the entitlement filter
      // (FREE → PERSONAL-only), so the default can never land on a gated lens
      // — matching the web app's behavior where a FREE user lands on Me.
      const accessible = await resolveAccessibleLenses(authEntities, entUser, user.id);
      lensId = accessible[0]?.id ?? null;
    }

    if (!lensId) {
      // No accessible lenses at all — the user hasn't completed onboarding (or
      // a FREE user with no PERSONAL lens, which shouldn't happen post-seed).
      return res.status(200).json({ task: null, reason: "no-lens" });
    }

    // Candidate pool + ranking live in the pure core (shared with getTopTask):
    // `activePoolWhere` (including the snooze guard) + the priority/size/age
    // comparator. getTopTaskData handles the ranking internally.
    const top = await getTopTaskData(authEntities, {
      userId: user.id,
      lensId,
    });

    if (!top) {
      return res.status(200).json({ task: null, reason: "no-candidates" });
    }
    return res.status(200).json({ task: top });
  } catch (err) {
    console.error("[cli/now] failed:", err);
    return res.status(500).json({ error: "Could not resolve top task." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/cli/capture — PAT-middleware protected. Quick-capture to inbox.
//
// Delegates to `createInboxItemCore` (the pure core shared with
// `createInboxItem`). Inbox is universal (not lens-scoped), so no entitlement
// gate; the PAT already resolved the user. `projectName` is optional (the
// typeahead pick); the parser also extracts #project / @date / !priority /
// #tags / [[lens]].
// ───────────────────────────────────────────────────────────────────────────
export const cliCapture = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "Capture text is required." });
  }
  const projectName = bodyString(req.body, "projectName");
  const attachments = Array.isArray(req.body?.attachments)
    ? req.body.attachments.filter((attachment: unknown): attachment is { filename: string; mimeType: string; dataBase64: string } =>
      typeof attachment === "object" && attachment !== null
      && typeof (attachment as Record<string, unknown>).filename === "string"
      && typeof (attachment as Record<string, unknown>).mimeType === "string"
      && typeof (attachment as Record<string, unknown>).dataBase64 === "string",
    )
    : undefined;
  if (Array.isArray(req.body?.attachments) && attachments?.length !== req.body.attachments.length) {
    return res.status(400).json({ error: "Attachments must include filename, mimeType, and dataBase64." });
  }

  try {
    const created = await createInboxItemCore(authEntities, {
      userId: user.id,
      text,
      projectName,
      title: bodyString(req.body, "title"),
      content: bodyString(req.body, "content"),
      sourceUrl: bodyString(req.body, "sourceUrl"),
      attachments,
    });
    return res.status(201).json({ ok: true, ...created });
  } catch (err) {
    console.error("[cli/capture] failed:", err);
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not capture." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/cli/whoami — PAT-middleware protected. Returns the resolved user.
//
// Used by the CLI's `login` flow (post-callback "Signed in as <email>") and
// by a future `actionamp whoami` command. Cheap: the middleware already did
// the resolve; this just returns what's on req.patUser.
// ───────────────────────────────────────────────────────────────────────────
export const cliWhoami = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      plan: user.plan,
      // isAdmin is resolved by patAuthMiddleware from the User row. Surfaced
      // here so the admin CLI can gate login on it (the user CLI ignores it).
      isAdmin: user.isAdmin,
    },
  });
};

// ───────────────────────────────────────────────────────────────────────────
// Task routes
// ───────────────────────────────────────────────────────────────────────────

// GET /api/cli/task/show — detail read. No lens guard (detail reads are
// unguarded, same as the `getTask` op — tenancy is the only check, enforced
// by the core's `findFirst({ userId, OR:[{id},{permalink:id}] })`).
export const cliTaskShow = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = queryString(req, "id");
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }
  try {
    const task = await getTaskData(authEntities, { userId: user.id, id });
    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }
    return res.status(200).json({ task });
  } catch (err) {
    console.error("[cli/task/show] failed:", err);
    return res.status(500).json({ error: "Could not load task." });
  }
};

// POST /api/cli/task/start — body { id }. Returns { id, startedAt }.
export const cliTaskStart = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = bodyString(req.body, "id");
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }
  try {
    const result = await startTaskCore(authEntities, { userId: user.id, id });
    return res.status(200).json(result);
  } catch (err) {
    return taskWriteError(res, err, "start");
  }
};

// POST /api/cli/task/pause — body { id }. Returns { id, startedAt }.
export const cliTaskPause = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = bodyString(req.body, "id");
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }
  try {
    const result = await pauseTaskCore(authEntities, { userId: user.id, id });
    return res.status(200).json(result);
  } catch (err) {
    return taskWriteError(res, err, "pause");
  }
};

// POST /api/cli/task/done — body { id, outcome? }. Returns the updated task.
export const cliTaskDone = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = bodyString(req.body, "id");
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }
  const outcome = bodyString(req.body, "outcome");
  try {
    const task = await toggleTaskDoneCore(authEntities, {
      userId: user.id,
      id,
      outcome,
    });
    return res.status(200).json({ task });
  } catch (err) {
    return taskWriteError(res, err, "toggle");
  }
};

// POST /api/cli/task/snooze — body { id, preset }. Returns { id, status, dueDate }.
export const cliTaskSnooze = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = bodyString(req.body, "id");
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }
  const preset = bodyString(req.body, "preset");
  if (
    preset !== "1h" &&
    preset !== "3h" &&
    preset !== "tomorrow" &&
    preset !== "weekend" &&
    preset !== "someday"
  ) {
    return res.status(400).json({ error: "Invalid snooze preset." });
  }
  try {
    const result = await snoozeTaskCore(authEntities, {
      userId: user.id,
      id,
      preset,
    });
    return res.status(200).json(result);
  } catch (err) {
    return taskWriteError(res, err, "snooze");
  }
};

// POST /api/cli/task/move — body { id, status, dueDate? }. Returns the updated task.
export const cliTaskMove = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = bodyString(req.body, "id");
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }
  const status = bodyString(req.body, "status");
  if (status !== "TODAY" && status !== "UPCOMING" && status !== "SOMEDAY") {
    return res.status(400).json({ error: "Invalid status." });
  }
  const dueDateRaw = req.body?.dueDate;
  const dueDate =
    typeof dueDateRaw === "string" || dueDateRaw instanceof Date
      ? new Date(dueDateRaw)
      : undefined;
  try {
    const task = await updateTaskStatusCore(authEntities, {
      userId: user.id,
      id,
      status,
      dueDate,
    });
    return res.status(200).json({ task });
  } catch (err) {
    return taskWriteError(res, err, "move");
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Today routes
// ───────────────────────────────────────────────────────────────────────────

// GET /api/cli/today — global Today list (across all accessible lenses).
// No lens guard — `getTodayTasksData` applies the accessible-lens SET filter
// (resolveAccessibleLenses), the entitlement gate for global Today.
export const cliToday = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const entUser = toEntUser(user);
  try {
    const tasks = await getTodayTasksData(authEntities, {
      user: entUser,
      userId: user.id,
    });
    return res.status(200).json({ tasks });
  } catch (err) {
    console.error("[cli/today] failed:", err);
    return res.status(500).json({ error: "Could not load today." });
  }
};

// GET /api/cli/today/done — completed today (across all accessible lenses).
export const cliTodayDone = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const entUser = toEntUser(user);
  try {
    const accessible = await resolveAccessibleLenses(authEntities, entUser, user.id);
    const lensIds = accessible.map((l) => l.id);
    const tasks = await getDoneTodayData(authEntities, {
      userId: user.id,
      lensIds,
    });
    return res.status(200).json({ tasks });
  } catch (err) {
    console.error("[cli/today/done] failed:", err);
    return res.status(500).json({ error: "Could not load done-today." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Inbox routes
// ───────────────────────────────────────────────────────────────────────────

// GET /api/cli/inbox/list — unprocessed inbox items (newest first). No lens
// guard (the inbox is universal).
export const cliInboxList = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const items = await getInboxItemsCore(authEntities, { userId: user.id });
    return res.status(200).json({ items });
  } catch (err) {
    console.error("[cli/inbox/list] failed:", err);
    return res.status(500).json({ error: "Could not load inbox." });
  }
};

// POST /api/cli/inbox/triage — body { inboxItemId, decision, lensId, ... }.
//
// The core expects two injected entitlement callbacks (so it stays free of
// `wasp/server`): `assertLens` (FREE-lens filing guard) and `assertProjectCap`
// (per-lens project cap). The Wasp op wrapper supplies them via
// `assertLensAllowed` / `assertUnderCap` (which throw HttpError); here we build
// them from the PURE `lensViolation` / `capViolation` helpers. The callbacks
// THROW on violation (the core awaits them before doing work, expecting a
// rejection to short-circuit) — so we throw an object the route can catch and
// translate to a 402. A custom error tag avoids colliding with the core's own
// "not found" Error messages (which map to 404).
export const cliInboxTriage = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const entUser = toEntUser(user);
  const inboxItemId = bodyString(req.body, "inboxItemId");
  const decision = bodyString(req.body, "decision") as TriageDecision | undefined;
  const lensId = bodyString(req.body, "lensId");
  if (!inboxItemId || !decision) {
    return res
      .status(400)
      .json({ error: "inboxItemId and decision are required." });
  }
  // Archive + delete discard the item — neither files into a lens, so lensId
  // is optional for them. Every other decision (task/project/resource) needs
  // a lens to file into.
  const lensOptional = decision === "archive" || decision === "delete";
  if (!lensOptional && !lensId) {
    return res.status(400).json({
      error: `lensId is required for the "${decision}" decision.`,
    });
  }

  // assertLens: resolve the lens (tenancy-safe) and check the FREE-lens rule.
  // Throws a tagged violation so the catch below can 402 it. Mirrors
  // `assertLensAllowed` from entitlementHttp.ts without the HttpError dep.
  const assertLens = async (resolvedLensId: string): Promise<void> => {
    const gate = await gateLens(entUser, user.id, resolvedLensId);
    if (gate.status === "not-found") {
      // The core resolved a lens that doesn't belong to the user — treat as
      // 404 so the CLI surfaces "not found" rather than a silent 402.
      throw { __entitlement: true, httpStatus: 404, message: "No such lens for this account." };
    }
    if (gate.status === "denied") {
      throw {
        __entitlement: true,
        httpStatus: 402,
        message: `${gate.msg.feature} is a Pro feature.`,
        feature: gate.msg.feature,
        reason: gate.msg.reason,
      };
    }
  };

  // assertProjectCap: check the per-lens FREE project cap. The core computes
  // the current count and hands it to us; we decide. Mirrors `assertUnderCap`.
  const assertProjectCap = async (
    _resolvedLensId: string,
    currentCount: number,
  ): Promise<void> => {
    const msg: EntitlementMessage = {
      feature: "a 4th project",
      reason: "organize more than 3 projects with Pro",
    };
    const violation = capViolation(entUser, currentCount, FREE_LIMITS.projects, msg);
    if (violation) {
      throw {
        __entitlement: true,
        httpStatus: 402,
        message: `${violation.feature} is a Pro feature.`,
        feature: violation.feature,
        reason: violation.reason,
      };
    }
  };

  try {
    const result = await triageInboxItemCore(authEntities, {
      userId: user.id,
      inboxItemId,
      decision,
      // Core types lensId as a required string, but archive + delete don't
      // use it (they discard the item). Pass an empty string in that case so
      // the type holds; the core's assertLens guard skips the call for them.
      lensId: lensId ?? "",
      goalId: bodyString(req.body, "goalId"),
      projectId: bodyString(req.body, "projectId"),
      name: bodyString(req.body, "name"),
      priority: bodyString(req.body, "priority") as
        | "LOW"
        | "NORMAL"
        | "IMPORTANT"
        | undefined,
      size: bodyString(req.body, "size") as "S" | "M" | "L" | "XL" | undefined,
      content: bodyString(req.body, "content"),
      assertLens,
      assertProjectCap,
    });
    return res.status(200).json({ result });
  } catch (err) {
    // Entitlement-tagged rejections from the injected callbacks → their status.
    if (isEntitlementRejection(err)) {
      return res
        .status(err.httpStatus)
        .json({ error: err.message, feature: err.feature, reason: err.reason });
    }
    console.error("[cli/inbox/triage] failed:", err);
    // "Inbox item not found." / "Project not found." → 404; everything else 500.
    if (err instanceof Error && /not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: "Could not triage inbox item." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Project routes
// ───────────────────────────────────────────────────────────────────────────

// GET /api/cli/project/list — query ?lensId. Lens-scoped read (entitlement gate).
export const cliProjectList = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const entUser = toEntUser(user);
  const lensId = queryString(req, "lensId");
  if (!lensId) {
    return res.status(400).json({ error: "A lensId is required." });
  }
  const gate = await gateLens(entUser, user.id, lensId);
  if (gate.status === "not-found") {
    return res.status(404).json({ error: "No such lens for this account." });
  }
  if (gate.status === "denied") {
    return sendViolation(res, gate.msg);
  }
  try {
    const projects = await getProjectsData(authEntities, {
      userId: user.id,
      lensId,
    });
    return res.status(200).json({ projects });
  } catch (err) {
    console.error("[cli/project/list] failed:", err);
    return res.status(500).json({ error: "Could not load projects." });
  }
};

// GET /api/cli/project/show — query ?id (id-or-permalink). No lens guard (detail
// reads are unguarded; tenancy is the only check).
export const cliProjectShow = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = queryString(req, "id");
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }
  try {
    const project = await getProjectData(authEntities, { userId: user.id, id });
    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }
    return res.status(200).json({ project });
  } catch (err) {
    console.error("[cli/project/show] failed:", err);
    return res.status(500).json({ error: "Could not load project." });
  }
};

// POST /api/cli/project/create — body { name, lensId, goalId?, description? }.
// Entitlement: lens gate + the per-lens project cap (counted before create).
export const cliProjectCreate = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const entUser = toEntUser(user);
  const name = bodyString(req.body, "name");
  const lensId = bodyString(req.body, "lensId");
  if (!name || !lensId) {
    return res.status(400).json({ error: "name and lensId are required." });
  }
  const description = bodyString(req.body, "description");
  const goalId = bodyString(req.body, "goalId");

  const gate = await gateLens(entUser, user.id, lensId);
  if (gate.status === "not-found") {
    return res.status(404).json({ error: "No such lens for this account." });
  }
  if (gate.status === "denied") {
    return sendViolation(res, gate.msg);
  }
  // Per-lens project cap (FREE). Count non-done projects so finishing frees a
  // slot — same predicate createProject uses.
  const projectCount = await authEntities.Project.count({
    where: { userId: user.id, lensId, isDone: false },
  });
  const capMsg: EntitlementMessage = {
    feature: "a 4th project",
    reason: "organize more than 3 projects with Pro",
  };
  const capV = capViolation(entUser, projectCount, FREE_LIMITS.projects, capMsg);
  if (capV) {
    return sendViolation(res, capV);
  }

  try {
    const project = await createProjectCore(authEntities, {
      userId: user.id,
      name,
      lensId,
      goalId,
      description,
    });
    return res.status(201).json({ project });
  } catch (err) {
    console.error("[cli/project/create] failed:", err);
    return res.status(500).json({ error: "Could not create project." });
  }
};

// POST /api/cli/project/add-task — body { description, lensId, projectId?, goalId? }.
// The core resolves the parent's lens (projectId→its lens, else goalId→its
// lens, else the passed lensId) and accepts an `assertLens` callback that runs
// against the RESOLVED lens. We supply the callback so the core stays free of
// wasp/server.
export const cliProjectAddTask = async (
  req: Request,
  res: Response,
  _context: unknown,
) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const entUser = toEntUser(user);
  const description = bodyString(req.body, "description");
  const lensId = bodyString(req.body, "lensId");
  if (!description || !lensId) {
    return res.status(400).json({ error: "description and lensId are required." });
  }
  const projectId = bodyString(req.body, "projectId");
  const goalId = bodyString(req.body, "goalId");

  const assertLens = async (resolvedLensId: string): Promise<void> => {
    const gate = await gateLens(entUser, user.id, resolvedLensId);
    if (gate.status === "not-found") {
      throw {
        __entitlement: true,
        httpStatus: 404,
        message: "No such lens for this account.",
      };
    }
    if (gate.status === "denied") {
      throw {
        __entitlement: true,
        httpStatus: 402,
        message: `${gate.msg.feature} is a Pro feature.`,
        feature: gate.msg.feature,
        reason: gate.msg.reason,
      };
    }
  };

  try {
    const task = await createTaskCore(authEntities, {
      userId: user.id,
      description,
      lensId,
      projectId,
      goalId,
      assertLens,
    });
    return res.status(201).json({ task });
  } catch (err) {
    if (isEntitlementRejection(err)) {
      return res
        .status(err.httpStatus)
        .json({ error: err.message, feature: err.feature, reason: err.reason });
    }
    console.error("[cli/project/add-task] failed:", err);
    if (err instanceof Error && /not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: "Could not add task." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Resource routes — project-owned links and notes. Resources are not blobs;
// image attachments remain inbox-only capture data.
// ───────────────────────────────────────────────────────────────────────────
export const cliResourceList = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) return res.status(401).json({ error: "Not authenticated." });
  const projectId = queryString(req, "projectId");
  if (!projectId) return res.status(400).json({ error: "A projectId is required." });
  try {
    const project = await getProjectResourcesData(authEntities, { userId: user.id, projectId });
    return res.status(200).json({ projectId: project.id, resources: project.resources });
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) return res.status(404).json({ error: err.message });
    console.error("[cli/resource/list] failed:", err);
    return res.status(500).json({ error: "Could not load resources." });
  }
};

export const cliResourceCreate = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) return res.status(401).json({ error: "Not authenticated." });
  const projectId = bodyString(req.body, "projectId");
  const title = bodyString(req.body, "title");
  if (!projectId || !title) return res.status(400).json({ error: "projectId and title are required." });
  const project = await authEntities.Project.findFirst({ where: { id: projectId, userId: user.id }, select: { lensId: true } });
  if (!project) return res.status(404).json({ error: "Project not found." });
  const gate = await gateLens(toEntUser(user), user.id, project.lensId);
  if (gate.status === "denied") return sendViolation(res, gate.msg);
  try {
    const { resource } = await createResourceCore(authEntities, { userId: user.id, projectId, title, url: bodyString(req.body, "url"), notes: bodyString(req.body, "notes") });
    return res.status(201).json({ resource });
  } catch (err) {
    console.error("[cli/resource/create] failed:", err);
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not create resource." });
  }
};

export const cliResourceUpdate = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) return res.status(401).json({ error: "Not authenticated." });
  const id = bodyString(req.body, "id");
  if (!id) return res.status(400).json({ error: "An id is required." });
  try {
    const existing = await getResourceData(authEntities, { userId: user.id, id });
    const gate = await gateLens(toEntUser(user), user.id, existing.project.lensId);
    if (gate.status === "denied") return sendViolation(res, gate.msg);
    const { resource } = await updateResourceCore(authEntities, { userId: user.id, id, title: bodyString(req.body, "title"), url: bodyString(req.body, "url"), notes: bodyString(req.body, "notes") });
    return res.status(200).json({ resource });
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) return res.status(404).json({ error: err.message });
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not update resource." });
  }
};

export const cliResourceDelete = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) return res.status(401).json({ error: "Not authenticated." });
  const id = bodyString(req.body, "id");
  if (!id) return res.status(400).json({ error: "An id is required." });
  try {
    const existing = await getResourceData(authEntities, { userId: user.id, id });
    const gate = await gateLens(toEntUser(user), user.id, existing.project.lensId);
    if (gate.status === "denied") return sendViolation(res, gate.msg);
    const result = await deleteResourceCore(authEntities, { userId: user.id, id });
    return res.status(200).json({ id: result.id });
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) return res.status(404).json({ error: err.message });
    console.error("[cli/resource/delete] failed:", err);
    return res.status(500).json({ error: "Could not delete resource." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Goal routes
// ───────────────────────────────────────────────────────────────────────────

// GET /api/cli/goal/list — query ?lensId. Lens-scoped read (entitlement gate).
export const cliGoalList = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const entUser = toEntUser(user);
  const lensId = queryString(req, "lensId");
  if (!lensId) {
    return res.status(400).json({ error: "A lensId is required." });
  }
  const gate = await gateLens(entUser, user.id, lensId);
  if (gate.status === "not-found") {
    return res.status(404).json({ error: "No such lens for this account." });
  }
  if (gate.status === "denied") {
    return sendViolation(res, gate.msg);
  }
  try {
    const goals = await getGoalsData(authEntities, {
      userId: user.id,
      lensId,
    });
    return res.status(200).json({ goals });
  } catch (err) {
    console.error("[cli/goal/list] failed:", err);
    return res.status(500).json({ error: "Could not load goals." });
  }
};

// GET /api/cli/goal/show — query ?id (id-or-permalink). No lens guard (detail
// reads are unguarded).
export const cliGoalShow = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = queryString(req, "id");
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }
  try {
    const goal = await getGoalData(authEntities, { userId: user.id, id });
    if (!goal) {
      return res.status(404).json({ error: "Goal not found." });
    }
    return res.status(200).json({ goal });
  } catch (err) {
    console.error("[cli/goal/show] failed:", err);
    return res.status(500).json({ error: "Could not load goal." });
  }
};

// POST /api/cli/goal/create — body { name, lensId, description? }. Entitlement:
// lens gate + the per-lens goal cap.
export const cliGoalCreate = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const entUser = toEntUser(user);
  const name = bodyString(req.body, "name");
  const lensId = bodyString(req.body, "lensId");
  if (!name || !lensId) {
    return res.status(400).json({ error: "name and lensId are required." });
  }
  const description = bodyString(req.body, "description");

  const gate = await gateLens(entUser, user.id, lensId);
  if (gate.status === "not-found") {
    return res.status(404).json({ error: "No such lens for this account." });
  }
  if (gate.status === "denied") {
    return sendViolation(res, gate.msg);
  }
  const goalCount = await authEntities.Goal.count({
    where: { userId: user.id, lensId, isDone: false },
  });
  const capMsg: EntitlementMessage = {
    feature: "a 2nd goal",
    reason: "link work to more than one outcome with Pro",
  };
  const capV = capViolation(entUser, goalCount, FREE_LIMITS.goals, capMsg);
  if (capV) {
    return sendViolation(res, capV);
  }

  try {
    const goal = await createGoalCore(authEntities, {
      userId: user.id,
      name,
      lensId,
      description,
    });
    return res.status(201).json({ goal });
  } catch (err) {
    console.error("[cli/goal/create] failed:", err);
    return res.status(500).json({ error: "Could not create goal." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Lens routes
// ───────────────────────────────────────────────────────────────────────────

// GET /api/cli/lens/list — every lens the user owns, with per-lens counts. No
// entitlement gate: listing owned lenses is always allowed (matches the web
// Settings Lenses tab); gating fires on *use* (lens-scoped reads/writes), not
// on the listing itself. The active-lens decision lives client-side (the web
// app stores it in localStorage; the CLI stores it in ~/.config/actionamp).
export const cliLensList = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const lenses = await getLensesCore(authEntities, { userId: user.id });
    return res.status(200).json({ lenses });
  } catch (err) {
    console.error("[cli/lens/list] failed:", err);
    return res.status(500).json({ error: "Could not load lenses." });
  }
};

// GET /api/cli/lens/show — query ?idOrName (id OR name). No lens guard (detail
// reads are unguarded; tenancy is the only check — a FREE user may own a
// WORK lens seeded before a downgrade and we never block reads of owned data).
// Resolving by name lets `lens switch Work` work without a uuid copy-paste.
export const cliLensShow = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const idOrName = queryString(req, "idOrName");
  if (!idOrName) {
    return res.status(400).json({ error: "An idOrName is required." });
  }
  try {
    const lens = await getLensCore(authEntities, { userId: user.id, idOrName });
    if (!lens) {
      return res.status(404).json({ error: "Lens not found." });
    }
    return res.status(200).json({ lens });
  } catch (err) {
    console.error("[cli/lens/show] failed:", err);
    return res.status(500).json({ error: "Could not load lens." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Logbook route
// ───────────────────────────────────────────────────────────────────────────

// GET /api/cli/logbook — query ?lensId (optional). If lensId, entitlement gate;
// else global (no lensId means "skip the tasks/projects/goals lens filter" —
// the core still takes a lensId, so with no lens we resolve the first
// accessible lens for the scoped queries; archived inbox items are universal).
export const cliLogbook = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const entUser = toEntUser(user);
  const requestedLensId = queryString(req, "lensId");

  let lensId: string;
  if (requestedLensId) {
    const gate = await gateLens(entUser, user.id, requestedLensId);
    if (gate.status === "not-found") {
      return res.status(404).json({ error: "No such lens for this account." });
    }
    if (gate.status === "denied") {
      return sendViolation(res, gate.msg);
    }
    lensId = requestedLensId;
  } else {
    // No lens specified: default to the first accessible lens (the web Logbook
    // is lens-scoped, so we pick the user's default rather than mixing lenses).
    const accessible = await resolveAccessibleLenses(authEntities, entUser, user.id);
    const first = accessible[0];
    if (!first) {
      // No accessible lenses — return an empty logbook rather than 404 (the
      // user exists, there's just nothing to read).
      return res.status(200).json({ tasks: [], projects: [], goals: [], archived: [] });
    }
    lensId = first.id;
  }

  try {
    const logbook = await getLogbookData(authEntities, {
      userId: user.id,
      lensId,
    });
    return res.status(200).json(logbook);
  } catch (err) {
    console.error("[cli/logbook] failed:", err);
    return res.status(500).json({ error: "Could not load logbook." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Feedback routes — admin-only triage surface (list / show / update status).
//
// Every feedback route gates on `user.isAdmin` FIRST (before any DB work): the
// feedback feature is fire-and-forget for users; only admins read + triage it.
// `req.patUser.isAdmin` is resolved by `patAuthMiddleware` from the User row.
// A non-admin token gets 403 regardless of which feedback id it asks for — no
// information leak about whether a given id exists.
// ───────────────────────────────────────────────────────────────────────────

/** Shared admin gate. Returns the 403 response if the caller is not an admin. */
function requireAdmin(
  user: { isAdmin: boolean } | undefined,
  res: Response,
): res is Response {
  if (!user) {
    res.status(401).json({ error: "Not authenticated." });
    return false;
  }
  if (!user.isAdmin) {
    res.status(403).json({ error: "Admin only." });
    return false;
  }
  return true;
}

// GET /api/cli/feedback/list — list feedback, newest first. Optional ?status=
// narrows to one bucket; ?limit= caps the page (positive int) or "all" for
// unbounded. Absent limit → unbounded (the CLI sends its own default of 10).
export const cliFeedbackList = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!requireAdmin(user, res)) return;

  const statusParam = queryString(req, "status");
  let status: FeedbackStatus | undefined;
  if (statusParam !== null) {
    if (!isFeedbackStatus(statusParam)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${FEEDBACK_STATUSES.join(", ")}.`,
      });
    }
    status = statusParam;
  }

  // limit: "all" (or absent) → unbounded; a positive integer → cap. The CLI
  // sends its own default (10) when the user passes nothing, so absence here
  // only happens on an explicit --limit all or a direct API call.
  const limitRaw = queryString(req, "limit");
  let limit: number | undefined;
  if (limitRaw !== null && limitRaw !== "all") {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: "limit must be a positive number or 'all'." });
    }
    limit = Math.floor(n);
  }

  try {
    const feedback = await listFeedbackCore(authEntities, { status, limit });
    return res.status(200).json({ feedback });
  } catch (err) {
    console.error("[cli/feedback/list] failed:", err);
    return res.status(500).json({ error: "Could not list feedback." });
  }
};

// GET /api/cli/feedback/show?id= — single feedback row. 404 when absent.
export const cliFeedbackShow = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!requireAdmin(user, res)) return;

  const id = queryString(req, "id");
  if (!id) {
    return res.status(400).json({ error: "id is required." });
  }

  try {
    const feedback = await showFeedbackCore(authEntities, { id });
    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found." });
    }
    return res.status(200).json({ feedback });
  } catch (err) {
    console.error("[cli/feedback/show] failed:", err);
    return res.status(500).json({ error: "Could not load feedback." });
  }
};

// POST /api/cli/feedback/status — body { id, status }. Updates the triage state.
export const cliFeedbackStatus = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!requireAdmin(user, res)) return;

  const id = bodyString(req.body, "id");
  if (!id) {
    return res.status(400).json({ error: "id is required." });
  }
  const status = bodyString(req.body, "status");
  if (!status) {
    return res
      .status(400)
      .json({ error: `status is required. One of: ${FEEDBACK_STATUSES.join(", ")}.` });
  }
  if (!isFeedbackStatus(status)) {
    return res
      .status(400)
      .json({ error: `Invalid status. Must be one of: ${FEEDBACK_STATUSES.join(", ")}.` });
  }

  try {
    const feedback = await updateFeedbackStatusCore(authEntities, { id, status });
    return res.status(200).json({ feedback });
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    console.error("[cli/feedback/status] failed:", err);
    return res.status(500).json({ error: "Could not update feedback status." });
  }
};

// POST /api/cli/feedback/delete — body { id }. Soft-deletes the row (sets
// deletedAt; every read core filters deletedAt: null). Idempotent on the
// server — the core re-stamps deletedAt if already deleted. Mirrors the
// status route's shape so the CLI reuses the same error mapping.
export const cliFeedbackDelete = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!requireAdmin(user, res)) return;

  const id = bodyString(req.body, "id");
  if (!id) {
    return res.status(400).json({ error: "id is required." });
  }

  try {
    const feedback = await deleteFeedbackCore(authEntities, { id });
    return res.status(200).json({ feedback });
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    console.error("[cli/feedback/delete] failed:", err);
    return res.status(500).json({ error: "Could not delete feedback." });
  }
};

// ----------------------------------------------------------------
// Admin dashboard stats + recent feedback (admin-cli consumers)
// ----------------------------------------------------------------
// Mirrors the feedback routes: requireAdmin first, then delegate to the shared
// core. No business logic in the route — pure passthrough. The browser page
// uses the Wasp query (same core); these routes serve actionamp-admin stats.
export const cliAdminStats = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!requireAdmin(user, res)) return;
  try {
    const rawRange = queryString(req, "range");
    const range: FunnelRange = rawRange === "7d" || rawRange === "all" ? rawRange : "30d";
    const stats = await getAdminStatsCore(authEntities, range);
    return res.status(200).json({ stats });
  } catch (err) {
    console.error("[cli/admin/stats] failed:", err);
    return res.status(500).json({ error: "Could not load admin stats." });
  }
};

export const cliAdminGrowth = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!requireAdmin(user, res)) return;
  try {
    const rawRange = queryString(req, "range");
    const range: FunnelRange = rawRange === "7d" || rawRange === "all" ? rawRange : "30d";
    const funnel = await getFunnelStatsCore(authEntities, range);
    return res.status(200).json(funnel);
  } catch (err) {
    console.error("[cli/admin/growth] failed:", err);
    return res.status(500).json({ error: "Could not load growth funnel." });
  }
};

export const cliAdminFeedback = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!requireAdmin(user, res)) return;
  const afterId = queryString(req, "after");
  const limitRaw = Number(queryString(req, "limit") ?? "10");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 10;
  try {
    const page = await getRecentFeedbackCore(authEntities, {
      afterId: afterId ?? null,
      limit,
    });
    return res.status(200).json(page);
  } catch (err) {
    console.error("[cli/admin/feedback] failed:", err);
    return res.status(500).json({ error: "Could not load recent feedback." });
  }
};

// Exported for tests + the CLI client (Phase 1) to reference the token format.
