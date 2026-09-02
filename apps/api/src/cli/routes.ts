/**
 * S18 — the CLI REST surface: the NON-admin `/api/cli/*` routes + the
 * session-authed `/api/pat/*` token-management trio, ported 1:1 from
 * `webapp/src/auth/patRoutes.ts` (Hono instead of Express handlers).
 *
 * Coordination (per the s18 dispatch): the SEVEN admin-gated routes
 * (/api/cli/feedback/* + /api/cli/admin/*) live in `../cli-routes.ts`
 * (S17's createCliRest, over the @actionamp/domain/{feedback,admin} cores);
 * this file deliberately does not define them. The conformance suite mounts
 * both sub-apps so the whole 34-route table is verified in one place.
 *
 * The bar this file is verified against: `packages/contract/src/s18-cli-routes/README.md`
 * — both CLIs (`cli/`, `admin-cli/`) run UNCHANGED and their `--json` output is
 * `JSON.stringify(server body)` verbatim, so every envelope's field names,
 * nesting, null-ness, and key order must match the webapp byte for byte.
 *
 * Handler shape (mirroring the webapp's, top to bottom):
 *   1. Read the PAT-resolved user (401 defensive — the middleware already
 *      rejects bad tokens; 401-first ordering before any input parsing).
 *   2. Build `entUser` (the account access slice the entitlement helpers read).
 *   3. Lens-scoped routes: resolve via gateLens (tenancy 404 → FREE 402) using
 *      the PURE billing helpers; a non-null violation → 402 `{error, feature,
 *      reason}`.
 *   4. Delegate to the domain cores (`@actionamp/domain/*`) — the same pure
 *      cores the /rpc procedures use.
 *
 * Transport contract (P0 §0): Bearer-only PAT auth (a session cookie must
 * never satisfy a CLI route — patRouteMiddleware deletes the cookie middlewares),
 * the 402 CLI gate before every handler (a token dies the moment a plan ends),
 * `ApiKey.lastUsedAt` stamped fire-and-forget, OPTIONS → 204.
 */
import { Hono, type Context } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type { DomainDb, Entities } from "@actionamp/domain/db";
import {
  apiKey as apiKeyTable,
  resource as resourceTable,
  resourceAttachment as resourceAttachmentTable,
} from "@actionamp/domain/db";
import {
  resolveAccessibleLenses,
  capViolation,
  cliAccessViolation,
  WORK_LENS_MESSAGE,
  type EntitlementMessage,
  type EntitlementUser,
} from "@actionamp/domain/billing";
import { FREE_LIMITS } from "@actionamp/domain/billing";
import { plainDateFrom, plainDateToDb } from "@actionamp/domain/shared/time";
import {
  getTaskData,
  getTodayTasksData,
  getDoneTodayData,
  getTopTaskData,
  hydrateTopTaskData,
  toggleTaskDoneCore,
  snoozeTaskCore,
  updateTaskStatusCore,
  startTaskCore,
  pauseTaskCore,
} from "@actionamp/domain/tasks";
import {
  createInboxItemCore,
  getInboxItemsCore,
  triageInboxItemCore,
} from "@actionamp/domain/inbox";
import {
  createListItemCore,
  createSimpleListEntities,
} from "@actionamp/domain/simpleLists";
import {
  getProjectsData,
  getProjectData,
  createProjectCore,
  createTaskCore,
} from "@actionamp/domain/projects";
import {
  getGoalsData,
  getGoalData,
  createGoalCore,
} from "@actionamp/domain/goals";
import { getLensesCore, getLensCore } from "@actionamp/domain/lenses";
import { getLogbookData } from "@actionamp/domain/logbook";
import {
  createResourceCore,
  deleteResourceCore,
  getProjectResourcesData,
  getResourceData,
  updateResourceCore,
} from "@actionamp/domain/resources";
// F10 auth — session resolution for the /api/pat/* trio + the PAT validator
// (Bearer-only resolve with the exact webapp middleware error bodies).
import {
  drizzlePatLookupPort,
  generatePat as generateToken,
  hashToken,
  validatePat,
} from "../auth/pat.js";
import type { PatUser } from "../auth/pat.js";
import {
  drizzleSessionAuthPort,
  type SessionUser,
} from "../auth/session.js";
import { resolveActingUser } from "../auth/resolve.js";
// S18 route-local ports (see the per-module headers for provenance).
import {
  InvalidCliField,
  firstAccessibleLensId,
  gateLens,
  isCliAttachment,
  isEntitlementRejection,
  lensGateResponse,
  parseBody,
  queryString,
  readPriority,
  readSize,
  taskWriteErrorResponse,
  toEntUser,
  bodyString,
  violationBody,
  TRIAGE_DECISIONS,
  isTriageDecision,
  type CliAttachment,
  type CliUser,
  type EntitlementRejection,
  type Json,
} from "./gates.js";
import { buildNowContext } from "./nowContext.js";
import { attachmentHeaders, findOwnedAttachment, isAttachmentId } from "./attachments.js";
import {
  buildReviewReport,
  getReviewData,
  localDateFor,
  shiftReviewDate,
} from "./reviews.js";
/** Hono env — the PAT-resolved user rides c.var.patUser. */
type CliEnv = { Variables: { patUser: CliUser } };

export function createCliRoutes(deps: {
  db: DomainDb;
  entities: Entities;
}): Hono<CliEnv> {
  const rest = new Hono<CliEnv>();
  const { db, entities } = deps;

  // ─────────────────────────────────────────────────────────────────────────
  // PAT middleware — the patRouteMiddleware port. OPTIONS → 204 (preflight
  // re-auths on the real request); Bearer parse + resolve + 402 CLI gate via
  // F10b's validatePat (exact webapp middleware bodies); lastUsedAt stamped
  // inside the resolver, fire-and-forget.
  // ─────────────────────────────────────────────────────────────────────────
  rest.use("/api/cli/*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }
    let resolution;
    try {
      resolution = await validatePat(db, c.req.header("authorization"));
    } catch (err) {
      // Never leak internals via the auth path; log + 500.
      console.error("[pat] token lookup failed:", err);
      return c.json({ error: "Token lookup failed." }, 500);
    }
    if (!resolution.ok) {
      return c.json(resolution.body, resolution.status);
    }
    c.set("patUser", resolution.user);
    await next();
  });

  /** The resolved PAT user (set by the middleware above). */
  function patUser(c: Context<CliEnv>): CliUser | undefined {
    return c.get("patUser");
  }

  /** Defensive 401 — every handler checks before touching input (401-first). */
  function requirePat(c: Context<CliEnv>): CliUser | Response {
    const user = patUser(c);
    if (!user) return c.json({ error: "Not authenticated." }, 401);
    return user;
  }

  /** The session-auth gate for /api/pat/* — resolves like the webapp's
   *  auth:true routes (cookie/Bearer session via F10; PATs ride the same
   *  resolver). Returns the user or an error Response. */
  async function requireSession(
    c: Context,
  ): Promise<SessionUser | PatUser | Response> {
    const resolution = await resolveActingUser(
      { sessionPort: drizzleSessionAuthPort(db), patPort: drizzlePatLookupPort(db) },
      {
        method: c.req.method,
        authorization: c.req.header("authorization"),
        cookie: c.req.header("cookie"),
        requestedWith: c.req.header("x-requested-with"),
        actionAmpApi: c.req.header("x-actionamp-api"),
      },
    );
    if (resolution.kind === "reject") {
      return c.json(resolution.body, resolution.status);
    }
    if (resolution.kind !== "authenticated") {
      return c.json({ error: "Not authenticated." }, 401);
    }
    return resolution.user;
  }

  /** The entitlement slice both session + PAT user shapes satisfy. */
  function asEntUser(u: SessionUser | PatUser): EntitlementUser {
    return {
      plan: u.plan,
      planRenewsAt: u.planRenewsAt,
      isAdmin: u.isAdmin,
      manualAccessGrant: u.manualAccessGrant,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // /api/pat/* — session-authed token management (Settings UI). Body/query
  // semantics identical to the webapp handlers.
  // ─────────────────────────────────────────────────────────────────────────

  // POST /api/pat/issue — body { label }. Returns plaintext once.
  rest.post("/api/pat/issue", async (c) => {
    const user = await requireSession(c);
    if (user instanceof Response) return user;
    const cliViolation = cliAccessViolation(asEntUser(user));
    if (cliViolation) {
      return c.json(violationBody(cliViolation), 402);
    }
    const body = await parseBody(c.req.raw);
    const label = bodyString(body, "label")?.trim().slice(0, 80) ?? "";
    if (!label) {
      return c.json({ error: "A label is required." }, 400);
    }

    const plaintext = generateToken();
    const hashedToken = hashToken(plaintext);
    const created = await db
      .insert(apiKeyTable)
      .values({ id: crypto.randomUUID(), hashedToken, label, userId: user.id })
      .returning({
        id: apiKeyTable.id,
        label: apiKeyTable.label,
        createdAt: apiKeyTable.createdAt,
      });

    // Plaintext returned exactly once. The DB row only has the hash; the client
    // is responsible for storing/copying the plaintext now or never.
    return c.json(
      {
        token: plaintext,
        id: created[0].id,
        label: created[0].label,
        createdAt: created[0].createdAt,
        // Friendly reminder for the UI to show next to the copy button.
        notice: "This token won't be shown again. Copy it now.",
      },
      201,
    );
  });

  // POST /api/pat/revoke — body { id }. Tenancy-safe delete.
  rest.post("/api/pat/revoke", async (c) => {
    const user = await requireSession(c);
    if (user instanceof Response) return user;
    const body = await parseBody(c.req.raw);
    const id = bodyString(body, "id") ?? null;
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }

    // Tenancy check: find first constrained to this user, then delete by id.
    const owned = await db
      .select({ id: apiKeyTable.id })
      .from(apiKeyTable)
      .where(and(eq(apiKeyTable.id, id), eq(apiKeyTable.userId, user.id)))
      .limit(1);
    if (!owned[0]) {
      return c.json({ error: "No such token for this account." }, 404);
    }
    await db.delete(apiKeyTable).where(eq(apiKeyTable.id, owned[0].id));
    return c.json({ revoked: true, id: owned[0].id });
  });

  // GET /api/pat/list — the user's keys, never the hash. createdAt desc.
  rest.get("/api/pat/list", async (c) => {
    const user = await requireSession(c);
    if (user instanceof Response) return user;
    const keys = await db
      .select({
        id: apiKeyTable.id,
        label: apiKeyTable.label,
        createdAt: apiKeyTable.createdAt,
        lastUsedAt: apiKeyTable.lastUsedAt,
      })
      .from(apiKeyTable)
      .where(eq(apiKeyTable.userId, user.id))
      .orderBy(desc(apiKeyTable.createdAt));
    return c.json({ keys });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/cli/whoami — the resolved user (login validation + admin gate).
  // ─────────────────────────────────────────────────────────────────────────
  rest.get("/api/cli/whoami", (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    return c.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        plan: user.plan,
        // isAdmin is resolved by the PAT middleware from the User row. Surfaced
        // here so the admin CLI can gate login on it (the user CLI ignores it).
        isAdmin: user.isAdmin,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/cli/now — the user's top task. Lens resolution + the FREE-lens
  // entitlement gate stay in the route; the candidate pool + ranking live in
  // `getTopTaskData`; the winner is hydrated then `context` is built
  // server-side (focus-goal-context). Vanished row → `no-candidates`.
  // ─────────────────────────────────────────────────────────────────────────
  rest.get("/api/cli/now", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);

    try {
      const requestedLensId = queryString(c.req.raw, "lensId");
      let lensId: string | null;

      if (requestedLensId) {
        // Explicit lens: tenancy lookup + FREE-lens rule. 404 for not-owned
        // keeps "no such lens" indistinguishable from "exists but not yours".
        const gate = await gateLens(entities, entUser, user.id, requestedLensId);
        const gateRes = lensGateResponse(c, gate);
        if (gateRes) return gateRes;
        lensId = requestedLensId;
      } else {
        // No lens specified: default to the user's first *accessible* lens.
        // resolveAccessibleLenses already applies the entitlement filter
        // (FREE → PERSONAL-only), so the default can never land on a gated
        // lens — matching the web app's behavior where a FREE user lands on Me.
        lensId = await firstAccessibleLensId(entities, entUser, user.id);
      }

      if (!lensId) {
        // No accessible lenses at all — the user hasn't completed onboarding.
        return c.json({ task: null, context: null, reason: "no-lens" });
      }

      // Candidate pool + ranking live in the pure core: activePoolWhere
      // (including the snooze guard) + the priority/size/age comparator.
      const top = await getTopTaskData(entities, {
        userId: user.id,
        lensId,
      });

      if (!top) {
        return c.json({ task: null, context: null, reason: "no-candidates" });
      }

      // Hydrate the owned winner (Project→Goal + sessions + NOTE updates) and
      // build the additive `context` server-side. If the row vanished between
      // ranking and hydration, return null task + null context.
      const hydrated = await hydrateTopTaskData(entities, {
        userId: user.id,
        id: top.id,
      });
      if (!hydrated) {
        return c.json({ task: null, context: null, reason: "no-candidates" });
      }
      const context = buildNowContext(hydrated, hydrated.project);
      return c.json({ task: top, context });
    } catch (err) {
      console.error("[cli/now] failed:", err);
      return c.json({ error: "Could not resolve top task." }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/cli/capture — quick-capture to inbox (or a Simple list via
  // listId). Inbox is universal (not lens-scoped) → no entitlement gate.
  // ─────────────────────────────────────────────────────────────────────────
  rest.post("/api/cli/capture", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;

    const body = await parseBody(c.req.raw);
    const text = bodyString(body, "text")?.trim() ?? "";
    if (!text) {
      return c.json({ error: "Capture text is required." }, 400);
    }
    const projectName = bodyString(body, "projectName");
    const projectId = bodyString(body, "projectId");
    const listId = bodyString(body, "listId");
    if (projectId && listId) {
      return c.json({ error: "Choose either projectId or listId, not both." }, 400);
    }
    const rawAttachments: unknown = body.attachments;
    const attachments = Array.isArray(rawAttachments)
      ? rawAttachments.filter((a: Json): a is CliAttachment => isCliAttachment(a))
      : undefined;
    if (
      Array.isArray(rawAttachments) &&
      attachments?.length !== rawAttachments.length
    ) {
      return c.json(
        { error: "Attachments must include filename, mimeType, and dataBase64." },
        400,
      );
    }

    try {
      if (listId) {
        // listId identifies a Simple-list PROJECT (lists moved from Lens type
        // to Project type). Entitlement gates on the project's lens.
        const listProject = await entities.Project.findFirst({
          where: { id: listId, userId: user.id },
          select: { id: true, type: true, lensId: true },
        });
        if (!listProject) {
          return c.json({ error: "No such list for this account." }, 404);
        }
        if (listProject.type !== "SIMPLE_LIST") {
          return c.json({ error: "listId must identify a Simple list." }, 400);
        }
        const gate = await gateLens(entities, toEntUser(user), user.id, listProject.lensId);
        if (gate.status === "denied") {
          return c.json(violationBody(gate.msg), 402);
        }
        const created = await createListItemCore(createSimpleListEntities(db), {
          userId: user.id,
          projectId: listProject.id,
          text,
          content: bodyString(body, "content"),
          sourceUrl: bodyString(body, "sourceUrl"),
          attachments,
        });
        return c.json({ ok: true, kind: "list-item", ...created }, 201);
      }
      const created = await createInboxItemCore(entities, {
        userId: user.id,
        text,
        projectName,
        projectId,
        title: bodyString(body, "title"),
        content: bodyString(body, "content"),
        sourceUrl: bodyString(body, "sourceUrl"),
        attachments,
      });
      return c.json({ ok: true, kind: "inbox-item", ...created }, 201);
    } catch (err) {
      console.error("[cli/capture] failed:", err);
      return c.json(
        { error: err instanceof Error ? err.message : "Could not capture." },
        400,
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Task routes
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/cli/task/show — detail read. No lens guard (detail reads are
  // unguarded; tenancy is the only check, enforced by the core's
  // findFirst({ userId, OR:[{id},{permalink:id}] })).
  rest.get("/api/cli/task/show", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const id = queryString(c.req.raw, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    try {
      const task = await getTaskData(entities, { userId: user.id, id });
      if (!task) {
        return c.json({ error: "Task not found." }, 404);
      }
      return c.json({ task });
    } catch (err) {
      console.error("[cli/task/show] failed:", err);
      return c.json({ error: "Could not load task." }, 500);
    }
  });

  // POST /api/cli/task/start — body { id }. Returns { id, startedAt }.
  rest.post("/api/cli/task/start", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const body = await parseBody(c.req.raw);
    const id = bodyString(body, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    try {
      const prefs = await entities.User.findUnique({ where: { id: user.id } });
      const result = await startTaskCore(entities, {
        userId: user.id,
        id,
        focusSessionMinutes: prefs?.focusSessionMinutes === 45 ? 45 : 25,
      });
      return c.json(result);
    } catch (err) {
      return taskWriteErrorResponse(c, err, "start");
    }
  });

  // POST /api/cli/task/pause — body { id }. Returns { id, startedAt }.
  rest.post("/api/cli/task/pause", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const body = await parseBody(c.req.raw);
    const id = bodyString(body, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    try {
      const result = await pauseTaskCore(entities, { userId: user.id, id });
      return c.json(result);
    } catch (err) {
      return taskWriteErrorResponse(c, err, "pause");
    }
  });

  // POST /api/cli/task/done — body { id, outcome? }. Returns the updated task.
  rest.post("/api/cli/task/done", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const body = await parseBody(c.req.raw);
    const id = bodyString(body, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    const outcome = bodyString(body, "outcome");
    try {
      const task = await toggleTaskDoneCore(entities, {
        userId: user.id,
        id,
        outcome,
      });
      return c.json({ task });
    } catch (err) {
      return taskWriteErrorResponse(c, err, "toggle");
    }
  });

  // POST /api/cli/task/snooze — body { id, preset }. Returns the snooze instant.
  rest.post("/api/cli/task/snooze", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const body = await parseBody(c.req.raw);
    const id = bodyString(body, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    const preset = bodyString(body, "preset");
    if (
      preset !== "1h" &&
      preset !== "3h" &&
      preset !== "tomorrow" &&
      preset !== "weekend" &&
      preset !== "someday"
    ) {
      return c.json({ error: "Invalid snooze preset." }, 400);
    }
    try {
      const preferences = await entities.User.findUnique({ where: { id: user.id } });
      const result = await snoozeTaskCore(entities, {
        userId: user.id,
        id,
        preset,
        timeZone: preferences?.timeZone ?? "UTC",
      });
      return c.json(result);
    } catch (err) {
      return taskWriteErrorResponse(c, err, "snooze");
    }
  });

  // POST /api/cli/task/move — body { id, status, scheduledDate? }.
  rest.post("/api/cli/task/move", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const body = await parseBody(c.req.raw);
    const id = bodyString(body, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    const status = bodyString(body, "status");
    if (status !== "TODAY" && status !== "UPCOMING" && status !== "SOMEDAY") {
      return c.json({ error: "Invalid status." }, 400);
    }
    const scheduledDateRaw = bodyString(body, "scheduledDate");
    let scheduledDate: Date | undefined;
    try {
      scheduledDate = scheduledDateRaw
        ? plainDateToDb(plainDateFrom(scheduledDateRaw))
        : undefined;
    } catch {
      return c.json({ error: "scheduledDate must use YYYY-MM-DD." }, 400);
    }
    try {
      const preferences = await entities.User.findUnique({ where: { id: user.id } });
      const task = await updateTaskStatusCore(entities, {
        userId: user.id,
        id,
        status,
        scheduledDate,
        timeZone: preferences?.timeZone ?? "UTC",
      });
      return c.json({ task });
    } catch (err) {
      return taskWriteErrorResponse(c, err, "move");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Today routes — global, filtered by the accessible-lens SET
  // (resolveAccessibleLenses), the entitlement gate for global Today.
  // ─────────────────────────────────────────────────────────────────────────

  rest.get("/api/cli/today", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);
    try {
      const tasks = await getTodayTasksData(entities, {
        user: entUser,
        userId: user.id,
      });
      return c.json({ tasks });
    } catch (err) {
      console.error("[cli/today] failed:", err);
      return c.json({ error: "Could not load today." }, 500);
    }
  });

  rest.get("/api/cli/today/done", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);
    try {
      const accessible = await resolveAccessibleLenses(entities, entUser, user.id);
      const lensIds = accessible.map((l) => l.id);
      const tasks = await getDoneTodayData(entities, {
        userId: user.id,
        lensIds,
      });
      return c.json({ tasks });
    } catch (err) {
      console.error("[cli/today/done] failed:", err);
      return c.json({ error: "Could not load done-today." }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Inbox routes
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/cli/inbox/list — unprocessed inbox items (newest first).
  rest.get("/api/cli/inbox/list", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    try {
      const raw = await getInboxItemsCore(entities, { userId: user.id });
      // Project to the core's exact select shape — the seam's row is wider
      // (select is advisory), and the CLI prints the body verbatim, so extra
      // keys would break --json byte parity with Wasp.
      const items = raw.map((it) => ({
        id: it.id,
        text: it.text,
        title: it.title,
        content: it.content,
        sourceUrl: it.sourceUrl,
        attachments: it.attachments,
        createdAt: it.createdAt,
        parsedScheduledDate: it.parsedScheduledDate,
        parsedSnoozedUntil: it.parsedSnoozedUntil,
        parsedPriority: it.parsedPriority,
        parsedSize: it.parsedSize,
        parsedTags: it.parsedTags,
        parsedProject: it.parsedProject,
        parsedLens: it.parsedLens,
        parsedProjectId: it.parsedProjectId,
        parsedLensId: it.parsedLensId,
      }));
      return c.json({ items });
    } catch (err) {
      console.error("[cli/inbox/list] failed:", err);
      return c.json({ error: "Could not load inbox." }, 500);
    }
  });

  // POST /api/cli/inbox/triage — the core expects two injected entitlement
  // callbacks (assertLens / assertProjectCap). We build them from the PURE
  // helpers; the callbacks THROW a tagged rejection the catch translates to
  // its HTTP status (a custom tag avoids colliding with the core's own
  // "not found" Errors, which map to 404).
  rest.post("/api/cli/inbox/triage", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);
    const body = await parseBody(c.req.raw);
    const inboxItemId = bodyString(body, "inboxItemId");
    const decisionRaw = bodyString(body, "decision");
    if (!inboxItemId || !decisionRaw) {
      return c.json({ error: "inboxItemId and decision are required." }, 400);
    }
    if (!isTriageDecision(decisionRaw)) {
      return c.json(
        {
          error: `decision must be one of: ${TRIAGE_DECISIONS.join(", ")}.`,
        },
        400,
      );
    }
    const decision = decisionRaw;
    const lensId = bodyString(body, "lensId");
    const projectId = bodyString(body, "projectId");
    // Archive + delete discard the item — neither files into a lens, so lensId
    // is optional for them. list-item files into a Simple-list PROJECT, so it
    // needs projectId instead. Every other decision (task/project/resource)
    // needs a lens to file into.
    const lensOptional =
      decision === "archive" || decision === "delete" || decision === "list-item";
    if (!lensOptional && !lensId) {
      return c.json(
        { error: `lensId is required for the "${decision}" decision.` },
        400,
      );
    }
    if (decision === "list-item" && !projectId) {
      return c.json(
        {
          error:
            'projectId (a Simple list) is required for the "list-item" decision.',
        },
        400,
      );
    }

    // assertLens: resolve the lens (tenancy-safe) and check the FREE-lens rule.
    const assertLens = async (resolvedLensId: string): Promise<void> => {
      const gate = await gateLens(
        entities,
        entUser,
        user.id,
        resolvedLensId,
        WORK_LENS_MESSAGE,
      );
      if (gate.status === "not-found") {
        // The core resolved a lens that doesn't belong to the user — treat as
        // 404 so the CLI surfaces "not found" rather than a silent 402.
        throw {
          __entitlement: true,
          httpStatus: 404,
          message: "No such lens for this account.",
        } satisfies EntitlementRejection;
      }
      if (gate.status === "denied") {
        throw {
          __entitlement: true,
          httpStatus: 402,
          message: `${gate.msg.feature} is a Pro feature.`,
          feature: gate.msg.feature,
          reason: gate.msg.reason,
        } satisfies EntitlementRejection;
      }
    };

    // assertProjectCap: check the per-lens FREE project cap. The core computes
    // the current count and hands it to us; we decide.
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
        } satisfies EntitlementRejection;
      }
    };

    try {
      const result = await triageInboxItemCore(entities, {
        userId: user.id,
        inboxItemId,
        decision,
        // lensId is unused by archive/delete (they discard the item) and by
        // list-item (it files into projectId). The core's assertLens guard
        // skips the call for those decisions.
        lensId,
        goalId: bodyString(body, "goalId"),
        projectId,
        name: bodyString(body, "name"),
        priority: readPriority(body),
        size: readSize(body),
        content: bodyString(body, "content"),
        assertLens,
        assertProjectCap,
      });
      return c.json({ result });
    } catch (err) {
      // Boundary validation (readPriority / readSize) → 400.
      if (err instanceof InvalidCliField) {
        return c.json({ error: err.message }, 400);
      }
      // Entitlement-tagged rejections from the injected callbacks → their status.
      if (isEntitlementRejection(err)) {
        return c.json(
          { error: err.message, feature: err.feature, reason: err.reason },
          err.httpStatus,
        );
      }
      console.error("[cli/inbox/triage] failed:", err);
      // "Inbox item not found." / "Project not found." → 404; everything else 500.
      if (err instanceof Error && /not found/i.test(err.message)) {
        return c.json({ error: err.message }, 404);
      }
      return c.json({ error: "Could not triage inbox item." }, 500);
    }
  });

  // GET /api/cli/attachment/:id — download a captured image by attachment id.
  rest.get("/api/cli/attachment/:id", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const id = c.req.param("id");
    if (!isAttachmentId(id)) {
      return c.json({ error: "Not found." }, 404);
    }
    try {
      const record = await findOwnedAttachment(db, {
        id,
        userId: user.id,
      });
      if (!record) {
        return c.json({ error: "Not found." }, 404);
      }
      const headers = attachmentHeaders(record);
      if (!headers) {
        // Non-image mime → 404 (every write path validates image/*; a stale or
        // forged row must never be served as executable content).
        return c.json({ error: "Not found." }, 404);
      }
      for (const [name, value] of Object.entries(headers)) {
        c.header(name, value);
      }
      return c.body(new Uint8Array(record.data), 200);
    } catch (err) {
      console.error("[cli/attachment] failed:", err);
      return c.json({ error: "Could not load the image." }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Project routes
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/cli/project/list — query ?lensId. Lens-scoped read (entitlement gate).
  rest.get("/api/cli/project/list", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);
    const lensId = queryString(c.req.raw, "lensId");
    if (!lensId) {
      return c.json({ error: "A lensId is required." }, 400);
    }
    const gate = await gateLens(entities, entUser, user.id, lensId);
    const gateRes = lensGateResponse(c, gate);
    if (gateRes) return gateRes;
    try {
      const projects = await getProjectsData(entities, {
        userId: user.id,
        lensId,
      });
      return c.json({ projects });
    } catch (err) {
      console.error("[cli/project/list] failed:", err);
      return c.json({ error: "Could not load projects." }, 500);
    }
  });

  // GET /api/cli/project/show — query ?id (id-or-permalink). No lens guard.
  rest.get("/api/cli/project/show", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const id = queryString(c.req.raw, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    try {
      const project = await getProjectData(entities, { userId: user.id, id });
      if (!project) {
        return c.json({ error: "Project not found." }, 404);
      }
      return c.json({ project });
    } catch (err) {
      console.error("[cli/project/show] failed:", err);
      return c.json({ error: "Could not load project." }, 500);
    }
  });

  // POST /api/cli/project/create — body { name, lensId, goalId?, description?,
  // type? }. Entitlement: lens gate + the per-lens project cap.
  rest.post("/api/cli/project/create", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);
    const body = await parseBody(c.req.raw);
    const name = bodyString(body, "name");
    const lensId = bodyString(body, "lensId");
    if (!name || !lensId) {
      return c.json({ error: "name and lensId are required." }, 400);
    }
    const description = bodyString(body, "description");
    const goalId = bodyString(body, "goalId");
    const typeRaw = bodyString(body, "type");
    if (
      typeRaw !== undefined &&
      typeRaw !== "STANDARD" &&
      typeRaw !== "SIMPLE_LIST"
    ) {
      return c.json({ error: "type must be STANDARD or SIMPLE_LIST." }, 400);
    }
    // SAFETY: typeRaw was validated against both allowed project types above.
    const type = (typeRaw as "STANDARD" | "SIMPLE_LIST" | undefined) ?? "STANDARD";

    const gate = await gateLens(entities, entUser, user.id, lensId);
    const gateRes = lensGateResponse(c, gate);
    if (gateRes) return gateRes;
    // Per-lens project cap (FREE). Count non-done projects so finishing frees
    // a slot — same predicate createProject uses.
    const projectCount = await entities.Project.count({
      where: { userId: user.id, lensId, isDone: false },
    });
    const capMsg: EntitlementMessage = {
      feature: "a 4th project",
      reason: "organize more than 3 projects with Pro",
    };
    const capV = capViolation(entUser, projectCount, FREE_LIMITS.projects, capMsg);
    if (capV) {
      return c.json(violationBody(capV), 402);
    }

    try {
      const project = await createProjectCore(entities, {
        userId: user.id,
        name,
        lensId,
        goalId,
        description,
        type,
      });
      return c.json({ project }, 201);
    } catch (err) {
      console.error("[cli/project/create] failed:", err);
      return c.json({ error: "Could not create project." }, 500);
    }
  });

  // POST /api/cli/project/add-task — body { description, lensId, projectId?,
  // goalId? }. The core resolves the parent's lens (projectId→its lens, else
  // goalId→its lens, else the passed lensId) and runs assertLens against the
  // RESOLVED lens.
  rest.post("/api/cli/project/add-task", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);
    const body = await parseBody(c.req.raw);
    const description = bodyString(body, "description");
    const lensId = bodyString(body, "lensId");
    if (!description || !lensId) {
      return c.json({ error: "description and lensId are required." }, 400);
    }
    const projectId = bodyString(body, "projectId");
    const goalId = bodyString(body, "goalId");

    const assertLens = async (resolvedLensId: string): Promise<void> => {
      const gate = await gateLens(entities, entUser, user.id, resolvedLensId);
      if (gate.status === "not-found") {
        throw {
          __entitlement: true,
          httpStatus: 404,
          message: "No such lens for this account.",
        } satisfies EntitlementRejection;
      }
      if (gate.status === "denied") {
        throw {
          __entitlement: true,
          httpStatus: 402,
          message: `${gate.msg.feature} is a Pro feature.`,
          feature: gate.msg.feature,
          reason: gate.msg.reason,
        } satisfies EntitlementRejection;
      }
    };

    try {
      const task = await createTaskCore(entities, {
        userId: user.id,
        description,
        lensId,
        projectId,
        goalId,
        assertLens,
      });
      return c.json({ task }, 201);
    } catch (err) {
      if (isEntitlementRejection(err)) {
        return c.json(
          { error: err.message, feature: err.feature, reason: err.reason },
          err.httpStatus,
        );
      }
      console.error("[cli/project/add-task] failed:", err);
      if (err instanceof Error && /not found/i.test(err.message)) {
        return c.json({ error: err.message }, 404);
      }
      return c.json({ error: "Could not add task." }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Resource routes — project-owned links and notes. Resources are not blobs;
  // image attachments remain inbox-only capture data.
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/cli/resource/list — query ?projectId (required; id or permalink).
  // No lens gate (detail-style read). The core resolves the project (tenancy +
  // id-or-permalink); the resources themselves are fetched here because the
  // seam's project select is advisory (relations don't project).
  rest.get("/api/cli/resource/list", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const projectId = queryString(c.req.raw, "projectId");
    if (!projectId) {
      return c.json({ error: "A projectId is required." }, 400);
    }
    try {
      const project = await getProjectResourcesData(entities, {
        userId: user.id,
        projectId,
      });
      // The seam's project select is advisory (relations don't project), so
      // the resources themselves are fetched here — the exact webapp select
      // shape, createdAt desc.
      const rows = await db
        .select({
          id: resourceTable.id,
          title: resourceTable.title,
          url: resourceTable.url,
          notes: resourceTable.notes,
          createdAt: resourceTable.createdAt,
          attachmentId: resourceAttachmentTable.id,
          attachmentFilename: resourceAttachmentTable.filename,
          attachmentMime: resourceAttachmentTable.mimeType,
        })
        .from(resourceTable)
        .leftJoin(
          resourceAttachmentTable,
          eq(resourceAttachmentTable.resourceId, resourceTable.id),
        )
        .where(eq(resourceTable.projectId, project.id))
        .orderBy(desc(resourceTable.createdAt));
      const byId = new Map<
        string,
        {
          id: string;
          title: string;
          url: string | null;
          notes: string | null;
          createdAt: Date;
          attachments: { id: string; filename: string; mimeType: string }[];
        }
      >();
      for (const row of rows) {
        let entry = byId.get(row.id);
        if (!entry) {
          entry = {
            id: row.id,
            title: row.title,
            url: row.url,
            notes: row.notes,
            createdAt: row.createdAt,
            attachments: [],
          };
          byId.set(row.id, entry);
        }
        if (row.attachmentId) {
          entry.attachments.push({
            id: row.attachmentId,
            filename: row.attachmentFilename!,
            mimeType: row.attachmentMime!,
          });
        }
      }
      return c.json({
        projectId: project.id,
        resources: Array.from(byId.values()),
      });
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        return c.json({ error: err.message }, 404);
      }
      console.error("[cli/resource/list] failed:", err);
      return c.json({ error: "Could not load resources." }, 500);
    }
  });

  // POST /api/cli/resource/create — body { projectId, title, url?, notes? }.
  rest.post("/api/cli/resource/create", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const body = await parseBody(c.req.raw);
    const projectId = bodyString(body, "projectId");
    const title = bodyString(body, "title");
    if (!projectId || !title) {
      return c.json({ error: "projectId and title are required." }, 400);
    }
    const project = await entities.Project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { lensId: true, type: true },
    });
    if (!project) {
      return c.json({ error: "Project not found." }, 404);
    }
    if (project.type === "SIMPLE_LIST") {
      return c.json({ error: "A Simple list keeps only checklist items." }, 400);
    }
    const gate = await gateLens(entities, toEntUser(user), user.id, project.lensId);
    if (gate.status === "denied") {
      return c.json(violationBody(gate.msg), 402);
    }
    try {
      const { resource } = await createResourceCore(entities, {
        userId: user.id,
        projectId,
        title,
        url: bodyString(body, "url"),
        notes: bodyString(body, "notes"),
      });
      return c.json({ resource }, 201);
    } catch (err) {
      console.error("[cli/resource/create] failed:", err);
      return c.json(
        { error: err instanceof Error ? err.message : "Could not create resource." },
        400,
      );
    }
  });

  // POST /api/cli/resource/update — body { id, title?, url?, notes? } (empty
  // string clears url/notes).
  rest.post("/api/cli/resource/update", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const body = await parseBody(c.req.raw);
    const id = bodyString(body, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    try {
      const existing = await getResourceData(entities, {
        userId: user.id,
        id,
      });
      const gate = await gateLens(
        entities,
        toEntUser(user),
        user.id,
        existing.project.lensId,
      );
      if (gate.status === "denied") {
        return c.json(violationBody(gate.msg), 402);
      }
      const { resource } = await updateResourceCore(entities, {
        userId: user.id,
        id,
        title: bodyString(body, "title"),
        url: bodyString(body, "url"),
        notes: bodyString(body, "notes"),
      });
      return c.json({ resource });
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        return c.json({ error: err.message }, 404);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Could not update resource." },
        400,
      );
    }
  });

  // POST /api/cli/resource/delete — body { id }.
  rest.post("/api/cli/resource/delete", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const body = await parseBody(c.req.raw);
    const id = bodyString(body, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    try {
      const existing = await getResourceData(entities, {
        userId: user.id,
        id,
      });
      const gate = await gateLens(
        entities,
        toEntUser(user),
        user.id,
        existing.project.lensId,
      );
      if (gate.status === "denied") {
        return c.json(violationBody(gate.msg), 402);
      }
      const result = await deleteResourceCore(entities, {
        userId: user.id,
        id,
      });
      return c.json({ id: result.id });
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        return c.json({ error: err.message }, 404);
      }
      console.error("[cli/resource/delete] failed:", err);
      return c.json({ error: "Could not delete resource." }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Goal routes
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/cli/goal/list — query ?lensId. Lens-scoped read (entitlement gate).
  rest.get("/api/cli/goal/list", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);
    const lensId = queryString(c.req.raw, "lensId");
    if (!lensId) {
      return c.json({ error: "A lensId is required." }, 400);
    }
    const gate = await gateLens(entities, entUser, user.id, lensId);
    const gateRes = lensGateResponse(c, gate);
    if (gateRes) return gateRes;
    try {
      const goals = await getGoalsData(entities, {
        userId: user.id,
        lensId,
      });
      return c.json({ goals });
    } catch (err) {
      console.error("[cli/goal/list] failed:", err);
      return c.json({ error: "Could not load goals." }, 500);
    }
  });

  // GET /api/cli/goal/show — query ?id (id-or-permalink). No lens guard.
  rest.get("/api/cli/goal/show", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const id = queryString(c.req.raw, "id");
    if (!id) {
      return c.json({ error: "An id is required." }, 400);
    }
    try {
      const goal = await getGoalData(entities, { userId: user.id, id });
      if (!goal) {
        return c.json({ error: "Goal not found." }, 404);
      }
      return c.json({ goal });
    } catch (err) {
      console.error("[cli/goal/show] failed:", err);
      return c.json({ error: "Could not load goal." }, 500);
    }
  });

  // POST /api/cli/goal/create — body { name, lensId, description? }.
  // Entitlement: lens gate + the per-lens goal cap.
  rest.post("/api/cli/goal/create", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);
    const body = await parseBody(c.req.raw);
    const name = bodyString(body, "name");
    const lensId = bodyString(body, "lensId");
    if (!name || !lensId) {
      return c.json({ error: "name and lensId are required." }, 400);
    }
    const description = bodyString(body, "description");

    const gate = await gateLens(entities, entUser, user.id, lensId);
    const gateRes = lensGateResponse(c, gate);
    if (gateRes) return gateRes;
    const goalCount = await entities.Goal.count({
      where: { userId: user.id, lensId, isDone: false },
    });
    const capMsg: EntitlementMessage = {
      feature: "a 2nd goal",
      reason: "link work to more than one outcome with Pro",
    };
    const capV = capViolation(entUser, goalCount, FREE_LIMITS.goals, capMsg);
    if (capV) {
      return c.json(violationBody(capV), 402);
    }

    try {
      const goal = await createGoalCore(entities, {
        userId: user.id,
        name,
        lensId,
        description,
      });
      return c.json({ goal }, 201);
    } catch (err) {
      console.error("[cli/goal/create] failed:", err);
      return c.json({ error: "Could not create goal." }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Lens routes — listing owned lenses is always allowed (gating fires on
  // *use*); the active-lens decision lives client-side (no server state).
  // ─────────────────────────────────────────────────────────────────────────

  rest.get("/api/cli/lens/list", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    try {
      const lenses = await getLensesCore(entities, { userId: user.id });
      return c.json({ lenses });
    } catch (err) {
      console.error("[cli/lens/list] failed:", err);
      return c.json({ error: "Could not load lenses." }, 500);
    }
  });

  // GET /api/cli/lens/show — query ?idOrName (id OR name). No lens guard (a
  // FREE user may own a WORK lens seeded before a downgrade — reads of owned
  // data are never blocked).
  rest.get("/api/cli/lens/show", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const idOrName = queryString(c.req.raw, "idOrName");
    if (!idOrName) {
      return c.json({ error: "An idOrName is required." }, 400);
    }
    try {
      const lens = await getLensCore(entities, { userId: user.id, idOrName });
      if (!lens) {
        return c.json({ error: "Lens not found." }, 404);
      }
      return c.json({ lens });
    } catch (err) {
      console.error("[cli/lens/show] failed:", err);
      return c.json({ error: "Could not load lens." }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/cli/logbook — query ?lensId (optional). Explicit lens → gate;
  // omitted → FIRST accessible lens; none → 200 with four empty arrays (NO
  // wontDo key on this empty path).
  // ─────────────────────────────────────────────────────────────────────────
  rest.get("/api/cli/logbook", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const entUser = toEntUser(user);
    const requestedLensId = queryString(c.req.raw, "lensId");

    let lensId: string;
    if (requestedLensId) {
      const gate = await gateLens(entities, entUser, user.id, requestedLensId);
      const gateRes = lensGateResponse(c, gate);
      if (gateRes) return gateRes;
      lensId = requestedLensId;
    } else {
      // No lens specified: default to the first accessible lens (the web
      // Logbook is lens-scoped, so we pick the user's default rather than
      // mixing lenses).
      const firstLifeAreaId = await firstAccessibleLensId(entities, entUser, user.id);
      if (!firstLifeAreaId) {
        // No accessible lenses — return an empty logbook rather than 404 (the
        // user exists, there's just nothing to read).
        return c.json({ tasks: [], projects: [], goals: [], archived: [] });
      }
      lensId = firstLifeAreaId;
    }

    try {
      const logbook = await getLogbookData(entities, {
        userId: user.id,
        lensId,
      });
      return c.json(logbook);
    } catch (err) {
      console.error("[cli/logbook] failed:", err);
      return c.json({ error: "Could not load logbook." }, 500);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/cli/review — read-only Week/Month evidence for humans and agents.
  // Review stays universal unless lensId is explicit; unlike Logbook, it
  // never inherits a default lens.
  // ─────────────────────────────────────────────────────────────────────────
  rest.get("/api/cli/review", async (c) => {
    const user = requirePat(c);
    if (user instanceof Response) return user;
    const cadenceRaw = queryString(c.req.raw, "cadence")?.toUpperCase();
    if (cadenceRaw !== "WEEKLY" && cadenceRaw !== "MONTHLY") {
      return c.json({ error: "Cadence must be WEEKLY or MONTHLY." }, 400);
    }
    const timeZone = queryString(c.req.raw, "timeZone") ?? "UTC";
    const requestedFor = queryString(c.req.raw, "for");
    const previous = queryString(c.req.raw, "previous") === "true";
    if (requestedFor && previous) {
      return c.json({ error: "Use either for or previous, not both." }, 400);
    }

    const requestedLensId = queryString(c.req.raw, "lensId");
    if (requestedLensId) {
      const gate = await gateLens(entities, toEntUser(user), user.id, requestedLensId);
      const gateRes = lensGateResponse(c, gate);
      if (gateRes) return gateRes;
    }

    try {
      const currentDate = localDateFor(new Date(), timeZone);
      const forDate = requestedFor
        ? requestedFor
        : previous
          ? shiftReviewDate(currentDate, cadenceRaw, -1)
          : currentDate;
      const result = await getReviewData(db, user.id, {
        cadence: cadenceRaw,
        forDate,
        timeZone,
      });
      const report = buildReviewReport(result, timeZone, requestedLensId ?? null);
      return c.json({ report });
    } catch (err) {
      if (
        err instanceof Error &&
        (/Review date/.test(err.message) || /Time zone/.test(err.message))
      ) {
        return c.json({ error: err.message }, 400);
      }
      console.error("[cli/review] failed:", err);
      return c.json({ error: "Could not load review report." }, 500);
    }
  });

  return rest;
}
