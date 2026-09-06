import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webapp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://jake@localhost:5432/actionamp_dev";

/** Keep generated Playwright identities out of the shared local dev database. */
export default async function globalTeardown() {
  execFileSync("node", ["scripts/cleanup-e2e-users.mjs", "--delete"], {
    cwd: webapp,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
