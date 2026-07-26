/**
 * Config — read/write the CLI's stored credentials + active lens.
 *
 * Lives at ~/.config/actionamp/config.json (mode 0600):
 *   { "token": "aa_...", "apiUrl": "http://localhost:3001", "lensId"?: "<uuid>" }
 *
 * The token is a PAT minted via the OAuth browser flow (see commands/login.ts).
 * apiUrl is set at login time — `--dev` writes localhost, default writes prod.
 * Subsequent commands read apiUrl from config; no --dev flag needed per-call.
 *
 * `lensId` is the active lens for this CLI install — set by `lens switch`,
 * read as the fallback by `now`/`project list`/`goal list`/`logbook`/`inbox
 * triage` when no `--lens-id` flag is passed. Mirrors the web app's
 * localStorage["aa-lens-id"] — there is no server-side "active lens"; each
 * client (browser tab, CLI install) tracks its own. Optional: an older config
 * without it works unchanged (commands fall back to the server default).
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

export type Config = { token: string; apiUrl: string; lensId?: string };

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
    // token + apiUrl are required; lensId is optional (older configs predate it).
    if (typeof raw.token === "string" && typeof raw.apiUrl === "string") {
      const cfg: Config = { token: raw.token, apiUrl: raw.apiUrl };
      if (typeof raw.lensId === "string") cfg.lensId = raw.lensId;
      return cfg;
    }
  } catch {
    // corrupt config — treat as logged out
  }
  return null;
}

export function writeConfig(cfg: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

/**
 * Read-modify-write the active lens into config. Used by `lens switch` /
 * `lens clear`. Throws if there's no config (the user hasn't run `login` yet)
 * — the caller surfaces that as a calm error.
 */
export function setActiveLens(lensId: string | null): void {
  const cfg = readConfig();
  if (!cfg) {
    throw new Error("Not logged in. Run: actionamp login");
  }
  if (lensId) {
    cfg.lensId = lensId;
  } else {
    delete cfg.lensId;
  }
  writeConfig(cfg);
}

export function deleteConfig(): void {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
