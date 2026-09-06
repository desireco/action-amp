/**
 * ActionAmp API server — Hono app served by Bun.
 *
 * Dev: `bun --hot src/index.ts` (edit-and-save reloads; no process restart).
 *
 * Logs (see logger.ts): human-readable colored lines in development, one JSON
 * line per event in production (NODE_ENV=production or LOG_FORMAT=json).
 * Every request line carries WHO called (acting-user email from the F10
 * resolution) and WHAT (method + path + outcome).
 */
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { logEvent, logRequest } from "./logger.js";
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
  TOKEN_PREFIX,
  drizzlePatLookupPort,
  generatePat,
  hashToken,
  readBearerToken,
} from "./auth/pat.js";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  drizzleSessionAuthPort,
  readSessionCookie,
} from "./auth/session.js";
import { resolveActingUser } from "./auth/resolve.js";
import { ensureEmailUser, seedSessionForEmail } from "./auth/seed-session.js";
// S10 — magic login + issuance cores (the /api/auth/* live surface below; the
// same cores back the /rpc/auth/* procedures fragment).
import {
  AuthHttpError,
  drizzleMagicRequestPort,
  drizzleMagicVerifyPort,
  requestMagicLoginCore,
  resolveMagicEnv,
  verifyMagicLoginCore,
} from "./auth/magic.js";
import {
  clearSessionCookieHeader,
  drizzleSessionIssuePort,
  sessionCookieHeader,
} from "./auth/issue.js";
import { sendMagicLoginEmail } from "./email.js";
// S12 — share target + the daily-reminder job (docs/plans/slices/s12-s14-wiring.md).
import { createShareRoute } from "./share.js";
import { startDailyReminderScheduler } from "./push.js";
import { cliAccessViolation, isEntitled } from "@actionamp/domain/billing";

// --- the domain seam, built once, reused by every request --------------------
// `entities` is the Prisma-shaped delegate object every @actionamp/domain core
// takes as its first argument. The postgres.js client connects lazily; the
// first query (e.g. /ready) opens the socket. Closed on shutdown, below.
const db = createDb(databaseUrl());
const entities = createEntities(db);

// Single-service production deploy: when WEB_DIST_DIR points at the built
// web app, the API serves the SPA at "/" (one origin, one domain to flip).
import { existsSync } from "node:fs";
const webDist = process.env.WEB_DIST_DIR ?? "";
const servingSpa = Boolean(webDist) && existsSync(webDist);

type AppEnv = { Variables: { reqId: string; actingEmail: string | null } };

const app = new Hono<AppEnv>();

// --- request ID + access logging --------------------------------------------
// WHO (acting-user email, set by the /rpc auth wrapper below) + WHAT (method,
// path, outcome) on every line. Health polls are silent unless failing.

app.use("*", async (c, next) => {
  const reqId = crypto.randomUUID();
  c.set("reqId", reqId);
  const start = performance.now();
  await next();
  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  logRequest({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
    user: c.get("actingEmail") ?? null,
  });
  c.res.headers.set("x-request-id", reqId);
});

// --- global error handler ----------------------------------------------------

app.onError((err, c) => {
  logEvent("error", `${c.req.method} ${c.req.path} — ${err.message || err.name}`);
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
  c.set("actingEmail", user?.email ?? null);
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: { db, entities, user },
  });
  if (matched) return c.newResponse(response.body, response);
  await next();
});

// S13/S15 slice wiring — the public REST fragment: GET /founding-100/status
// (Cache-Control + actionamp.com CORS), GET / (marketing redirect), and
// POST /api/analytics/event (FunnelTracker ingest). See
// docs/plans/slices/s13-s15-wiring.md §2.
import { createPublicRest } from "./procedures/public.js";
app.route("/", createPublicRest({ db, entities, serveSpaRedirect: servingSpa }));

// S17 slice wiring — the /api/cli/feedback/* + /api/cli/admin/* PAT routes
// (REST mounts, the admin-cli's exact paths; see docs/plans/slices/s17-wiring.md §3).
import { createCliRest } from "./cli-routes.js";
app.route("/", createCliRest({ db, entities }));

// S18 slice wiring — the 27 non-admin /api/cli/* routes + /api/pat/* (the
// conformance suite's own launcher uses this same composition; see
// docs/plans/slices/s18-wiring.md).
import { createCliRoutes } from "./cli/routes.js";
app.route("/", createCliRoutes({ db, entities }));

// S16 slice wiring — the Stripe webhook: POST /webhooks/stripe (raw-body
// signature verification; the ONLY writer of User.plan/planRenewsAt). See
// docs/plans/slices/s16-wiring.md §1.
import { createStripeWebhookRoute } from "./webhooks-stripe.js";
app.route("/", createStripeWebhookRoute({ db, entities }));

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

// --- S10 auth surface (magic login + issuance) ---------------------------------
// The LIVE login surface: REST twins of the auth procedures fragment, sharing
// the SAME cores (src/auth/magic.ts + issue.ts). They exist as REST routes
// because the login response must STAMP the `wasp_session` cookie
// (sessionCookie.ts parity) and an oRPC procedure cannot Set-Cookie through
// the RPCHandler response path — see docs/plans/slices/s10-wiring.md §2.
//
// All five ride resolveActingUser first so the transport rules stay uniform
// with /rpc (Bearer/cookie precedence; the CSRF header requirement on
// cookie-authed mutations; exact PAT error bodies). Magic-login ops ignore the
// resolved user — they are anonymous by design (Wasp `auth: false`); logout is
// anonymous-tolerant (idempotent — see its route comment).

/** AuthHttpError → the webapp's exact {error} body + status. */
function authError(c: { json: (body: unknown, status: number) => Response }, err: unknown) {
  if (err instanceof AuthHttpError) {
    return c.json({ error: err.message }, err.status);
  }
  throw err instanceof Error ? err : new Error(String(err));
}

/**
 * The raw session token that rode the request (Bearer wins over cookie — the
 * same precedence resolveActingUser applies). Used to re-stamp the sliding
 * cookie on authenticated 2xx responses; null when the request carried none.
 */
function requestSessionToken(
  authorization: string | undefined,
  cookie: string | undefined,
): string | null {
  const bearer = readBearerToken(authorization);
  if (authorization && authorization !== "" && bearer && !bearer.startsWith(TOKEN_PREFIX)) {
    return bearer;
  }
  return readSessionCookie(cookie) ?? null;
}

app.post("/api/auth/request-magic-login", async (c) => {
  try {
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
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: unknown;
      returnTo?: unknown;
    };
    const sent = await requestMagicLoginCore(
      drizzleMagicRequestPort(db, sendMagicLoginEmail),
      {
        email: typeof body.email === "string" ? body.email : "",
        returnTo: typeof body.returnTo === "string" ? body.returnTo : undefined,
      },
      resolveMagicEnv(),
    );
    return c.json(sent);
  } catch (err) {
    return authError(c, err);
  }
});

app.post("/api/auth/verify-magic-login", async (c) => {
  try {
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
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: unknown;
      code?: unknown;
      token?: unknown;
    };
    const { sessionId } = await verifyMagicLoginCore(
      drizzleMagicVerifyPort(db),
      {
        email: typeof body.email === "string" ? body.email : undefined,
        code: typeof body.code === "string" ? body.code : undefined,
        token: typeof body.token === "string" ? body.token : undefined,
      },
      resolveMagicEnv(),
      drizzleSessionIssuePort(db),
    );
    // The ActionAmp cookie layer (sessionCookie.ts write side): stamped on
    // login 2xx — httpOnly, SameSite=Lax, Path=/, Max-Age 30d, +Secure prod.
    c.header("Set-Cookie", sessionCookieHeader(sessionId));
    return c.json({ sessionId });
  } catch (err) {
    return authError(c, err);
  }
});

app.get("/api/auth/me", async (c) => {
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
  if (resolution.kind !== "authenticated") {
    return c.json({ user: null });
  }
  // Re-hydrate the full shape (PAT callers resolve a narrower acting user).
  const hydrated = await sessionPort.findUserWithEmail(resolution.user.id);
  if (!hydrated) return c.json({ user: null });
  // Sliding-cookie parity: the webapp re-stamped a fresh 30-day maxAge on
  // every authenticated 2xx (sessionCookie.ts stampSessionCookie).
  const ridingToken = requestSessionToken(
    c.req.header("authorization"),
    c.req.header("cookie"),
  );
  if (ridingToken) c.header("Set-Cookie", sessionCookieHeader(ridingToken));
  return c.json({
    user: {
      id: hydrated.id,
      email: hydrated.email,
      fullName: hydrated.fullName,
      firstName: hydrated.firstName,
      preferredName: hydrated.preferredName ?? null,
      plan: hydrated.plan,
      entitled: isEntitled(
        hydrated.plan,
        hydrated.planRenewsAt,
        hydrated.isAdmin,
        hydrated.manualAccessGrant,
      ),
      isAdmin: hydrated.isAdmin,
      hasSeenOnboarding: hydrated.hasSeenOnboarding,
    },
  });
});

app.post("/api/auth/mint-cli-token", async (c) => {
  try {
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
    if (resolution.kind !== "authenticated") {
      // cliMint.ts's own backstop message (Wasp's auth:true gate answers
      // before the handler; here the resolution is the gate).
      return c.json({ error: "Not authenticated." }, 401);
    }
    // Entitlement gate BEFORE any mint (entitlementHttp.ts placement).
    const violation = cliAccessViolation(resolution.user);
    if (violation) {
      return c.json(
        {
          error: `${violation.feature} is a Pro feature.`,
          feature: violation.feature,
          reason: violation.reason,
        },
        402,
      );
    }
    const body = (await c.req.json().catch(() => ({}))) as { label?: unknown };
    const label =
      typeof body?.label === "string" ? body.label.trim().slice(0, 80) : "CLI";
    const plaintext = generatePat();
    await db.insert(apiKey).values({
      id: crypto.randomUUID(),
      hashedToken: hashToken(plaintext),
      label,
      userId: resolution.user.id,
    });
    // Sliding-cookie parity (see /api/auth/me) + plaintext shown exactly once.
    const ridingToken = requestSessionToken(
      c.req.header("authorization"),
      c.req.header("cookie"),
    );
    if (ridingToken) c.header("Set-Cookie", sessionCookieHeader(ridingToken));
    return c.json({ token: plaintext, label });
  } catch (err) {
    return authError(c, err);
  }
});

// Logout — the fifth /api/auth/* twin (webapp auth logout() parity): deletes
// the Session row that rode the request and clears the `wasp_session` cookie.
// NOT dev-gated (logout must work in production), and rides resolveActingUser
// like every twin so the transport rules stay uniform (the CSRF header on
// cookie-authed mutations). Idempotent by contract: no cookie, an unknown
// token, or an already-deleted row all still answer 200 with the clearing
// Set-Cookie — the client lands signed out either way.
app.post("/api/auth/logout", async (c) => {
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
  // The token that rode the request (Bearer-session precedence, then the
  // cookie — the SPA only ever sends the cookie). Exact-id delete: Session.id
  // IS the token (issue.ts contract). A PAT-authed call deletes nothing (its
  // bearer is an aa_ token, not a session id) and just clears the cookie.
  const token = requestSessionToken(
    c.req.header("authorization"),
    c.req.header("cookie"),
  );
  if (token) {
    await sessionPort.deleteSession(token);
  }
  // The clearing stamp mirrors the login path's serialization exactly
  // (sessionCookieHeader attributes with Max-Age=0 + empty value).
  c.header("Set-Cookie", clearSessionCookieHeader());
  return c.json({ ok: true });
});

// --- S12 share target (POST /api/share) ----------------------------------------
// The manifest share_target's direct server path: text-only urlencoded form →
// compose → createInboxItemCore → 303 (/login | /share?error=empty |
// /share?error=server | /share?id=…). Session-COOKIE auth only, no CSRF
// header — it's a top-level form navigation from the installed PWA (the
// primary path is the service-worker interception; see src/share.ts).
app.post("/api/share", createShareRoute({ db, entities }));

// --- production single-service mount (the built web SPA) ---------------------
// WEB_DIST_DIR is set only in the deployed image: the API then serves the
// SvelteKit static build on the same origin — /rpc and /api stay same-origin
// (the app's client calls them relatively), no CORS surface, one domain to
// flip on switch day.
//
// MUST be registered LAST — after every app-level route above. Hono matches
// in registration order, so a catch-all mounted before /api/auth/me (a GET)
// swallows it and the SPA's index.html comes back instead of the user JSON
// (found on the real deployed image at the 2026-09-06 domain switch: every
// user looked signed out). POST-only routes never notice; GETs do. The e2e
// suite runs the API without WEB_DIST_DIR, so only the deployed image (or a
// local run with WEB_DIST_DIR set) exercises this ordering.
if (servingSpa) {
  // Assets first (immutable), then the SPA fallback for client-side routes.
  app.use("/_app/*", serveStatic({ root: webDist }));
  app.use("/static/*", serveStatic({ root: webDist }));
  app.get("/manifest.json", serveStatic({ root: webDist }));
  app.get("/service-worker.js", serveStatic({ root: webDist }));
  app.get("/version.json", serveStatic({ root: webDist }));
  app.get("*", serveStatic({
    root: webDist,
    rewriteRequestPath: () => "/index.html",
  }));
  logEvent("info", `serving the web app from ${webDist}`);
} else if (webDist) {
  logEvent("warn", `WEB_DIST_DIR=${webDist} does not exist — serving API only`);
}

// --- 404 fallback ---------------------------------------------------------------

app.notFound((c) => c.json({ error: { code: "NOT_FOUND" } }, 404));

// --- serve ----------------------------------------------------------------------

const port = Number(process.env.PORT ?? 8080);
const server = Bun.serve({ port, fetch: app.fetch });
logEvent(
  "info",
  `ActionAmp API listening on http://localhost:${server.port} (pid ${process.pid})`,
  { port: server.port, pid: process.pid },
);

// S14 — the daily-reminder scheduler (the PgBoss `* * * * *` replacement): a
// 60s interval, overlap-guarded, once-per-local-day per user via the atomic
// lastDailyReminderAt claim (src/push.ts). No-ops without VAPID env.
const reminderScheduler = startDailyReminderScheduler(db);

// Graceful shutdown: close the DB pool so `--hot` reloads and SIGINTs never
// leak sockets.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    reminderScheduler.stop();
    db.$client.end().finally(() => process.exit(0));
  });
}
