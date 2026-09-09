/**
 * login — browser flow, admin-gated.
 *
 * Same mechanics as the user CLI's login (state nonce, browser opens
 * /cli/login, token filed server-side under the nonce, polled back — no
 * localhost listener). The difference: after receiving the token we call
 * /api/cli/whoami and REJECT non-admin accounts — the token is never
 * written to config for a non-admin. This keeps the admin CLI's stored
 * session always-admin without a separate token type.
 *
 * --dev targets localhost; default is prod. The stored config is separate from
 * the user CLI's (~/.config/actionamp-admin/), so both can be logged in at once.
 */
import { Command } from "commander";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolveUrls, readConfig, writeConfig, getConfigPath } from "../config.js";
import { fetchApi } from "../api.js";
import { emit, fail, type OutputCtx } from "../output.js";
import type { Whoami } from "../types.js";

/** Open a URL in the user's default browser. macOS → open; Linux → xdg-open. */
function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    process.stderr.write(`Could not auto-open browser. Open manually: ${url}\n`);
  }
}

export function makeLoginCommand(): Command {
  const cmd = new Command("login");
  cmd
    .description("authenticate as an admin via browser (--dev targets localhost)")
    .option("--dev", "use the local dev server (localhost:8080 / :5174)")
    .option("--json", "emit JSON output")
    .action(async (opts: { dev?: boolean; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      await login(ctx, opts.dev ?? false);
    });
  return cmd;
}

async function login(ctx: OutputCtx, dev: boolean): Promise<void> {
  const { apiUrl, webUrl } = resolveUrls(dev);

  // The login's one-time nonce — the whole handoff key. The /cli/login page
  // files the minted token under it server-side; we poll for it. Unguessable
  // by construction, single-use server-side.
  const state = randomBytes(16).toString("hex");

  const loginUrl = new URL(`${webUrl}/cli/login`);
  loginUrl.searchParams.set("state", state);

  process.stdout.write(`Opening browser to ${loginUrl.toString()}\n`);
  process.stdout.write("Waiting for authorization… (Ctrl+C to cancel; expires in 10 min)\n");

  openBrowser(loginUrl.toString());

  const token = await pollForToken(apiUrl, state);

  // Validate the token by hitting /api/cli/whoami AND checking admin.
  const { status, body } = await fetchApi<Whoami>(apiUrl, token, "/api/cli/whoami");
  if (status === 401) fail("Token rejected (401). The login link may have been tampered with.", ctx);
  if (status >= 400) fail(`Token check failed (HTTP ${status}).`, ctx);

  const who = body as Whoami;
  // The admin gate: a non-admin account is rejected outright. We do NOT write
  // the token to config, so the admin CLI never holds a session it can't use.
  if (!who.user?.isAdmin) {
    const identity = who.user?.email ?? who.user?.fullName ?? "that account";
    fail(
      `${identity} is not an admin. actionamp-admin is restricted to admin accounts.`,
      ctx,
    );
  }

  writeConfig({ token, apiUrl });
  const identity = who.user.email ?? who.user.fullName ?? "your account";
  emit(
    { ok: true, apiUrl, user: who.user },
    () => {
      process.stdout.write(`Signed in as admin: ${identity}.\n`);
      process.stdout.write(`Token saved. Revoke it any time from Settings → Access tokens.\n`);
    },
    ctx,
  );
  // Explicit exit — fetch keep-alive sockets outlive the poll loop and would
  // otherwise keep the event loop alive instead of returning to the shell.
  process.exit(0);
}

/**
 * Poll the challenge endpoint until the page's mint lands (single-use) or
 * the 10-minute window ends. The state is hex, URL-safe.
 */
async function pollForToken(apiUrl: string, state: string): Promise<string> {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${apiUrl}/api/auth/cli-login-challenge?state=${state}`);
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as {
          status?: string;
          token?: string;
        } | null;
        if (body?.status === "complete" && typeof body.token === "string") {
          return body.token;
        }
      }
    } catch {
      // Transient network error — keep polling until the window ends.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    "Login timed out after 10 minutes. Re-run `actionamp-admin login` for a fresh link.",
  );
}

/** Check if logged in; if so, print who. Used by `actionamp-admin whoami` too. */
export function isLoggedIn(): boolean {
  return readConfig() !== null;
}

export function configPath(): string {
  return getConfigPath();
}
