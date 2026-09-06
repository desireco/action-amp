/**
 * Waits for the app to be reachable before any test runs. Fails fast with a
 * clear message if `wasp start` isn't serving — the #1 cause of flaky e2e in
 * this project.
 */
export default async function globalSetup() {
  // A prior interrupted run can leave disposable E2E identities behind. The
  // matching cleanup after every run lives in global-teardown.ts.
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const webapp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://jake@localhost:5432/actionamp_dev";
  execFileSync("node", ["scripts/cleanup-e2e-users.mjs", "--delete"], {
    cwd: webapp,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  const url = process.env.E2E_BASE_URL ?? "http://localhost:4000";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      // Any HTTP response (even a 3xx) means the server is up.
      if (res.status < 500) return;
    } catch {
      /* server not up yet — keep polling */
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(
    `App not reachable at ${url} after 30s. Start it first: run \`wasp start\` in webapp/.`,
  );
}
