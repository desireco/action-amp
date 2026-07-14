#!/usr/bin/env node
/**
 * Lifecycle-managed `wasp start` for isolated e2e.
 *
 * Spawned by Playwright's `webServer` (playwright.config.ts, isolated mode).
 * Migrates the e2e DB, starts Wasp, and forwards SIGTERM/SIGINT so Playwright's
 * teardown actually kills the whole process tree — the thing bare `wasp start`
 * doesn't do (it orphans the Vite client + Node API server, leaving ports bound).
 *
 * This mirrors what Wasp's own `@wasp.sh/wasp-app-runner` ChildProcessManager
 * does, but without that tool's forced Docker Postgres / clobbered DATABASE_URL.
 *
 * Env (from .env.server in the worktree + .e2e.env, loaded by playwright.config):
 *   DATABASE_URL         → e2e DB (actionamp_e2e)
 *   PORT                 → 3101 (server)
 *   WASP_WEB_CLIENT_URL  → http://localhost:4100
 *   VITE_PORT            → 4100 (client, read by vite.config.ts)
 */
import { spawn, execSync } from "node:child_process";

const cwd = process.cwd();

// 1. Sync e2e DB schema (applies pending migrations; no-op if current).
// `--name auto` avoids Prisma's interactive prompt for a migration name.
execSync("wasp db migrate-dev --name auto", { stdio: "inherit", cwd });

// 2. Start wasp with signal management.
const child = spawn("wasp", ["start"], {
  stdio: "inherit",
  cwd,
  env: { ...process.env, VITE_PORT: process.env.VITE_PORT ?? "4100" },
});

// Forward termination signals to the whole child tree. Without this, Playwright
// sends SIGTERM to this process, which exits but leaves `wasp start`'s children
// (Vite, Node API) running as orphans holding ports 4100/3101.
let exiting = false;
const shutdown = (signal) => {
  if (exiting) return;
  exiting = true;
  try {
    child.kill(signal);
  } catch {
    // already gone
  }
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 0));
