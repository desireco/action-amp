/**
 * ActionAmp API server — Hono app served by Bun.
 *
 * Dev: `bun --hot src/index.ts` (edit-and-save reloads; no process restart).
 *
 * Log format: one JSON line per event on stdout
 *   request:  {ts, level:"info", reqId, method, path, status, durationMs}
 *   error:    {ts, level:"error", reqId, error}
 *   startup:  {ts, level:"info", event:"startup", port, pid}
 */
import { Hono } from "hono";
import { RPCHandler } from "@orpc/server/fetch";
import { createDb, createEntities } from "@actionamp/domain/db";
import { databaseUrl } from "./db.js";
import { router } from "./router.js";

// --- the domain seam, built once, reused by every request --------------------
// `entities` is the Prisma-shaped delegate object every @actionamp/domain core
// takes as its first argument. The postgres.js client connects lazily; the
// first query (e.g. /ready) opens the socket. Closed on shutdown, below.
const db = createDb(databaseUrl());
const entities = createEntities(db);

type AppEnv = { Variables: { reqId: string } };

const app = new Hono<AppEnv>();

/** Emit a single JSON log line to stdout. */
function logLine(level: "info" | "error", fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, ...fields }));
}

// --- request ID + access logging -------------------------------------------

app.use("*", async (c, next) => {
  const reqId = crypto.randomUUID();
  c.set("reqId", reqId);
  const start = performance.now();
  await next();
  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  logLine("info", {
    reqId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
  });
  c.res.headers.set("x-request-id", reqId);
});

// --- global error handler ----------------------------------------------------

app.onError((err, c) => {
  const reqId = c.get("reqId") ?? crypto.randomUUID();
  // Name + message only — never the stack.
  logLine("error", {
    reqId,
    error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  });
  return c.json({ error: { code: "INTERNAL" } }, 500);
});

// --- health endpoints ---------------------------------------------------------

// Liveness — no dependencies.
app.get("/health", (c) => c.json({ ok: true }));

// Readiness — a scalar ping through postgres (the seam's own client; no
// temporal values cross this path, so the raw-client timezone trap in
// docs/plans/tasks-port-inventory.md §7 does not apply).
app.get("/ready", async (c) => {
  try {
    await db.$client`select 1`;
    return c.json({ ok: true, db: "up" });
  } catch {
    return c.json({ ok: false, db: "down" }, 503);
  }
});

// --- oRPC /rpc mount ----------------------------------------------------------
// The fetch-handler pattern: RPCHandler speaks the oRPC RPC protocol over
// standard fetch Requests, so Hono hands it `c.req.raw` and forwards the
// Response when a procedure matches. `prefix` strips /rpc so /rpc/tasks/list
// resolves to procedure tasks.list.
const rpcHandler = new RPCHandler(router);

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: { db, entities },
  });
  if (matched) return c.newResponse(response.body, response);
  await next();
});

// TODO(F8+): REST routes under /api/* (app.route("/api", apiRoutes)).

// --- 404 fallback ---------------------------------------------------------------

app.notFound((c) => c.json({ error: { code: "NOT_FOUND" } }, 404));

// --- serve ----------------------------------------------------------------------

const port = Number(process.env.PORT ?? 8080);
const server = Bun.serve({ port, fetch: app.fetch });
logLine("info", { event: "startup", port: server.port, pid: process.pid });

// Graceful shutdown: close the DB pool so `--hot` reloads and SIGINTs never
// leak sockets.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    db.$client.end().finally(() => process.exit(0));
  });
}
