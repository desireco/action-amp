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
import { eq } from "drizzle-orm";
import {
  apiKey,
  createDb,
  createEntities,
} from "@actionamp/domain/db";
import { databaseUrl } from "./db.js";
import { router } from "./router.js";
import {
  drizzlePatLookupPort,
  generatePat,
  hashToken,
} from "./auth/pat.js";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  drizzleSessionAuthPort,
} from "./auth/session.js";
import { resolveActingUser } from "./auth/resolve.js";
import { ensureEmailUser, seedSessionForEmail } from "./auth/seed-session.js";

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

// F10 auth ports — built once over the same db handle as the entities.
const sessionPort = drizzleSessionAuthPort(db);
const patPort = drizzlePatLookupPort(db);

app.use("/rpc/*", async (c, next) => {
  // F10: resolve the acting user BEFORE the oRPC handler runs — cookie/
  // Bearer session tokens via F10a, `aa_` PATs via F10b. The resolution may
  // short-circuit with the webapp's exact PAT error bodies (401/402) or the
  // CSRF 403; otherwise the user (or null) rides into context and handlers
  // enforce via requireUser (typed oRPC UNAUTHORIZED → 401).
  const resolution = await resolveActingUser(
    { sessionPort, patPort },
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
  const user =
    resolution.kind === "authenticated" ? resolution.user : null;
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: { db, entities, user },
  });
  if (matched) return c.newResponse(response.body, response);
  await next();
});

// TODO(F8+): REST routes under /api/* (app.route("/api", apiRoutes)).

// --- dev login (F10c) -----------------------------------------------------------
// The devEmail= equivalent: mints a real session for an email and stamps the
// wasp_session cookie — how Playwright/e2e and curl log in without any
// password plumbing. Hard-gated to NODE_ENV === "development" (exact webapp
// devAutologin.ts:20-24 semantics); any other environment sees a 404.
app.post("/api/dev/login", async (c) => {
  if (process.env.NODE_ENV !== "development") {
    return c.json({ error: { code: "NOT_FOUND" } }, 404);
  }

  const raw = c.req.query("email") ?? "";
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "Enter a valid email." }, 400);
  }

  const seeded = await seedSessionForEmail(db, email);
  // Dev-only route (the NODE_ENV guard above), so no Secure attribute — prod
  // stamping is S10's job and mirrors webapp/src/auth/sessionCookie.ts.
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${seeded.token}; HttpOnly; Path=/; ` +
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax`,
  );
  return c.json({
    sessionId: seeded.token,
    user: { id: seeded.userId, email: seeded.email },
  });
});

// --- dev PAT mint (F10c test fixture) ---------------------------------------------
// Same gate as dev login: issues an `aa_` PAT for an email and returns the
// plaintext exactly once (only the hash is stored, so it can't be recovered
// later — same as the real issue flow). Lets e2e exercise the Bearer path.
app.post("/api/dev/pat", async (c) => {
  if (process.env.NODE_ENV !== "development") {
    return c.json({ error: { code: "NOT_FOUND" } }, 404);
  }

  const raw = c.req.query("email") ?? "";
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "Enter a valid email." }, 400);
  }

  const seededUser = await ensureEmailUser(db, email);
  const plaintext = generatePat();
  await db.insert(apiKey).values({
    id: crypto.randomUUID(),
    hashedToken: hashToken(plaintext),
    label: "dev-login fixture",
    userId: seededUser.userId,
  });
  return c.json({ token: plaintext, user: seededUser });
});

// Dev-only cleanup twin for the fixture above (keeps the DB clean after runs).
app.delete("/api/dev/pat", async (c) => {
  if (process.env.NODE_ENV !== "development") {
    return c.json({ error: { code: "NOT_FOUND" } }, 404);
  }
  const plaintext = c.req.query("token") ?? "";
  await db.delete(apiKey).where(eq(apiKey.hashedToken, hashToken(plaintext)));
  return c.json({ ok: true });
});

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
