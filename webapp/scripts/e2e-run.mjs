#!/usr/bin/env node
/**
 * Lifecycle-managed `wasp start` for isolated e2e.
 *
 * Spawned by Playwright's `webServer` (playwright.config.ts, isolated mode).
 * Starts Wasp and forwards SIGTERM/SIGINT so Playwright's teardown actually
 * kills the whole process tree — the thing bare `wasp start` doesn't do (it
 * orphans the Vite client + Node API server, leaving ports bound).
 *
 * This mirrors what Wasp's own `@wasp.sh/wasp-app-runner` ChildProcessManager
 * does, but without that tool's forced Docker Postgres / clobbered DATABASE_URL.
 *
 * Does NOT migrate — scripts/e2e-setup.sh handles the initial migration, and
 * running `wasp db migrate-dev` here would recompile the whole project on every
 * test run (slow + churns the file watcher). If the schema changes, re-run
 * e2e-setup.sh.
 *
 * Env (from .env.server in the worktree + .e2e.env, loaded by playwright.config):
 *   DATABASE_URL         → e2e DB (actionamp_e2e)
 *   PORT                 → 3101 (server)
 *   WASP_WEB_CLIENT_URL  → http://localhost:4100
 *   VITE_PORT            → 4100 (client, read by vite.config.ts)
 */
import { spawn } from "node:child_process";

const cwd = process.cwd();

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
