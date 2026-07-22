/**
 * Config — read/write the admin CLI's stored credentials.
 *
 * Lives at ~/.config/actionamp-admin/config.json (mode 0600), SEPARATE from the
 * user CLI's ~/.config/actionamp/config.json. The two CLIs never share tokens:
 * an admin token + a user token can coexist on the same machine, and revoking
 * one never affects the other.
 *   { "token": "aa_...", "apiUrl": "http://localhost:3001" }
 *
 * The token is a PAT minted via the same OAuth browser flow the user CLI uses
 * (see commands/login.ts) — but the admin CLI only stores it after verifying
 * the account is an admin, and rejects non-admins.
 *
 * apiUrl/webUrl point at the SAME backend as the user CLI (one ActionAmp
 * server serves both); they're duplicated here only so this package has no
 * dependency on cli/.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "actionamp-admin");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export const PROD_API_URL = "https://api.actionamp.com";
export const DEV_API_URL = "http://localhost:3001";
export const PROD_WEB_URL = "https://app.actionamp.com";
export const DEV_WEB_URL = "http://localhost:4000";

export type Config = { token: string; apiUrl: string };

/**
 * Resolve the API + web origins from --dev flag or env overrides.
 *
 * Same two-origin split as the user CLI: the web client (where /cli/login
 * lives, Vite on :4000 in dev / app.actionamp.com in prod) and the API (where
 * /api/cli/* live, on :3001 in dev / api.actionamp.com in prod).
 */
export function resolveUrls(dev: boolean): { apiUrl: string; webUrl: string } {
  const apiUrl = (process.env.ACTIONAMP_API_URL ?? (dev ? DEV_API_URL : PROD_API_URL)).replace(/\/$/, "");
  const webUrl = (process.env.ACTIONAMP_WEB_URL ?? (dev ? DEV_WEB_URL : PROD_WEB_URL)).replace(/\/$/, "");
  return { apiUrl, webUrl };
}

export function readConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (typeof raw.token === "string" && typeof raw.apiUrl === "string") return raw;
  } catch {
    // corrupt config — treat as logged out
  }
  return null;
}

export function writeConfig(cfg: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

export function deleteConfig(): void {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
