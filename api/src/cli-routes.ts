/**
 * The admin PAT routes (S17) — the `/api/cli/feedback/*` + `/api/cli/admin/*`
 * REST surface `actionamp-admin` consumes, ported route-for-route from
 * webapp/src/auth/patRoutes.ts (cliFeedbackList/Show/Status/Delete,
 * cliAdminStats, cliAdminGrowth, cliAdminFeedback).
 *
 * These are REST by identity — the webapp served them as Express routes under
 * `/api/cli/*`, NOT as Wasp operations, and the admin-cli's api.ts speaks
 * plain fetch + Bearer against exactly these paths/bodies. S18 will
 * conformance-test them (s17-admin/README.md §1.3 is the checklist).
 *
 * Gating order (webapp parity — the load-bearing property):
 *   1. F10b PAT validation (Bearer-only; 401 exact webapp bodies; 402
 *      entitlement before any handler — `isAdmin` bypasses it).
 *   2. requireAdmin — 401 `Not authenticated.` (unreachable after 1; kept for
 *      exactness) / 403 `{"error":"Admin only."}` — checked BEFORE any DB
 *      read, so a non-admin probing ids learns nothing.
 *   3. input validation (400s, exact webapp strings), then the shared cores.
 *
 * MOUNT (delivered line — see docs/plans/slices/s17-wiring.md §3):
 *   app.route("/", createCliRest({ db, entities }));   // api/src/index.ts
 */
import { Hono, type Context } from "hono";
import type { DomainDb, Entities } from "@actionamp/domain/db";
import {
  getAdminStatsCore,
  getFunnelStatsCore,
  getRecentFeedbackCore,
} from "@actionamp/domain/admin";
import {
  FEEDBACK_STATUSES,
  isFeedbackStatus,
  listFeedbackCore,
  showFeedbackCore,
  updateFeedbackStatusCore,
  deleteFeedbackCore,
  type FeedbackStatus,
} from "@actionamp/domain/feedback";
import {
  drizzlePatLookupPort,
  resolvePatCore,
  type PatLookupPort,
  type PatUser,
} from "./auth/pat.js";

interface CliRestDeps {
  db: DomainDb;
  entities: Entities;
  /** Test seam — defaults to the real F10b lookup over `db`. */
  patPort?: PatLookupPort;
}

type Body = Record<string, unknown> | null | undefined;

/** Safely read a string query param or null (patRoutes.ts queryString parity).
 *  Hono's req.query returns primitives only — the non-string arm is the null
 *  answer, same contract as the Express original. */
function queryString(c: Context, key: string): string | null {
  const v = c.req.query(key);
  return typeof v === "string" && v !== "" ? v : v === "" ? "" : null;
}

/** Safely read a string field from a parsed JSON body or undefined. */
function bodyString(body: Body, key: string): string | undefined {
  const v = (body as Body)?.[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * The shared admin gate — the EXACT webapp bodies. Returns the 401/403
 * answer (caller short-circuits) or null when the caller is an admin.
 */
function requireAdmin(
  user: PatUser | undefined,
): { body: { error: string }; status: 401 | 403 } | null {
  if (!user) {
    return { body: { error: "Not authenticated." }, status: 401 };
  }
  if (!user.isAdmin) {
    return { body: { error: "Admin only." }, status: 403 };
  }
  return null;
}

export function createCliRest(deps: CliRestDeps) {
  const app = new Hono();
  const patPort = deps.patPort ?? drizzlePatLookupPort(deps.db);

  /**
   * Steps 1 + 2 for every route: Bearer PAT (F10b) → admin gate. Returns the
   * Response to short-circuit with, or the admin's PatUser.
   */
  async function gate(c: Context): Promise<{ user: PatUser } | Response> {
    const resolution = await resolvePatCore(
      patPort,
      c.req.header("authorization"),
    );
    if (!resolution.ok) {
      return c.json(resolution.body, resolution.status);
    }
    const denied = requireAdmin(resolution.user);
    if (denied) {
      return c.json(denied.body, denied.status);
    }
    return { user: resolution.user };
  }

  // ----------------------------------------------------------------
  // Feedback triage (admin-cli feedback list/show/status/delete)
  // ----------------------------------------------------------------

  // GET /api/cli/feedback/list — newest first. ?status= narrows to one bucket;
  // ?limit= caps the page (positive int) or "all" for unbounded.
  app.get("/api/cli/feedback/list", async (c) => {
    const gated = await gate(c);
    if (gated instanceof Response) return gated;

    const statusParam = queryString(c, "status");
    let status: FeedbackStatus | undefined;
    if (statusParam !== null) {
      if (!isFeedbackStatus(statusParam)) {
        return c.json({
          error: `Invalid status. Must be one of: ${FEEDBACK_STATUSES.join(", ")}.`,
        }, 400);
      }
      status = statusParam;
    }

    // limit: "all" (or absent) → unbounded; a positive integer → cap. The CLI
    // sends its own default (10) when the user passes nothing.
    const limitRaw = queryString(c, "limit");
    let limit: number | undefined;
    if (limitRaw !== null && limitRaw !== "all") {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n <= 0) {
        return c.json(
          { error: "limit must be a positive number or 'all'." },
          400,
        );
      }
      limit = Math.floor(n);
    }

    try {
      const feedback = await listFeedbackCore(deps.entities, { status, limit });
      return c.json({ feedback });
    } catch (err) {
      console.error("[cli/feedback/list] failed:", err);
      return c.json({ error: "Could not list feedback." }, 500);
    }
  });

  // GET /api/cli/feedback/show?id= — single feedback row. 404 when absent.
  app.get("/api/cli/feedback/show", async (c) => {
    const gated = await gate(c);
    if (gated instanceof Response) return gated;

    const id = queryString(c, "id");
    if (!id) {
      return c.json({ error: "id is required." }, 400);
    }

    try {
      const feedback = await showFeedbackCore(deps.entities, { id });
      if (!feedback) {
        return c.json({ error: "Feedback not found." }, 404);
      }
      return c.json({ feedback });
    } catch (err) {
      console.error("[cli/feedback/show] failed:", err);
      return c.json({ error: "Could not load feedback." }, 500);
    }
  });

  // POST /api/cli/feedback/status — body { id, status }.
  app.post("/api/cli/feedback/status", async (c) => {
    const gated = await gate(c);
    if (gated instanceof Response) return gated;

    const body = (await c.req.json().catch(() => null)) as Body;
    const id = bodyString(body, "id");
    if (!id) {
      return c.json({ error: "id is required." }, 400);
    }
    const status = bodyString(body, "status");
    if (!status) {
      return c.json({
        error: `status is required. One of: ${FEEDBACK_STATUSES.join(", ")}.`,
      }, 400);
    }
    if (!isFeedbackStatus(status)) {
      return c.json({
        error: `Invalid status. Must be one of: ${FEEDBACK_STATUSES.join(", ")}.`,
      }, 400);
    }

    try {
      const feedback = await updateFeedbackStatusCore(deps.entities, {
        id,
        status,
      });
      return c.json({ feedback });
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        return c.json({ error: err.message }, 404);
      }
      console.error("[cli/feedback/status] failed:", err);
      return c.json({ error: "Could not update feedback status." }, 500);
    }
  });

  // POST /api/cli/feedback/delete — body { id }. Soft-deletes (sets deletedAt;
  // every read core filters deletedAt: null → a second delete 404s).
  app.post("/api/cli/feedback/delete", async (c) => {
    const gated = await gate(c);
    if (gated instanceof Response) return gated;

    const body = (await c.req.json().catch(() => null)) as Body;
    const id = bodyString(body, "id");
    if (!id) {
      return c.json({ error: "id is required." }, 400);
    }

    try {
      const feedback = await deleteFeedbackCore(deps.entities, { id });
      return c.json({ feedback });
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        return c.json({ error: err.message }, 404);
      }
      console.error("[cli/feedback/delete] failed:", err);
      return c.json({ error: "Could not delete feedback." }, 500);
    }
  });

  // ----------------------------------------------------------------
  // Admin dashboard stats + recent feedback (actionamp-admin stats)
  // ----------------------------------------------------------------

  // GET /api/cli/admin/stats?range= — { stats: AdminStats }.
  app.get("/api/cli/admin/stats", async (c) => {
    const gated = await gate(c);
    if (gated instanceof Response) return gated;
    try {
      const rawRange = queryString(c, "range");
      const range = rawRange === "7d" || rawRange === "all" ? rawRange : "30d";
      const stats = await getAdminStatsCore(deps.entities, range);
      return c.json({ stats });
    } catch (err) {
      console.error("[cli/admin/stats] failed:", err);
      return c.json({ error: "Could not load admin stats." }, 500);
    }
  });

  // GET /api/cli/admin/growth?range= — FunnelStats at TOP level (NOT wrapped
  // in {stats} — the admin-cli growth command reads the bare shape).
  app.get("/api/cli/admin/growth", async (c) => {
    const gated = await gate(c);
    if (gated instanceof Response) return gated;
    try {
      const rawRange = queryString(c, "range");
      const range = rawRange === "7d" || rawRange === "all" ? rawRange : "30d";
      const funnel = await getFunnelStatsCore(deps.entities, range);
      return c.json(funnel);
    } catch (err) {
      console.error("[cli/admin/growth] failed:", err);
      return c.json({ error: "Could not load growth funnel." }, 500);
    }
  });

  // GET /api/cli/admin/feedback?after=&limit= — { items, hasNext } top level;
  // limit default 10, clamped 1–50.
  app.get("/api/cli/admin/feedback", async (c) => {
    const gated = await gate(c);
    if (gated instanceof Response) return gated;
    const afterId = queryString(c, "after");
    const limitRaw = Number(queryString(c, "limit") ?? "10");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(50, Math.floor(limitRaw)))
      : 10;
    try {
      const page = await getRecentFeedbackCore(deps.entities, {
        afterId: afterId ?? null,
        limit,
      });
      return c.json(page);
    } catch (err) {
      console.error("[cli/admin/feedback] failed:", err);
      return c.json({ error: "Could not load recent feedback." }, 500);
    }
  });

  return app;
}
