import { describe, expect, it, vi } from "vitest";
import type { DomainDb } from "@actionamp/domain/db";
import { Hono } from "hono";
import { createCliRest } from "./cli-routes.js";
import { hashToken, type PatLookupPort, type PatUser } from "./auth/pat.js";

/**
 * S17 pins for the /api/cli/feedback/* + /api/cli/admin/* REST routes
 * (s17-admin/README.md §1.3 — S18 diffs these against actionamp-admin):
 *
 *  - GATE ORDER: the admin check answers BEFORE any DB read — a non-admin
 *    token gets the exact 403 body `{"error":"Admin only."}` regardless of
 *    which id it asks for (no existence oracle), and the entities spies are
 *    never touched.
 *  - EXACT BODIES: 401s come from the F10b path (missing/malformed, invalid/
 *    revoked), 400s carry the webapp strings verbatim, show/status/delete map
 *    unknown rows to 404, growth is NOT wrapped in {stats}.
 */

const ADMIN: PatUser = {
  id: "admin-1",
  plan: "FREE",
  planRenewsAt: null,
  isAdmin: true,
  manualAccessGrant: null,
  email: "admin@local.test",
  fullName: "ActionAmp Admin",
};

// PRO: only an ENTITLED non-admin can ever reach the 403 — the webapp's
// patMiddleware 402s FREE tokens before any handler runs (pinned below).
const NON_ADMIN: PatUser = { ...ADMIN, id: "user-1", isAdmin: false, plan: "PRO", planRenewsAt: new Date(Date.now() + 86_400_000) };
const FREE_NON_ADMIN: PatUser = { ...ADMIN, id: "user-2", isAdmin: false, plan: "FREE" };

/** A PAT port whose `aa_good` token is an admin; `aa_plain` is a non-admin. */
function mockPatPort(): PatLookupPort {
  return {
    findApiKeyUserByHash: vi.fn(async (hashedToken: string) => {
      // The port receives the SHA-256 of the FULL plaintext (F10b storage).
      if (hashedToken === hashToken("aa_good")) return { ...ADMIN, apiKeyId: "key-1" };
      if (hashedToken === hashToken("aa_plain")) return { ...NON_ADMIN, apiKeyId: "key-2" };
      if (hashedToken === hashToken("aa_free")) return { ...FREE_NON_ADMIN, apiKeyId: "key-3" };
      return null;
    }),
    touchApiKey: vi.fn(async () => {}),
  };
}

/** The core seam as spies — every delegate a vi.fn() that resolves sensibly. */
function mockEntities() {
  const fn = () => vi.fn().mockResolvedValue([]);
  return {
    Feedback: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    User: { count: fn(), findMany: fn(), findUnique: fn(), update: fn(), delete: fn() },
    Task: { count: fn(), groupBy: fn() },
    Payment: { count: fn() },
    AnalyticsEvent: { count: fn(), groupBy: fn() },
    AnalyticsSession: { findMany: fn() },
    LoginEvent: { groupBy: fn() },
    AdminUserAction: { create: fn() },
    MagicLoginChallenge: { deleteMany: fn() },
  };
}

function buildApp(opts: { patPort: PatLookupPort; entities: Record<string, unknown> }) {
  return new Hono().route(
    "/",
    createCliRest({
      db: {} as DomainDb,
      // SAFETY: the spy bag satisfies the seam surface at runtime.
      entities: opts.entities as unknown as import("@actionamp/domain/db").Entities,
      patPort: opts.patPort,
    }),
  );
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

describe("gate order — admin check FIRST, exact bodies", () => {
  it("missing token → 401 Missing or malformed bearer token. (F10b body)", async () => {
    const app = buildApp({ patPort: mockPatPort(), entities: mockEntities() });
    const res = await app.request("/api/cli/admin/stats");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Missing or malformed bearer token." });
  });

  it("unknown token → 401 Invalid or revoked token.", async () => {
    const app = buildApp({ patPort: mockPatPort(), entities: mockEntities() });
    const res = await app.request("/api/cli/admin/stats", { headers: bearer("aa_nope") });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or revoked token." });
  });

  it.each([
    "/api/cli/feedback/list",
    "/api/cli/feedback/show?id=TEST-0001",
    "/api/cli/admin/stats",
    "/api/cli/admin/growth",
    "/api/cli/admin/feedback",
  ])("non-admin GET %s → 403 Admin only. with NO DB reads", async (path) => {
    const entities = mockEntities();
    const app = buildApp({ patPort: mockPatPort(), entities });
    const res = await app.request(path, { headers: bearer("aa_plain") });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin only." });
    // The no-information-leak property: the gate fires before every core.
    expect(entities.Feedback.findMany).not.toHaveBeenCalled();
    expect(entities.Feedback.findFirst).not.toHaveBeenCalled();
    expect(entities.User.count).not.toHaveBeenCalled();
    expect(entities.AnalyticsSession.findMany).not.toHaveBeenCalled();
  });

  it("a FREE non-admin gets the patMiddleware 402 BEFORE the admin gate (webapp order)", async () => {
    const entities = mockEntities();
    const app = buildApp({ patPort: mockPatPort(), entities });
    const res = await app.request("/api/cli/admin/stats", {
      headers: bearer("aa_free"),
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; feature: string; reason: string };
    expect(body.error).toMatch(/is a Pro feature\./);
    expect(entities.User.count).not.toHaveBeenCalled();
  });

  it.each(["/api/cli/feedback/status", "/api/cli/feedback/delete"])(
    "non-admin POST %s → 403 Admin only. before body validation",
    async (path) => {
      const app = buildApp({ patPort: mockPatPort(), entities: mockEntities() });
      const res = await app.request(path, {
        method: "POST",
        headers: { ...bearer("aa_plain"), "content-type": "application/json" },
        body: JSON.stringify({ id: "TEST-0001" }),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Admin only." });
    },
  );
});

describe("feedback triage routes", () => {
  it("list validates ?status= with the exact webapp message", async () => {
    const app = buildApp({ patPort: mockPatPort(), entities: mockEntities() });
    const res = await app.request("/api/cli/feedback/list?status=BOGUS", {
      headers: bearer("aa_good"),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid status. Must be one of: OPEN, IN_PROGRESS, RESOLVED, CLOSED.",
    });
  });

  it("list rejects a non-positive ?limit= and passes valid filters to the core", async () => {
    const entities = mockEntities();
    const app = buildApp({ patPort: mockPatPort(), entities });
    const bad = await app.request("/api/cli/feedback/list?limit=0", {
      headers: bearer("aa_good"),
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: "limit must be a positive number or 'all'.",
    });

    entities.Feedback.findMany.mockResolvedValue([]);
    const good = await app.request("/api/cli/feedback/list?status=OPEN&limit=5", {
      headers: bearer("aa_good"),
    });
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ feedback: [] });
    expect(entities.Feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: expect.any(Object),
      }),
    );
  });

  it("show requires ?id= and 404s an unknown ref", async () => {
    const entities = mockEntities();
    const app = buildApp({ patPort: mockPatPort(), entities });
    const noId = await app.request("/api/cli/feedback/show", {
      headers: bearer("aa_good"),
    });
    expect(noId.status).toBe(400);
    expect(await noId.json()).toEqual({ error: "id is required." });

    const missing = await app.request("/api/cli/feedback/show?id=NOPE", {
      headers: bearer("aa_good"),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Feedback not found." });
  });

  it("status validates the body and 404s when the core reports not-found", async () => {
    const entities = mockEntities();
    const app = buildApp({ patPort: mockPatPort(), entities });
    const post = (body: unknown) =>
      app.request("/api/cli/feedback/status", {
        method: "POST",
        headers: { ...bearer("aa_good"), "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const noStatus = await post({ id: "x" });
    expect(noStatus.status).toBe(400);
    expect(await noStatus.json()).toEqual({
      error: "status is required. One of: OPEN, IN_PROGRESS, RESOLVED, CLOSED.",
    });

    const badStatus = await post({ id: "x", status: "BOGUS" });
    expect(badStatus.status).toBe(400);
    expect(await badStatus.json()).toEqual({
      error: "Invalid status. Must be one of: OPEN, IN_PROGRESS, RESOLVED, CLOSED.",
    });

    entities.Feedback.findFirst.mockResolvedValue(null);
    const missing = await post({ id: "x", status: "RESOLVED" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Feedback not found." });
  });

  it("delete soft-deletes through the core and 404s an already-deleted row", async () => {
    const entities = mockEntities();
    const app = buildApp({ patPort: mockPatPort(), entities });
    const row = { id: "fb-1", deletedAt: new Date().toISOString(), status: "OPEN" };
    entities.Feedback.findFirst.mockResolvedValueOnce({ id: "fb-1" });
    entities.Feedback.update.mockResolvedValueOnce(row);
    const ok = await app.request("/api/cli/feedback/delete", {
      method: "POST",
      headers: { ...bearer("aa_good"), "content-type": "application/json" },
      body: JSON.stringify({ id: "fb-1" }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ feedback: row });
    expect(entities.Feedback.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );

    entities.Feedback.findFirst.mockResolvedValueOnce(null);
    const gone = await app.request("/api/cli/feedback/delete", {
      method: "POST",
      headers: { ...bearer("aa_good"), "content-type": "application/json" },
      body: JSON.stringify({ id: "fb-1" }),
    });
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "Feedback not found." });
  });
});

describe("admin stats + growth routes", () => {
  it("stats coerces an invalid range to 30d and wraps in {stats}", async () => {
    const entities = mockEntities();
    const app = buildApp({ patPort: mockPatPort(), entities });
    entities.User.count.mockResolvedValue(0);
    entities.Task.count.mockResolvedValue(0);
    entities.AnalyticsSession.findMany.mockResolvedValue([]);
    const res = await app.request("/api/cli/admin/stats?range=bogus", {
      headers: bearer("aa_good"),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stats: { range: string } };
    expect(body.stats.range).toBe("30d");
  });

  it("growth answers with the bare FunnelStats shape (no {stats} wrapper)", async () => {
    const entities = mockEntities();
    const app = buildApp({ patPort: mockPatPort(), entities });
    entities.AnalyticsSession.findMany.mockResolvedValue([]);
    const res = await app.request("/api/cli/admin/growth?range=7d", {
      headers: bearer("aa_good"),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Top-level funnel keys — S18 pins this against the admin-cli parser.
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(["range", "since", "funnel", "sources", "retention"]),
    );
    expect(body.range).toBe("7d");
  });

  it("admin feedback clamps ?limit= 1–50 and returns {items, hasNext}", async () => {
    const entities = mockEntities();
    const app = buildApp({ patPort: mockPatPort(), entities });
    entities.Feedback.findMany.mockResolvedValue([]);
    const res = await app.request("/api/cli/admin/feedback?after=fb-9&limit=999", {
      headers: bearer("aa_good"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], hasNext: false });
    expect(entities.Feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 51, skip: 1, cursor: { id: "fb-9" } }),
    );
  });
});
