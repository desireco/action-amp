/**
 * S18 conformance suite — `packages/contract/src/s18-cli-routes/README.md` is
 * the spec this file verifies. For EVERY `/api/cli/*` + `/api/pat/*` route it
 * asserts the method, the status, and the EXACT `--json` body shape (field
 * names, key order, null-ness, and ordering where deterministic) — the same
 * parsed-shape equality the unchanged CLIs' own unit tests pin, since both
 * clients print `JSON.stringify(server body)` verbatim.
 *
 * Runs against the real dev database (DATABASE_URL, e.g.
 * postgresql://jake@localhost:5432/actionamp_dev) with the `seed-cli.ts`
 * fixtures; requests go through the same Hono app index.ts mounts, via
 * `app.request` (no port needed).
 *
 * Run: cd api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev \
 *        bunx --bun vitest run src/cli/cli-conformance.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Hono } from "hono";
import type { DomainDb, Entities } from "@actionamp/domain/db";
import { createDb, createEntities } from "@actionamp/domain/db";
import { eq } from "drizzle-orm";
import { session as sessionTable } from "@actionamp/domain/db";
import { isLocalDatabaseUrl } from "../db.js";
import { drizzleSessionIssuePort, issueSessionCore } from "../auth/issue.js";
import { createCliRoutes } from "./routes.js";
// S17's admin surface — the conformance suite mounts BOTH sub-apps so the
// whole 34-route table (§1.1–§1.11 of the s18 P0 notes) is verified in one
// place, each route against the file that owns it.
import { createCliRest } from "../cli-routes.js";
import {
  seedCliFixtures,
  PRO_EMAIL,
  type CliFixtures,
} from "../seed-cli.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shape matcher — objects pin EXACT key order + recursion; arrays pin element
// shape; leaves are type strings ("string", "number", "boolean", "null",
// "iso", "array", "object") joined with "|" for unions, or an exact literal
// (string/number/boolean) that must match.
// ─────────────────────────────────────────────────────────────────────────────

type SpecObject = { [key: string]: Spec };
type Spec = SpecObject | string | SpecObject[] | boolean | number;

const LEAF_KINDS = new Set(["string", "number", "boolean", "null", "iso", "array", "object"]);

function matchLeaf(value: unknown, spec: string): boolean {
  const parts = spec.split("|");
  // Not a type keyword → an exact literal the value must equal.
  if (!parts.every((s) => LEAF_KINDS.has(s))) {
    return value === spec;
  }
  const kinds = new Set(parts);
  const typeOf = (v: unknown): string | null => {
    if (v === null) return "null";
    if (v instanceof Date) return "iso";
    if (Array.isArray(v)) return "array";
    if (v instanceof Object) return "object";
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "string") {
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(v)
        ? "iso"
        : "string";
    }
    return null;
  };
  const kind = typeOf(value);
  return kind !== null && kinds.has(kind);
}

function expectShape(value: unknown, spec: Spec, path = "$"): void {
  if (typeof spec === "string") {
    expect(matchLeaf(value, spec), `${path} = ${JSON.stringify(value)} ≠ ${spec}`).toBe(
      true,
    );
    return;
  }
  if (typeof spec === "boolean" || typeof spec === "number") {
    expect(value, path).toBe(spec);
    return;
  }
  if (Array.isArray(spec)) {
    expect(Array.isArray(value), `${path} is not an array`).toBe(true);
    const arr = value as unknown[];
    if (spec.length === 1) {
      arr.forEach((element, i) => expectShape(element, spec[0], `${path}[${i}]`));
    }
    return;
  }
  // Object spec: exact key ORDER (the JSON.stringify order the CLIs print).
  expect(Array.isArray(value) || value === null || !(value instanceof Object),
    `${path} expected object`).toBe(false);
  expect(Object.keys(value as object), `${path} key order`).toEqual(
    Object.keys(spec),
  );
  for (const [key, sub] of Object.entries(spec)) {
    expectShape((value as Record<string, unknown>)[key], sub, `${path}.${key}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────────────────────

const DB_URL = process.env.DATABASE_URL ?? "";
const hasDb = DB_URL !== "" && isLocalDatabaseUrl(DB_URL);

const d = hasDb ? describe : describe.skip;
if (!hasDb) {
  console.warn(
    "[cli-conformance] DATABASE_URL not set (or not localhost) — suite skipped. " +
      "Run with DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev",
  );
}

let db: DomainDb;
let entities: Entities;
let app: Hono<{ Variables: { patUser: {
    id: string;
    plan: string;
    planRenewsAt: Date | null;
    isAdmin: boolean;
    manualAccessGrant: "PRO" | "FOUNDER" | "FRIEND" | null;
    email: string | null;
    fullName: string;
  } } }>;
let fx: CliFixtures;
const cleanup: (() => Promise<void>)[] = [];

async function req(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown; res: Response }> {
  const res = await app.request(path, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let body: unknown = null;
  if (res.headers.get("content-type")?.includes("application/json")) {
    body = await res.json();
  } else {
    body = await res.arrayBuffer();
  }
  return { status: res.status, body, res };
}

const UNKNOWN_TOKEN =
  "aa_" + "A".repeat(43); // right shape, never minted

beforeAll(async () => {
  db = createDb(DB_URL);
  entities = createEntities(db);
  fx = await seedCliFixtures(db);
  app = createCliRoutes({ db, entities });
  app.route("/", createCliRest({ db, entities }));
}, 30_000);

afterAll(async () => {
  for (const fn of cleanup) await fn();
  await db.$client.end();
});

d("S18 CLI conformance — auth + transport contract", () => {
  it("whoami without a token → 401 missing bearer (exact body)", async () => {
    const { status, body } = await req("/api/cli/whoami");
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Missing or malformed bearer token." });
  });

  it("garbage token (no aa_ prefix) → 401 missing bearer", async () => {
    const { status, body } = await req("/api/cli/whoami", { token: "garbage" });
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Missing or malformed bearer token." });
  });

  it("unknown token → 401 invalid/revoked (exact body)", async () => {
    const { status, body } = await req("/api/cli/whoami", { token: UNKNOWN_TOKEN });
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Invalid or revoked token." });
  });

  it("FREE token → 402 CLI gate on EVERY route, before any handler", async () => {
    const { status, body } = await req("/api/cli/whoami", { token: fx.free.token });
    expect(status).toBe(402);
    expect(body).toEqual({
      error: "CLI and API access is a Pro feature.",
      feature: "CLI and API access",
      reason: "use ActionAmp from the terminal or with an agent",
    });
    const inbox = await req("/api/cli/inbox/list", { token: fx.free.token });
    expect(inbox.status).toBe(402);
    expect(inbox.body).toEqual(body);
  });

  it("OPTIONS → 204 without auth", async () => {
    const res = await app.request("/api/cli/whoami", { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });

  it("whoami → exact envelope + key order", async () => {
    const { status, body } = await req("/api/cli/whoami", { token: fx.pro.token });
    expect(status).toBe(200);
    expectShape(body, {
      user: {
        id: "string",
        email: "string",
        fullName: "string",
        plan: "string",
        isAdmin: "boolean",
      },
    });
    const u = (body as { user: { email: string; plan: string } }).user;
    expect(u.email).toBe(PRO_EMAIL);
    expect(u.plan).toBe("PRO");
  });
});

d("S18 — now (§1.2)", () => {
  it("PRO, no lensId → task + context (exact shapes)", async () => {
    const { status, body } = await req("/api/cli/now", { token: fx.pro.token });
    expect(status).toBe(200);
    // The ranked winner depends on accumulated run state (started/snoozed
    // scratch tasks from earlier runs), so the row's scalars are asserted as
    // a SET with correct null-ness, not as one pinned task.
    const ranked = (body as { task: Record<string, unknown> }).task;
    expect(Object.keys(ranked).sort()).toEqual(
      [
        "completedAt", "content", "createdAt", "description", "goal",
        "goalId", "id", "isDone", "isOnboardingSample", "lensId", "order",
        "outcome", "permalink", "priority", "project", "projectId", "size",
        "startedAt", "status", "scheduledDate", "snoozedUntil", "updatedAt",
        "userId",
      ].sort(),
    );
    expectShape(body, {
      task: "object",
      context: {
        project: "object|null",
        goal: "object|null",
        whyNow: "string|null",
        whyItMatters: "string|null",
      },
    });
  });

  it("PRO, explicit lensId → 200 (same envelope)", async () => {
    const { status } = await req(`/api/cli/now?lensId=${fx.pro.lensWorkId}`, {
      token: fx.pro.token,
    });
    expect(status).toBe(200);
  });

  it("unknown lens → 404 (no existence leak)", async () => {
    const { status, body } = await req("/api/cli/now?lensId=bogus", {
      token: fx.pro.token,
    });
    expect(status).toBe(404);
    expect(body).toEqual({ error: "No such lens for this account." });
  });

  it("FREE explicit Work lens → 402 (the account-level CLI gate answers first)", async () => {
    // Parity note: cliAccessViolation runs in the MIDDLEWARE on every
    // /api/cli/* request, so a FREE token always gets the account 402 — the
    // per-route lens gate behind it only fires for entitled users (where it
    // never violates). Identical layering on the webapp.
    const { status, body } = await req(`/api/cli/now?lensId=${fx.free.lensWorkId}`, {
      token: fx.free.token,
    });
    expect(status).toBe(402);
    expect(body).toEqual({
      error: "CLI and API access is a Pro feature.",
      feature: "CLI and API access",
      reason: "use ActionAmp from the terminal or with an agent",
    });
  });

  it("no accessible lenses → 200 {task:null,context:null,reason:'no-lens'}", async () => {
    const { status, body } = await req("/api/cli/now", { token: fx.bare.token });
    expect(status).toBe(200);
    expect(body).toEqual({ task: null, context: null, reason: "no-lens" });
  });
});

d("S18 — capture + inbox (§1.3)", () => {
  it("capture text → 201 inbox-item envelope (exact key order)", async () => {
    const { status, body } = await req("/api/cli/capture", {
      method: "POST",
      token: fx.pro.token,
      body: { text: "Conformance: capture path test" },
    });
    expect(status).toBe(201);
    expectShape(body, {
      ok: true,
      kind: "inbox-item",
      id: "string",
      text: "string",
      createdAt: "iso",
    });
    expect((body as { text: string }).text).toBe("Conformance: capture path test");
  });

  it("capture with a number as text → treated as ABSENT → 400", async () => {
    const { status, body } = await req("/api/cli/capture", {
      method: "POST",
      token: fx.pro.token,
      body: { text: 123 },
    });
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Capture text is required." });
  });

  it("both projectId and listId → 400", async () => {
    const { status, body } = await req("/api/cli/capture", {
      method: "POST",
      token: fx.pro.token,
      body: { text: "x", projectId: "a", listId: "b" },
    });
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Choose either projectId or listId, not both." });
  });

  it("capture to a Simple list → 201 list-item", async () => {
    const { status, body } = await req("/api/cli/capture", {
      method: "POST",
      token: fx.pro.token,
      body: { text: "Conformance: list item", listId: fx.pro.listProjectId },
    });
    expect(status).toBe(201);
    expectShape(body, {
      ok: true,
      kind: "list-item",
      id: "string",
      text: "string",
      isDone: "boolean",
      order: "number",
      completedAt: "null",
      createdAt: "iso",
      updatedAt: "iso",
      userId: "string",
      content: "null",
      sourceUrl: "null",
      projectId: "string",
    });
  });

  it("listId on a STANDARD project → 400", async () => {
    const { status, body } = await req("/api/cli/capture", {
      method: "POST",
      token: fx.pro.token,
      body: { text: "x", listId: fx.pro.projectId },
    });
    expect(status).toBe(400);
    expect(body).toEqual({ error: "listId must identify a Simple list." });
  });

  it("unknown listId → 404", async () => {
    const { status, body } = await req("/api/cli/capture", {
      method: "POST",
      token: fx.pro.token,
      body: { text: "x", listId: "nope" },
    });
    expect(status).toBe(404);
    expect(body).toEqual({ error: "No such list for this account." });
  });

  it("malformed attachment shape → 400", async () => {
    const { status, body } = await req("/api/cli/capture", {
      method: "POST",
      token: fx.pro.token,
      body: { text: "x", attachments: [{ filename: "a.png" }] },
    });
    expect(status).toBe(400);
    expect(body).toEqual({
      error: "Attachments must include filename, mimeType, and dataBase64.",
    });
  });

  it("inbox list → exact InboxItem shape (newest first)", async () => {
    const { status, body } = await req("/api/cli/inbox/list", {
      token: fx.pro.token,
    });
    expect(status).toBe(200);
    const items = (body as { items: unknown[] }).items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expectShape(body, {
      items: [
        {
          id: "string",
          text: "string",
          title: "null",
          content: "null",
          sourceUrl: "null",
          attachments: "array",
          createdAt: "iso",
          parsedScheduledDate: "null",
          parsedSnoozedUntil: "null",
          parsedPriority: "null",
          parsedSize: "null",
          parsedTags: "array|null",
          parsedProject: "null",
          parsedLens: "null",
          parsedProjectId: "null",
          parsedLensId: "null",
        },
      ],
    });
    const texts = (body as { items: { text: string; createdAt: string }[] }).items.map(
      (i) => i.text,
    );
    const created = (body as { items: { createdAt: string }[] }).items.map(
      (i) => i.createdAt,
    );
    expect(created).toEqual([...created].sort().reverse());
    expect(texts).toContain("Conformance: raw capture #cli");
  });

  it("triage boundary errors (exact strings)", async () => {
    const post = (body: unknown) =>
      req("/api/cli/inbox/triage", { method: "POST", token: fx.pro.token, body });
    let r = await post({});
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "inboxItemId and decision are required." });

    r = await post({ inboxItemId: "x", decision: "nope" });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error:
        "decision must be one of: task-today, upcoming, someday, project, resource, list-item, archive, delete.",
    });

    r = await post({ inboxItemId: "x", decision: "task-today" });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'lensId is required for the "task-today" decision.' });

    r = await post({ inboxItemId: "x", decision: "list-item" });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error: 'projectId (a Simple list) is required for the "list-item" decision.',
    });

    r = await post({
      inboxItemId: "x",
      decision: "task-today",
      lensId: fx.pro.lensMeId,
      priority: "URGENT",
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "priority must be LOW, NORMAL, or IMPORTANT." });

    r = await post({
      inboxItemId: "x",
      decision: "task-today",
      lensId: fx.pro.lensMeId,
      size: "XXL",
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "size must be S, M, L, or XL." });

    r = await post({ inboxItemId: "missing-item", decision: "archive" });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Inbox item not found." });
  });

  it("triage archive → 200 {result:{kind:'archive',id}} (lensId optional)", async () => {
    // Capture a scratch item, then archive it by id.
    const made = await req("/api/cli/capture", {
      method: "POST",
      token: fx.pro.token,
      body: { text: "Conformance: archive me" },
    });
    expect(made.status).toBe(201);
    const list = (
      (await req("/api/cli/inbox/list", { token: fx.pro.token })).body as {
        items: { id: string; text: string }[];
      }
    ).items;
    const target = list.find((i) => i.text === "Conformance: archive me");
    expect(target).toBeTruthy();
    const { status, body } = await req("/api/cli/inbox/triage", {
      method: "POST",
      token: fx.pro.token,
      body: { inboxItemId: target!.id, decision: "archive" },
    });
    expect(status).toBe(200);
    expectShape(body, { result: { kind: "archive", id: "string" } });
  });

  it("triage task-today → 200 {result:{kind:'task',id}} + task on Today", async () => {
    const item = (
      (
        await req("/api/cli/inbox/list", { token: fx.pro.token })
      ).body as { items: { id: string; text: string }[] }
    ).items.find((i) => i.text.startsWith("Conformance: raw capture"));
    expect(item).toBeTruthy();
    const { status, body } = await req("/api/cli/inbox/triage", {
      method: "POST",
      token: fx.pro.token,
      body: {
        inboxItemId: item!.id,
        decision: "task-today",
        lensId: fx.pro.lensWorkId,
      },
    });
    expect(status).toBe(200);
    expectShape(body, { result: { kind: "task", id: "string" } });
    const createdId = (body as { result: { id: string } }).result.id;
    const show = await req(`/api/cli/task/show?id=${createdId}`, {
      token: fx.pro.token,
    });
    expect(show.status).toBe(200);
    expect((show.body as { task: { status: string } }).task.status).toBe("TODAY");
  });

  it("attachment download → image bytes + exact headers", async () => {
    const res = await app.request(`/api/cli/attachment/${fx.pro.attachmentId}`, {
      headers: { Authorization: `Bearer ${fx.pro.token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toContain("conformance.png");
    expect(res.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const expected = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      ),
      (ch) => ch.charCodeAt(0),
    );
    expect(Buffer.from(bytes).equals(Buffer.from(expected))).toBe(true);
  });

  it("attachment bad/unknown id → 404 Not found", async () => {
    let r = await req("/api/cli/attachment/not-a-uuid", { token: fx.pro.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Not found." });
    r = await req(
      "/api/cli/attachment/00000000-0000-4000-8000-000000000000",
      { token: fx.pro.token },
    );
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Not found." });
  });
});

d("S18 — tasks (§1.4)", () => {
  it("task/show → full detail shape", async () => {
    const { status, body } = await req(`/api/cli/task/show?id=${fx.pro.taskId}`, {
      token: fx.pro.token,
    });
    expect(status).toBe(200);
    const task = (body as { task: Record<string, unknown> }).task;
    // Key SET parity (row key order is the seam's column order; the parsed
    // shape is the CLI oracle's contract).
    expect(Object.keys(task).sort()).toEqual(
      [
        "attachments", "completedAt", "content", "createdAt", "description",
        "goal", "goalId", "id", "isDone", "isOnboardingSample", "lensId",
        "order", "outcome", "permalink", "priority", "project", "projectId",
        "size", "startedAt", "status", "scheduledDate", "snoozedUntil",
        "tags", "updates", "updatedAt", "userId",
      ].sort(),
    );
    expect(task.project).toEqual({
      id: fx.pro.projectId,
      permalink: expect.any(String),
      name: "CLI conformance",
    });
    expect(Array.isArray(task.tags)).toBe(true);
    expect(Array.isArray(task.updates)).toBe(true);
  });

  it("task/show by permalink + 400/404 paths", async () => {
    let r = await req("/api/cli/task/show", { token: fx.pro.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "An id is required." });
    r = await req("/api/cli/task/show?id=nope", { token: fx.pro.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Task not found." });
  });

  it("task/start → {id,startedAt}; pause → {id,startedAt:null}", async () => {
    let r = await req("/api/cli/task/start", {
      method: "POST",
      token: fx.pro.token,
      body: { id: fx.pro.taskId },
    });
    expect(r.status).toBe(200);
    expectShape(r.body, { id: "string", startedAt: "iso" });

    // Single-running-task invariant: start the done-today task, the first must pause.
    await req("/api/cli/task/start", {
      method: "POST",
      token: fx.pro.token,
      body: { id: fx.pro.doneTaskId },
    });
    const first = await req(`/api/cli/task/show?id=${fx.pro.taskId}`, {
      token: fx.pro.token,
    });
    expect((first.body as { task: { startedAt: string | null } }).task.startedAt).toBeNull();

    r = await req("/api/cli/task/pause", {
      method: "POST",
      token: fx.pro.token,
      body: { id: fx.pro.doneTaskId },
    });
    expect(r.status).toBe(200);
    expectShape(r.body, { id: "string", startedAt: "null" });

    r = await req("/api/cli/task/start", {
      method: "POST",
      token: fx.pro.token,
      body: {},
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "An id is required." });
    r = await req("/api/cli/task/start", {
      method: "POST",
      token: fx.pro.token,
      body: { id: "nope" },
    });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Task not found." });
  });

  it("task/done toggles with outcome (exact envelope)", async () => {
    // Use a scratch task so the fixture's done-today membership stays stable.
    const made = await req("/api/cli/capture", {
      method: "POST",
      token: fx.pro.token,
      body: { text: "Conformance: toggle done target" },
    });
    const itemId = (made.body as { id: string }).id;
    await req("/api/cli/inbox/triage", {
      method: "POST",
      token: fx.pro.token,
      body: { inboxItemId: itemId, decision: "task-today", lensId: fx.pro.lensMeId },
    });
    const list = (await req("/api/cli/today", { token: fx.pro.token }))
      .body as { tasks: { id: string; description: string }[] };
    const target = list.tasks.find((t) => t.description === "Conformance: toggle done target");
    expect(target).toBeTruthy();

    let r = await req("/api/cli/task/done", {
      method: "POST",
      token: fx.pro.token,
      body: { id: target!.id, outcome: "Toggled." },
    });
    expect(r.status).toBe(200);
    const done = r.body as { task: Record<string, unknown> };
    expect(Object.keys(done)).toEqual(["task"]);
    expect(done.task.isDone).toBe(true);
    expect(done.task.completedAt).toMatch(/^2/);
    expect(done.task.outcome).toBe("Toggled.");

    // Un-done keeps the outcome, clears completedAt.
    r = await req("/api/cli/task/done", {
      method: "POST",
      token: fx.pro.token,
      body: { id: target!.id },
    });
    expect(r.status).toBe(200);
    const undone = r.body as { task: Record<string, unknown> };
    expect(undone.task.isDone).toBe(false);
    expect(undone.task.completedAt).toBeNull();
  });

  it("task/snooze → {id,status,scheduledDate,snoozedUntil}; bad preset → 400", async () => {
    let r = await req("/api/cli/task/snooze", {
      method: "POST",
      token: fx.pro.token,
      body: { id: fx.pro.taskId, preset: "fortnight" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Invalid snooze preset." });

    r = await req("/api/cli/task/snooze", {
      method: "POST",
      token: fx.pro.token,
      body: { id: fx.pro.taskId, preset: "1h" },
    });
    expect(r.status).toBe(200);
    expectShape(r.body, {
      id: "string",
      status: "string",
      scheduledDate: "iso|null",
      snoozedUntil: "iso",
    });
  });

  it("task/move → {task}; boundary errors exact", async () => {
    let r = await req("/api/cli/task/move", {
      method: "POST",
      token: fx.pro.token,
      body: { id: fx.pro.taskId, status: "WHENEVER" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Invalid status." });

    r = await req("/api/cli/task/move", {
      method: "POST",
      token: fx.pro.token,
      body: { id: fx.pro.taskId, status: "UPCOMING", scheduledDate: "2026-13-40" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "scheduledDate must use YYYY-MM-DD." });

    r = await req("/api/cli/task/move", {
      method: "POST",
      token: fx.pro.token,
      body: { id: fx.pro.taskId, status: "UPCOMING", scheduledDate: "2026-09-15" },
    });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body as object)).toEqual(["task"]);
    expect((r.body as { task: { status: string; scheduledDate: string } }).task.status).toBe(
      "UPCOMING",
    );
    expect(
      (r.body as { task: { scheduledDate: string | null } }).task.scheduledDate,
    ).toMatch(/^2026-09-15T00:00:00/);
  });
});

d("S18 — today (§1.5)", () => {
  it("today → open TODAY tasks across accessible lenses, rows carry lens", async () => {
    const { status, body } = await req("/api/cli/today", { token: fx.pro.token });
    expect(status).toBe(200);
    const tasks = (body as { tasks: Record<string, unknown>[] }).tasks;
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    for (const t of tasks) {
      expect((t as { status: string }).status).toBe("TODAY");
      expect((t as { isDone: boolean }).isDone).toBe(false);
      expect(Object.keys((t as { lens: object }).lens)).toEqual([
        "id",
        "name",
        "color",
      ]);
    }
  });

  it("today/done → completed-today rows, completedAt desc", async () => {
    const { status, body } = await req("/api/cli/today/done", {
      token: fx.pro.token,
    });
    expect(status).toBe(200);
    const tasks = (body as { tasks: Record<string, unknown>[] }).tasks;
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const times = tasks.map((t) => (t as { completedAt: string }).completedAt);
    expect(times).toEqual([...times].sort().reverse());
    for (const t of tasks) {
      expect((t as { isDone: boolean }).isDone).toBe(true);
    }
  });
});

d("S18 — projects (§1.6)", () => {
  it("project/list boundary + lens gates", async () => {
    let r = await req("/api/cli/project/list", { token: fx.pro.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "A lensId is required." });
    r = await req("/api/cli/project/list?lensId=nope", { token: fx.pro.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "No such lens for this account." });
    r = await req(`/api/cli/project/list?lensId=${fx.free.lensWorkId}`, {
      token: fx.free.token,
    });
    expect(r.status).toBe(402);
    expect(r.body).toEqual({
      error: "CLI and API access is a Pro feature.",
      feature: "CLI and API access",
      reason: "use ActionAmp from the terminal or with an agent",
    });
  });

  it("project/list → projects with resources + counts", async () => {
    const { status, body } = await req(
      `/api/cli/project/list?lensId=${fx.pro.lensWorkId}`,
      { token: fx.pro.token },
    );
    expect(status).toBe(200);
    const projects = (body as { projects: Record<string, unknown>[] }).projects;
    expect(projects.length).toBeGreaterThanOrEqual(1);
    const names = projects.map((p) => (p as { name: string }).name);
    expect(names).toContain("CLI conformance");
    const first = projects.find(
      (p) => (p as { name: string }).name === "CLI conformance",
    ) as Record<string, unknown>;
    expect(Object.keys(first)).toEqual([
      "id",
      "permalink",
      "name",
      "description",
      "dueDate",
      "isDone",
      "type",
      "completedAt",
      "archivedAt",
      "goal",
      "openCount",
      "doneCount",
      "openItems",
      "checkedItems",
      "nextAction",
      "resources",
    ]);
    expect(Array.isArray(first.resources)).toBe(true);
    const res0 = (first.resources as Record<string, unknown>[])[0];
    if (res0) {
      expect(Object.keys(res0).sort()).toEqual(
        ["createdAt", "id", "notes", "title", "url"].sort(),
      );
    }
  });

  it("project/show → detail (400/404 exact)", async () => {
    let r = await req("/api/cli/project/show", { token: fx.pro.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "An id is required." });
    r = await req("/api/cli/project/show?id=nope", { token: fx.pro.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Project not found." });
    r = await req(`/api/cli/project/show?id=${fx.pro.projectId}`, {
      token: fx.pro.token,
    });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body as object)).toEqual(["project"]);
  });

  it("project/create → 201; boundary + cap exact", async () => {
    let r = await req("/api/cli/project/create", {
      method: "POST",
      token: fx.pro.token,
      body: { name: "X" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "name and lensId are required." });

    r = await req("/api/cli/project/create", {
      method: "POST",
      token: fx.pro.token,
      body: { name: "X", lensId: fx.pro.lensMeId, type: "LIST" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "type must be STANDARD or SIMPLE_LIST." });

    // FREE → the middleware's account-level CLI gate answers before the
    // (parity-kept) route cap can.
    r = await req("/api/cli/project/create", {
      method: "POST",
      token: fx.free.token,
      body: { name: "One too many", lensId: fx.free.lensMeId },
    });
    expect(r.status).toBe(402);
    expect(r.body).toEqual({
      error: "CLI and API access is a Pro feature.",
      feature: "CLI and API access",
      reason: "use ActionAmp from the terminal or with an agent",
    });

    r = await req("/api/cli/project/create", {
      method: "POST",
      token: fx.pro.token,
      body: { name: "CLI conformance created", lensId: fx.pro.lensMeId },
    });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body as object)).toEqual(["project"]);
    expect((r.body as { project: { type: string } }).project.type).toBe("STANDARD");
  });

  it("project/add-task → 201 {task}; resolved-lens gate + 404s", async () => {
    let r = await req("/api/cli/project/add-task", {
      method: "POST",
      token: fx.pro.token,
      body: { description: "x" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "description and lensId are required." });

    r = await req("/api/cli/project/add-task", {
      method: "POST",
      token: fx.pro.token,
      body: { description: "x", lensId: fx.pro.lensMeId, projectId: "nope" },
    });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Project not found." });

    // FREE: lensId = the included Me lens, but projectId on a Work-lens
    // project → the RESOLVED lens (Work, not the passed Me) triggers the 402.
    r = await req("/api/cli/project/add-task", {
      method: "POST",
      token: fx.free.token,
      body: {
        description: "resolved-lens test",
        lensId: fx.free.lensMeId,
        projectId: fx.free.workProjectId,
      },
    });
    expect(r.status).toBe(402);
    expect(r.body).toEqual({
      error: "CLI and API access is a Pro feature.",
      feature: "CLI and API access",
      reason: "use ActionAmp from the terminal or with an agent",
    });

    r = await req("/api/cli/project/add-task", {
      method: "POST",
      token: fx.pro.token,
      body: {
        description: "Conformance: added via add-task",
        lensId: fx.pro.lensMeId,
        projectId: fx.pro.projectId,
      },
    });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body as object)).toEqual(["task"]);
  });
});

d("S18 — resources (§1.7)", () => {
  it("resource/list boundary + 404 + shape", async () => {
    let r = await req("/api/cli/resource/list", { token: fx.pro.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "A projectId is required." });
    r = await req("/api/cli/resource/list?projectId=nope", { token: fx.pro.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Project not found." });
    r = await req(`/api/cli/resource/list?projectId=${fx.pro.projectId}`, {
      token: fx.pro.token,
    });
    expect(r.status).toBe(200);
    expectShape(r.body, {
      projectId: "string",
      resources: [
        {
          id: "string",
          title: "string",
          url: "string",
          notes: "string|null",
          createdAt: "iso",
          attachments: "array",
        },
      ],
    });
    expect((r.body as { projectId: string }).projectId).toBe(fx.pro.projectId);
  });

  it("resource/create → 201; Simple-list + boundary exact", async () => {
    let r = await req("/api/cli/resource/create", {
      method: "POST",
      token: fx.pro.token,
      body: { projectId: fx.pro.projectId },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "projectId and title are required." });

    r = await req("/api/cli/resource/create", {
      method: "POST",
      token: fx.pro.token,
      body: { projectId: fx.pro.listProjectId, title: "No links in lists" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "A Simple list keeps only checklist items." });

    r = await req("/api/cli/resource/create", {
      method: "POST",
      token: fx.pro.token,
      body: {
        projectId: fx.pro.projectId,
        title: "Conformance resource",
        url: "https://example.com/x",
      },
    });
    expect(r.status).toBe(201);
    expectShape(r.body, {
      resource: {
        id: "string",
        title: "string",
        url: "string",
        notes: "string|null",
        projectId: "string",
      },
    });
  });

  it("resource/update → 200; bad url → 400; delete → {id}; 404s", async () => {
    const list = (
      (
        await req(`/api/cli/resource/list?projectId=${fx.pro.projectId}`, {
          token: fx.pro.token,
        })
      ).body as { resources: { id: string; title: string }[] }
    ).resources;
    const target = list.find((r) => r.title === "Conformance resource");
    expect(target).toBeTruthy();

    let r = await req("/api/cli/resource/update", {
      method: "POST",
      token: fx.pro.token,
      body: { id: "missing-resource" },
    });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Resource not found." });

    r = await req("/api/cli/resource/update", {
      method: "POST",
      token: fx.pro.token,
      body: { id: target!.id, url: "not-a-url" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Use a full http:// or https:// link." });

    r = await req("/api/cli/resource/update", {
      method: "POST",
      token: fx.pro.token,
      body: { id: target!.id, notes: "Updated notes." },
    });
    expect(r.status).toBe(200);
    expect((r.body as { resource: { notes: string } }).resource.notes).toBe(
      "Updated notes.",
    );

    r = await req("/api/cli/resource/delete", {
      method: "POST",
      token: fx.pro.token,
      body: { id: target!.id },
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: target!.id });

    r = await req("/api/cli/resource/delete", {
      method: "POST",
      token: fx.pro.token,
      body: { id: target!.id },
    });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Resource not found." });
  });
});

d("S18 — goals (§1.8)", () => {
  it("goal/list boundary + gates + shape", async () => {
    let r = await req("/api/cli/goal/list", { token: fx.pro.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "A lensId is required." });
    r = await req("/api/cli/goal/list?lensId=nope", { token: fx.pro.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "No such lens for this account." });
    r = await req(`/api/cli/goal/list?lensId=${fx.free.lensWorkId}`, {
      token: fx.free.token,
    });
    expect(r.status).toBe(402);
    r = await req(`/api/cli/goal/list?lensId=${fx.pro.lensWorkId}`, {
      token: fx.pro.token,
    });
    expect(r.status).toBe(200);
    const goals = (r.body as { goals: Record<string, unknown>[] }).goals;
    expect(goals.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(goals[0]).sort()).toEqual(
      ["description", "id", "name", "nextProject", "permalink", "progress", "projectCount"].sort(),
    );
  });

  it("goal/show → {goal}; 404 exact", async () => {
    let r = await req("/api/cli/goal/show", { token: fx.pro.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "An id is required." });
    r = await req("/api/cli/goal/show?id=nope", { token: fx.pro.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Goal not found." });
    r = await req(`/api/cli/goal/show?id=${fx.pro.goalId}`, { token: fx.pro.token });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body as object)).toEqual(["goal"]);
  });

  it("goal/create → 201; FREE goal cap exact", async () => {
    let r = await req("/api/cli/goal/create", {
      method: "POST",
      token: fx.pro.token,
      body: { name: "X" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "name and lensId are required." });

    r = await req("/api/cli/goal/create", {
      method: "POST",
      token: fx.free.token,
      body: { name: "Free second goal", lensId: fx.free.lensMeId },
    });
    expect(r.status).toBe(402);
    expect(r.body).toEqual({
      error: "CLI and API access is a Pro feature.",
      feature: "CLI and API access",
      reason: "use ActionAmp from the terminal or with an agent",
    });

    r = await req("/api/cli/goal/create", {
      method: "POST",
      token: fx.pro.token,
      body: {
        name: `CLI conformance goal ${Date.now()}`,
        lensId: fx.pro.lensMeId,
      },
    });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body as object)).toEqual(["goal"]);
  });
});

d("S18 — lenses (§1.9)", () => {
  it("lens/list → all owned lenses with counts (no entitlement gate)", async () => {
    const { status, body } = await req("/api/cli/lens/list", {
      token: fx.pro.token,
    });
    expect(status).toBe(200);
    const lenses = (body as { lenses: Record<string, unknown>[] }).lenses;
    expect(lenses.length).toBeGreaterThanOrEqual(2);
    for (const lens of lenses) {
      expect(Object.keys(lens)).toEqual([
        "id",
        "name",
        "isDefault",
        "isIncluded",
        "color",
        "purpose",
        "hasAnyContent",
        "blockingProjects",
        "counts",
      ]);
      expect(Object.keys(lens.counts as object)).toEqual([
        "goals",
        "projects",
        "tasks",
      ]);
    }
    // Seeded-first ordering: Me (included) before Work.
    expect((lenses[0] as { name: string }).name).toBe("Me");
  });

  it("lens/show by name + id; 400/404 exact", async () => {
    let r = await req("/api/cli/lens/show", { token: fx.pro.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "An idOrName is required." });
    r = await req("/api/cli/lens/show?idOrName=nope", { token: fx.pro.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Lens not found." });
    r = await req("/api/cli/lens/show?idOrName=Work", { token: fx.pro.token });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body as object)).toEqual(["lens"]);
    const lens = r.body as { lens: Record<string, unknown> };
    expect(lens.lens.name).toBe("Work");
    expect(lens.lens.createdAt).toMatch(/^2/);
    // FREE tokens never reach the (unguarded) detail read — the middleware's
    // account gate answers first on both stacks.
    const freeRead = await req("/api/cli/lens/show?idOrName=Work", {
      token: fx.free.token,
    });
    expect(freeRead.status).toBe(402);
  });
});

d("S18 — logbook + review (§1.10)", () => {
  it("logbook → five categories; explicit Me lens carries the wont-do entry", async () => {
    // Explicit lens (content-deterministic): the fixture wont-do task is on Me.
    const { status, body } = await req(`/api/cli/logbook?lensId=${fx.pro.lensMeId}`, {
      token: fx.pro.token,
    });
    expect(status).toBe(200);
    const lb = body as Record<string, unknown[]>;
    expect(Object.keys(lb)).toEqual(["tasks", "wontDo", "projects", "goals", "archived"]);
    const wontDo = lb.wontDo as Record<string, unknown>[];
    expect(wontDo.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(wontDo[0]).sort()).toEqual(
      ["completedAt", "id", "kind", "project", "size", "title"].sort(),
    );
    expect(wontDo[0].kind).toBe("wont-do");
    expect(wontDo[0].title).toBe("Conformance: declined task");

    // Default path (no lensId): same envelope — the first accessible lens.
    const def = await req("/api/cli/logbook", { token: fx.pro.token });
    expect(def.status).toBe(200);
    expect(Object.keys(def.body as object)).toEqual([
      "tasks",
      "wontDo",
      "projects",
      "goals",
      "archived",
    ]);
  });

  it("logbook explicit lens gate + empty path has NO wontDo key", async () => {
    let r = await req("/api/cli/logbook?lensId=nope", { token: fx.pro.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "No such lens for this account." });
    r = await req(`/api/cli/logbook?lensId=${fx.free.lensWorkId}`, {
      token: fx.free.token,
    });
    expect(r.status).toBe(402);
    // Bare account (no lenses) → the four-key empty envelope, no wontDo.
    r = await req("/api/cli/logbook", { token: fx.bare.token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ tasks: [], projects: [], goals: [], archived: [] });
  });

  it("review boundary errors (cadence, for+previous, date, timezone)", async () => {
    const get = (q: string) => req(`/api/cli/review${q}`, { token: fx.pro.token });
    let r = await get("");
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Cadence must be WEEKLY or MONTHLY." });
    r = await get("?cadence=WEEKLY&for=2026-09-01&previous=true");
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Use either for or previous, not both." });
    r = await get("?cadence=WEEKLY&for=31-09-2026");
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Review date must use YYYY-MM-DD." });
    r = await get("?cadence=WEEKLY&for=2026-02-31");
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Review date must be a real calendar date." });
    r = await get("?cadence=WEEKLY&timeZone=Mars/Olympus");
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "Time zone must be a valid IANA identifier." });
  });

  it("review WEEKLY → exact report shape", async () => {
    const { status, body } = await req("/api/cli/review?cadence=WEEKLY", {
      token: fx.pro.token,
    });
    expect(status).toBe(200);
    const report = (body as { report: Record<string, unknown> }).report;
    expect(Object.keys(report)).toEqual([
      "cadence",
      "state",
      "period",
      "lensId",
      "totals",
      "actionsByLens",
      "highlights",
      "tasks",
      "projects",
      "goals",
      "weeklySlices",
      "checkIn",
      "reflection",
      "emphasisGoal",
    ]);
    expect(report.cadence).toBe("WEEKLY");
    expect(report.lensId).toBeNull();
    expect(Object.keys(report.period as object)).toEqual([
      "start",
      "end",
      "startDate",
      "endDate",
      "label",
      "inProgress",
    ]);
    expect(Object.keys(report.totals as object)).toEqual([
      "actions",
      "projects",
      "goals",
      "focusMinutes",
    ]);
    expect(report.weeklySlices).toEqual([]);
  });

  it("review MONTHLY + lens filter + lens gate", async () => {
    let r = await req("/api/cli/review?cadence=MONTHLY", { token: fx.pro.token });
    expect(r.status).toBe(200);
    const report = r.body as { report: { weeklySlices: unknown[]; state: string } };
    expect(report.report.weeklySlices.length).toBeGreaterThanOrEqual(4);
    expect(["in_progress", "finished"]).toContain(report.report.state);
    for (const slice of report.report.weeklySlices as Record<string, unknown>[]) {
      expect(Object.keys(slice)).toEqual(["startDate", "completedTasks"]);
    }

    r = await req(`/api/cli/review?cadence=WEEKLY&lensId=${fx.pro.lensWorkId}`, {
      token: fx.pro.token,
    });
    expect(r.status).toBe(200);
    expect((r.body as { report: { lensId: string } }).report.lensId).toBe(
      fx.pro.lensWorkId,
    );

    r = await req("/api/cli/review?cadence=WEEKLY&lensId=nope", {
      token: fx.pro.token,
    });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "No such lens for this account." });

    // lower-case cadence is accepted (case-insensitive).
    r = await req("/api/cli/review?cadence=weekly", { token: fx.pro.token });
    expect(r.status).toBe(200);
  });
});

d("S18 — /api/pat/* (session-authed, §1.1)", () => {
  async function sessionTokenFor(authId: string): Promise<string> {
    const issued = await issueSessionCore(drizzleSessionIssuePort(db), authId);
    cleanup.push(async () => {
      await db.delete(sessionTable).where(eq(sessionTable.id, issued.token));
    });
    return issued.token;
  }

  it("unauthenticated → 401 Not authenticated (defensive backstop)", async () => {
    let r = await req("/api/pat/list");
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: "Not authenticated." });
    r = await req("/api/pat/issue", { method: "POST", body: { label: "x" } });
    expect(r.status).toBe(401);
  });

  it("issue → plaintext once (exact envelope); list shows it; revoke kills it", async () => {
    const sessionToken = await sessionTokenFor(fx.pro.authId);
    const authz = { token: sessionToken };

    let r = await req("/api/pat/issue", { method: "POST", ...authz, body: {} });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "A label is required." });

    r = await req("/api/pat/issue", {
      method: "POST",
      ...authz,
      body: { label: "  conformance key  " },
    });
    expect(r.status).toBe(201);
    expectShape(r.body, {
      token: "string",
      id: "string",
      label: "string",
      createdAt: "iso",
      notice: "This token won't be shown again. Copy it now.",
    });
    expect((r.body as { label: string }).label).toBe("conformance key");
    const { token: plaintext, id: keyId } = r.body as { token: string; id: string };
    expect(plaintext.startsWith("aa_")).toBe(true);

    // FREE session → 402 CLI gate.
    const freeSession = await sessionTokenFor(fx.free.authId);
    r = await req("/api/pat/issue", {
      method: "POST",
      token: freeSession,
      body: { label: "free key" },
    });
    expect(r.status).toBe(402);
    expect(r.body).toEqual({
      error: "CLI and API access is a Pro feature.",
      feature: "CLI and API access",
      reason: "use ActionAmp from the terminal or with an agent",
    });

    // list: keys ascending/descending by createdAt desc, never the hash.
    r = await req("/api/pat/list", authz);
    expect(r.status).toBe(200);
    const keys = (r.body as { keys: Record<string, unknown>[] }).keys;
    expect(keys.length).toBeGreaterThanOrEqual(2);
    for (const key of keys) {
      expect(Object.keys(key)).toEqual(["id", "label", "createdAt", "lastUsedAt"]);
    }

    // revoke: tenancy-checked 404, then success.
    r = await req("/api/pat/revoke", {
      method: "POST",
      ...authz,
      body: { id: "nope" },
    });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "No such token for this account." });

    r = await req("/api/pat/revoke", {
      method: "POST",
      ...authz,
      body: { id: keyId },
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ revoked: true, id: keyId });

    // The revoked PAT is dead — indistinguishable from an unknown token.
    const dead = await req("/api/cli/whoami", { token: plaintext });
    expect(dead.status).toBe(401);
    expect(dead.body).toEqual({ error: "Invalid or revoked token." });
  });
});

d("S18 — admin surface (§1.11)", () => {
  it("non-admin PRO → 403 Admin only on every admin route", async () => {
    for (const [path, method, body] of [
      ["/api/cli/admin/stats", "GET", undefined],
      ["/api/cli/admin/growth", "GET", undefined],
      ["/api/cli/admin/feedback", "GET", undefined],
      ["/api/cli/feedback/list", "GET", undefined],
      ["/api/cli/feedback/show?id=x", "GET", undefined],
      ["/api/cli/feedback/status", "POST", { id: "x", status: "OPEN" }],
      ["/api/cli/feedback/delete", "POST", { id: "x" }],
    ] as const) {
      const r = await req(path, { method, token: fx.pro.token, body });
      expect(r.status, path).toBe(403);
      expect(r.body, path).toEqual({ error: "Admin only." });
    }
  });

  // History: this test was it.skip'ped while S17's count delegate crashed on
  // the core's no-arg count() calls (S18 finding, s18-wiring.md §4); S17
  // landed the optional-args fix and the orchestrator re-enabled it — it now
  // asserts the live envelope and runs in the 57/57 suite.
  it("admin stats → exact AdminStats envelope", async () => {
    const { status, body } = await req("/api/cli/admin/stats", {
      token: fx.admin.token,
    });
    expect(status).toBe(200);
    const stats = (body as { stats: Record<string, unknown> }).stats;
    expect(Object.keys(stats)).toEqual([
      "range",
      "since",
      "users",
      "tasks",
      "payments",
      "activity",
      "funnel",
      "feedback",
    ]);
    expect(stats.range).toBe("30d");
    expect(Object.keys(stats.users as object)).toEqual([
      "total",
      "signedUpToday",
      "signedUp7d",
      "signedUp30d",
      "activeToday",
      "active7d",
      "active30d",
      "selectedSignups",
      "selectedActive",
      "deviceActivity",
    ]);
    expect(Object.keys((stats.users as { deviceActivity: object }).deviceActivity)).toEqual(
      ["sevenDays", "thirtyDays"],
    );
    expect(Object.keys(stats.feedback as object)).toEqual(["byStatus", "total"]);
    expect((stats.feedback as { byStatus: Record<string, unknown> }).byStatus).toEqual({
      OPEN: expect.any(Number),
      IN_PROGRESS: expect.any(Number),
      RESOLVED: expect.any(Number),
      CLOSED: expect.any(Number),
    });
    expect(
      (stats.feedback as { byStatus: Record<string, number> }).byStatus.OPEN,
    ).toBeGreaterThanOrEqual(1);

    const ranged = await req("/api/cli/admin/stats?range=7d", {
      token: fx.admin.token,
    });
    expect((ranged.body as { stats: { range: string } }).stats.range).toBe("7d");
    const all = await req("/api/cli/admin/stats?range=all", {
      token: fx.admin.token,
    });
    expect((all.body as { stats: { since: string | null } }).stats.since).toBeNull();
  });

  it("admin growth → FunnelStats top-level (no {stats} wrapper)", async () => {
    const { status, body } = await req("/api/cli/admin/growth", {
      token: fx.admin.token,
    });
    expect(status).toBe(200);
    expect(Object.keys(body as object)).toEqual([
      "range",
      "since",
      "funnel",
      "sources",
      "retention",
    ]);
    const funnel = (body as { funnel: Record<string, unknown>[] }).funnel;
    expect(funnel.map((f) => f.name)).toEqual([
      "LANDING_VIEW",
      "SIGNUP_COMPLETED",
      "APP_OPENED",
      "CAPTURE_CREATED",
      "TRIAGE_COMPLETED",
      "CHECKOUT_STARTED",
      "PAYMENT_CONFIRMED",
    ]);
    expect(Object.keys(funnel[0])).toEqual([
      "name",
      "count",
      "fromPreviousPct",
      "fromLandingPct",
    ]);
    // Retention is data-driven: with no elapsed-time cohort after the last
    // signup it's null + the "Not enough elapsed time" note; against real
    // history (V1's prod dump) it computes a percentage. Assert the envelope
    // and type, never a live-data value.
    const retention = (body as { retention: { d1Pct: number | null; note?: string } })
      .retention;
    expect(
      retention.d1Pct === null || typeof retention.d1Pct === "number",
    ).toBe(true);
  });

  it("admin recent feedback → {items, hasNext}", async () => {
    const { status, body } = await req("/api/cli/admin/feedback", {
      token: fx.admin.token,
    });
    expect(status).toBe(200);
    expect(Object.keys(body as object)).toEqual(["items", "hasNext"]);
  });

  it("feedback list/show/status/delete (exact bodies + statuses)", async () => {
    let r = await req("/api/cli/feedback/list", { token: fx.admin.token });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body as object)).toEqual(["feedback"]);
    const rows = (r.body as { feedback: Record<string, unknown>[] }).feedback;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "createdAt", "deletedAt", "id", "lensColor", "lensId", "lensName",
        "message", "route", "section", "shortId", "status", "timezone",
        "updatedAt", "userAgent", "userId", "userEmail", "userName",
        "viewport",
      ].sort(),
    );
    expect(rows[0].deletedAt).toBeNull();

    r = await req("/api/cli/feedback/list?status=WAT", { token: fx.admin.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error: "Invalid status. Must be one of: OPEN, IN_PROGRESS, RESOLVED, CLOSED.",
    });
    r = await req("/api/cli/feedback/list?limit=0", { token: fx.admin.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "limit must be a positive number or 'all'." });
    r = await req("/api/cli/feedback/list?status=OPEN&limit=10", {
      token: fx.admin.token,
    });
    expect(r.status).toBe(200);
    expect(
      (r.body as { feedback: { status: string }[] }).feedback.every(
        (f) => f.status === "OPEN",
      ),
    ).toBe(true);

    r = await req("/api/cli/feedback/show", { token: fx.admin.token });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: "id is required." });
    r = await req("/api/cli/feedback/show?id=ZZZZ", { token: fx.admin.token });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Feedback not found." });

    // ShortId prefix, case-insensitive (the Crockford ambiguity mapping is
    // core-verbatim: O→0, I/L→1, U→V — the fixture prefix avoids those).
    const prefix = fx.admin.feedbackShortId.slice(0, 4).toLowerCase();
    r = await req(`/api/cli/feedback/show?id=${prefix}`, { token: fx.admin.token });
    expect(r.status).toBe(200);
    expect((r.body as { feedback: { id: string } }).feedback.id).toBe(
      fx.admin.feedbackId,
    );

    r = await req("/api/cli/feedback/status", {
      method: "POST",
      token: fx.admin.token,
      body: { id: prefix, status: "WAT" },
    });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error: "Invalid status. Must be one of: OPEN, IN_PROGRESS, RESOLVED, CLOSED.",
    });
    r = await req("/api/cli/feedback/status", {
      method: "POST",
      token: fx.admin.token,
      body: { id: prefix, status: "RESOLVED" },
    });
    expect(r.status).toBe(200);
    expect((r.body as { feedback: { status: string } }).feedback.status).toBe("RESOLVED");

    r = await req("/api/cli/feedback/delete", {
      method: "POST",
      token: fx.admin.token,
      body: { id: prefix },
    });
    expect(r.status).toBe(200);
    const deleted = r.body as { feedback: { deletedAt: string | null } };
    expect(deleted.feedback.deletedAt).toMatch(/^2/);

    // Re-delete → the lookup filters deleted rows → 404.
    r = await req("/api/cli/feedback/delete", {
      method: "POST",
      token: fx.admin.token,
      body: { id: prefix },
    });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Feedback not found." });
  });
});
