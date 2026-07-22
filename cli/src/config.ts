/**
 * Config — read/write the CLI's stored credentials.
 *
 * Lives at ~/.config/actionamp/config.json (mode 0600):
 *   { "token": "aa_...", "apiUrl": "http://localhost:3001" }
 *
 * The token is a PAT minted via the OAuth browser flow (see commands/login.ts).
 * apiUrl is set at login time — `--dev` writes localhost, default writes prod.
 * Subsequent commands read apiUrl from config; no --dev flag needed per-call.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "actionamp");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export const PROD_API_URL = "https://api.actionamp.com";
export const DEV_API_URL = "http://localhost:3001";
export const PROD_WEB_URL = "https://app.actionamp.com";
export const DEV_WEB_URL = "http://localhost:4000";

export type Config = { token: string; apiUrl: string };

/**
 * Resolve the API + web origins from --dev flag or env overrides.
 *
 * Two origins matter because Wasp splits them: the web client (where the
 * /cli/login page lives, served by Vite on :4000 in dev / app.actionamp.com in
 * prod) and the API (where /api/cli/* + /api/pat/* live, on :3001 in dev /
 * api.actionamp.com in prod).
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
