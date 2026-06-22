/**
 * Waits for the app to be reachable before any test runs. Fails fast with a
 * clear message if `wasp start` isn't serving — the #1 cause of flaky e2e in
 * this project.
 */
export default async function globalSetup() {
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
