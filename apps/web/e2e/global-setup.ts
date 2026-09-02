/**
 * Waits for BOTH servers before any test runs (F11). Fails fast with a clear
 * message naming the missing server + its start command — the #1 cause of
 * flaky e2e (webapp/e2e/global-setup.ts lesson, ported).
 *
 * No `webServer` in the config (Playwright bug #11907 kills reused servers
 * mid-run locally): start both manually, this setup just polls.
 *
 *   API:  cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev \
 *           NODE_ENV=development bun --hot src/index.ts
 *   Web:  cd apps/web && bunx vite dev --port 5174
 *
 * The API probe also guards the NODE_ENV=development gate on POST
 * /api/dev/login (the route e2e authenticates through): a gated API answers
 * 404, a live one answers 400 for the deliberately invalid probe email
 * (no user rows are created — validation rejects before any DB write).
 */

const WEB_URL = process.env.E2E_BASE_URL ?? "http://localhost:5174";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080";

const API_START = `cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev NODE_ENV=development bun --hot src/index.ts`;
const WEB_START = `cd apps/web && bunx vite dev --port 5174`;

async function pollUntilUp(url: string, label: string, startCommand: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      // Any HTTP response (even a 3xx/4xx) means the server is up.
      if (res.status < 500) return;
    } catch {
      /* connection refused — not up yet, keep polling */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `\n[e2e] ${label} not reachable at ${url} after ${timeoutMs / 1000}s.\n` +
      `Start it first:\n  ${startCommand}\n` +
      `(No webServer in the config — Playwright bug #11907 kills reused servers mid-run.)`,
  );
}

export default async function globalSetup() {
  // API first — the web app's dev proxy targets it; no point polling the
  // shell if the data plane is down. /health is liveness (no DB ping).
  await pollUntilUp(`${API_URL}/health`, "The API", API_START);
  await pollUntilUp(WEB_URL, "The web app", WEB_START);

  // The dev login gate: NODE_ENV=development must be set on the API process
  // or every loginAs() would 404 deep inside a test. Probe is side-effect-free
  // (invalid email → 400 before any DB work; 404 = gate closed).
  let probe: Response;
  try {
    probe = await fetch(`${API_URL}/api/dev/login?email=not-an-email`, { method: "POST" });
  } catch (err) {
    throw new Error(
      `[e2e] The API answered /health but not /api/dev/login — it likely restarted mid-setup. Original error: ${String(err)}`,
    );
  }
  if (probe.status === 404) {
    throw new Error(
      `\n[e2e] The API at ${API_URL} is running WITHOUT NODE_ENV=development — ` +
        `POST /api/dev/login is gated to dev and answers 404.\n` +
        `Restart it:\n  ${API_START}`,
    );
  }

  // Re-seed the per-spec fixture users. Several specs complete/promote their
  // seeded rows, so a second suite run against stale rows fails — the seeds
  // are RESET-semantics (wipe + recreate per fixture user), making every run
  // deterministic. Idempotent + localhost-only by construction.
  const { spawnSync } = await import("node:child_process");
  const apiDir = new URL("../../api/", import.meta.url).pathname;
  for (const seed of ["seed-s4.ts", "seed-inbox.ts", "seed-projects.ts"]) {
    const proc = spawnSync(
      "bun",
      ["src/" + seed],
      {
        cwd: apiDir,
        env: {
          ...process.env,
          DATABASE_URL:
            process.env.E2E_DATABASE_URL ?? "postgresql://jake@localhost:5432/actionamp_dev",
        },
        encoding: "utf-8",
      },
    );
    if (proc.status !== 0) {
      throw new Error(`[e2e] seed ${seed} failed:\n` + (proc.stderr ?? "").slice(0, 500));
    }
  }
}
