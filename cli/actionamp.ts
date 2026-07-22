#!/usr/bin/env node
/**
 * actionamp — the prototype CLI (throwaway; "discard on lock").
 *
 * Validates the transport AND the feel of the loop before committing to the
 * typed, tested, commander-based package in real Phase 1. Four verbs, each
 * with --json. Pure Node 22+ (native fetch + parseArgs + fs). No deps.
 *
 * Run:
 *   node --experimental-strip-types cli/actionamp.ts login
 *   node --experimental-strip-types cli/actionamp.ts now
 *   node --experimental-strip-types cli/actionamp.ts capture "fix the bug"
 *   node --experimental-strip-types cli/actionamp.ts logout
 *
 * Or symlink/skip the flag (Node 23.6+ strips types by default; 24.16 does).
 *
 * Config lives at ~/.config/actionamp/config.json:
 *   { "token": "aa_...", "apiUrl": "http://localhost:3001" }
 *
 * See docs/specs/cli-package.md §Prototype for scope + the steering questions.
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline/promises";

// ─── config ────────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), ".config", "actionamp");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_API_URL =
  process.env.ACTIONAMP_API_URL ?? "http://localhost:3001";

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

async function cmdLogin(args: { json: boolean }): Promise<void> {
  const apiUrl = DEFAULT_API_URL.replace(/\/$/, "");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const token = (await rl.question("Paste your token (from Settings → Access tokens): ")).trim();
  rl.close();
  if (!token) fail("No token entered.", args.json);

  // Validate by hitting /api/cli/now — a real call proves the token works
  // end-to-end (resolves to a user + a 200/empty-200, not a 401).
  const cfg = { token, apiUrl };
  const { status, body } = await api(cfg, "/api/cli/now");
  if (status === 401) fail("Token rejected (401). Check it was copied in full.", args.json);
  if (status >= 400) fail(`Token check failed (HTTP ${status}).`, args.json);

  writeConfig(cfg);
  emit({ ok: true, apiUrl }, () => {
    process.stdout.write(`Signed in. API: ${apiUrl}\n`);
  }, args.json);
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
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(`actionamp — terminal client (prototype)

Usage:
  actionamp login                       paste a token, validate, save
  actionamp now                         print your top task
  actionamp capture "<text>"            quick-capture to inbox
  actionamp logout                      clear saved token

Flags:
  --json         emit JSON (for agents / scripting)
  -h, --help     this message

Config: ~/.config/actionamp/config.json
`);
    process.exit(0);
  }

  const json = values.json;
  const cmd = positionals[0];

  switch (cmd) {
    case "login":
      await cmdLogin({ json });
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
