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

// Readiness — stable shape F8b extends with a real DB ping.
// TODO(F8b): ping the DB (Drizzle/pg client from @actionamp/domain) and report
//   200 {ok:true, db:"up"} / 503 {ok:false, db:"down"}. Keep this JSON shape;
//   `db` stays a string status. Until then db is "unchecked".
app.get("/ready", (c) => c.json({ ok: true, db: "unchecked" }));

// --- future route mounts ------------------------------------------------------

// TODO(F8+): mount the oRPC handler at /rpc, e.g.
//   import { HonoRPC } ... app.use("/rpc/*", ...oRPC Hono adapter...)
// TODO(F8+): REST routes under /api/* (app.route("/api", apiRoutes)).

// --- 404 fallback ---------------------------------------------------------------

app.notFound((c) => c.json({ error: { code: "NOT_FOUND" } }, 404));

// --- serve ----------------------------------------------------------------------

const port = Number(process.env.PORT ?? 8080);
const server = Bun.serve({ port, fetch: app.fetch });
logLine("info", { event: "startup", port: server.port, pid: process.pid });
