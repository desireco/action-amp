#!/usr/bin/env node
/**
 * actionamp — the prototype CLI (throwaway; "discard on lock").
 *
 * Validates the transport AND the feel of the loop before committing to the
 * typed, tested, commander-based package in real Phase 1. Four verbs, each
 * with --json. Pure Node 22+ (native fetch + parseArgs + fs). No deps.
 *
 * Run:
 *   node --experimental-strip-types cli/actionamp.ts login --dev
 *   node --experimental-strip-types cli/actionamp.ts now
 *   node --experimental-strip-types cli/actionamp.ts capture "fix the bug"
 *   node --experimental-strip-types cli/actionamp.ts logout
 *
 * `login` opens a browser to the /cli/login page (the OAuth-style flow):
 * you authorize there, the token comes back to a localhost callback the CLI
 * spins up, and gets written to config. `--dev` targets localhost:3001;
 * default is api.actionamp.com.
 *
 * Config lives at ~/.config/actionamp/config.json:
 *   { "token": "aa_...", "apiUrl": "http://localhost:3001" }
 *
 * See docs/specs/cli-package.md §Prototype for scope + the steering questions.
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

// ─── config ────────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), ".config", "actionamp");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const PROD_API_URL = "https://api.actionamp.com";
const DEV_API_URL = "http://localhost:3001";
const PROD_WEB_URL = "https://app.actionamp.com";
const DEV_WEB_URL = "http://localhost:4000";

/**
 * Resolve the API + web origins from --dev flag or env overrides.
 *
 * Two origins matter because Wasp splits them: the web client (where the
 * /cli/login page lives, served by Vite on :4000 in dev / app.actionamp.com in
 * prod) and the API (where /api/cli/* + /api/pat/* live, on :3001 in dev /
 * api.actionamp.com in prod). The CLI opens the browser to the *web* origin
 * for login, then makes all its data calls to the *API* origin.
 */
function resolveUrls(dev: boolean): { apiUrl: string; webUrl: string } {
  const apiUrl = (process.env.ACTIONAMP_API_URL ?? (dev ? DEV_API_URL : PROD_API_URL)).replace(/\/$/, "");
  const webUrl = (process.env.ACTIONAMP_WEB_URL ?? (dev ? DEV_WEB_URL : PROD_WEB_URL)).replace(/\/$/, "");
  return { apiUrl, webUrl };
}

type Config = { token: string; apiUrl: string };

function readConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (typeof raw.token === "string" && typeof raw.apiUrl === "string") return raw;
  } catch {
    // corrupt config — treat as logged out
  }
  return null;
}

function writeConfig(cfg: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

function deleteConfig(): void {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
}

// ─── api ───────────────────────────────────────────────────────────────────

async function api(
  cfg: Config,
  path: string,
  init?: RequestInit & { body?: unknown },
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${cfg.apiUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ─── output (human vs --json) ──────────────────────────────────────────────

function emit(json: unknown, human: () => void, jsonMode: boolean): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(json) + "\n");
  } else {
    human();
  }
}

function fail(message: string, jsonMode: boolean, code = 1): never {
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ error: message }) + "\n");
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exit(code);
}

// ─── task formatting (human) ───────────────────────────────────────────────

type Task = {
  description: string;
  project?: { name: string } | null;
  goal?: { name: string } | null;
};

function formatTask(t: Task): string {
  const ctx = t.project?.name ? ` · in ${t.project.name}` : t.goal?.name ? ` · for ${t.goal.name}` : "";
  return `${t.description}${ctx}`;
}

// ─── commands ──────────────────────────────────────────────────────────────

async function cmdLogin(args: { json: boolean; dev: boolean }): Promise<void> {
  const { apiUrl, webUrl } = resolveUrls(args.dev);

  // CSRF nonce — random hex; the /cli/login page must echo it back via the
  // callback's `state` query param. Without this, a malicious page could
  // initiate a login flow and intercept the token.
  const state = randomBytes(16).toString("hex");

  // Spin up a one-shot HTTP server on a random high port. The browser
  // redirects here with ?token=…&state=… after the user confirms on /cli/login.
  // Resolves with the token on success; rejects on timeout or state mismatch.
  const token: string = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "", `http://localhost`);
      const tokenParam = url.searchParams.get("token");
      const stateParam = url.searchParams.get("state");

      // Always respond with a tiny HTML page — the user lands here in the
      // browser after authorizing, so show a calm confirmation.
      const sendHtml = (status: number, body: string) => {
        res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><meta charset="utf-8"><title>ActionAmp CLI</title>
          <body style="font-family:system-ui;padding:2rem;color:#1a1a1a">${body}</body>`);
      };

      if (!tokenParam || !stateParam) {
        sendHtml(400, "Missing token or state. Run <code>actionamp login</code> again.");
        server.close();
        reject(new Error("Callback missing token/state."));
        return;
      }
      if (stateParam !== state) {
        sendHtml(400, "State mismatch — possible CSRF. Aborting.");
        server.close();
        reject(new Error("State mismatch (possible CSRF)."));
        return;
      }

      sendHtml(
        200,
        "Authorized. You can close this tab and return to the terminal.",
      );
      server.close();
      resolve(tokenParam);
    });

    server.on("error", (err) => reject(err));

    // Listen on a random port (0 = OS assigns). Once listening, open browser.
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not bind callback server."));
        server.close();
        return;
      }
      const callbackUrl = `http://localhost:${addr.port}/callback`;
      // The /cli/login page is served by the WEB client (Vite :4000 / app.actionamp.com),
      // NOT the API. The page itself reaches the API via its own configured API_URL.
      const loginUrl = new URL(`${webUrl}/cli/login`);
      loginUrl.searchParams.set("callback", callbackUrl);
      loginUrl.searchParams.set("state", state);

      process.stdout.write(`Opening browser to ${loginUrl.toString()}\n`);
      process.stdout.write("Waiting for authorization… (Ctrl+C to cancel)\n");

      openBrowser(loginUrl.toString());
    });

    // Safety timeout — if nothing happens in 5 min, give up.
    setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 5 minutes."));
    }, 5 * 60 * 1000);
  });

  // We have a token. Validate it by hitting /api/cli/whoami — confirms the
  // token resolves to a user + gives us the email for "Signed in as X".
  const cfg = { token, apiUrl };
  const { status, body } = await api(cfg, "/api/cli/whoami");
  if (status === 401) fail("Token rejected (401). The callback may have been tampered with.", args.json);
  if (status >= 400) fail(`Token check failed (HTTP ${status}).`, args.json);

  writeConfig(cfg);
  const who = body as { user?: { email?: string | null; fullName?: string } };
  const identity = who.user?.email ?? who.user?.fullName ?? "your account";
  emit({ ok: true, apiUrl, user: who.user }, () => {
    process.stdout.write(`Signed in as ${identity}.\n`);
    process.stdout.write(`Token saved. Revoke it any time from Settings → Access tokens.\n`);
  }, args.json);
}

/** Open a URL in the user's default browser. macOS → open; Linux → xdg-open. */
function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // If spawn fails (rare — usually a stripped-down container), the URL is
    // already printed above; the user can open it manually.
    process.stderr.write(`Could not auto-open browser. Open manually: ${url}\n`);
  }
}

async function cmdNow(args: { json: boolean }): Promise<void> {
  const cfg = readConfig();
  if (!cfg) fail("Not logged in. Run: actionamp login", args.json);

  const { status, body } = await api(cfg, "/api/cli/now");
  if (status === 401) fail("Token rejected (401). Run: actionamp login", args.json);
  if (status === 402) {
    const b = body as { feature?: string };
    fail(b.feature ? `${b.feature} is a Pro feature.` : "Pro feature required (402).", args.json);
  }
  if (status >= 400) fail(`Request failed (HTTP ${status}).`, args.json);

  const b = body as { task: Task | null; reason?: string };
  emit(
    b,
    () => {
      if (b.task) {
        process.stdout.write(formatTask(b.task!) + "\n");
      } else if (b.reason === "no-lens") {
        process.stdout.write("No lens yet. Complete onboarding in the app first.\n");
      } else {
        process.stdout.write("Nothing on the table.\n");
      }
    },
    args.json,
  );
}

async function cmdCapture(text: string, args: { json: boolean }): Promise<void> {
  const cfg = readConfig();
  if (!cfg) fail("Not logged in. Run: actionamp login", args.json);

  const { status, body } = await api(cfg, "/api/cli/capture", {
    method: "POST",
    body: { text },
  });
  if (status === 401) fail("Token rejected (401). Run: actionamp login", args.json);
  if (status >= 400) fail(`Capture failed (HTTP ${status}).`, args.json);

  const b = body as { id: string; text: string };
  emit({ ok: true, ...b }, () => {
    process.stdout.write("Captured.\n");
  }, args.json);
}

async function cmdLogout(args: { json: boolean }): Promise<void> {
  deleteConfig();
  emit({ ok: true }, () => {
    process.stdout.write("Signed out.\n");
  }, args.json);
}

// ─── entry ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      json: { type: "boolean", default: false },
      dev: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(`actionamp — terminal client (prototype)

Usage:
  actionamp login [--dev]                open browser to authorize (default: prod)
  actionamp now                          print your top task
  actionamp capture "<text>"             quick-capture to inbox
  actionamp logout                       clear saved token

Flags:
  --dev          use the local dev server (http://localhost:3001)
  --json         emit JSON (for agents / scripting)
  -h, --help     this message

Config: ~/.config/actionamp/config.json
`);
    process.exit(0);
  }

  const json = values.json;
  const dev = values.dev;
  const cmd = positionals[0];

  switch (cmd) {
    case "login":
      await cmdLogin({ json, dev });
      break;
    case "now":
      await cmdNow({ json });
      break;
    case "capture":
      if (positionals.length < 2) fail("capture needs text. Try: actionamp capture \"fix the bug\"", json);
      await cmdCapture(positionals.slice(1).join(" "), { json });
      break;
    case "logout":
      await cmdLogout({ json });
      break;
    default:
      fail(`Unknown command: ${cmd}. Try: actionamp --help`, json);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
