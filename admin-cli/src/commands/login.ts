/**
 * login — OAuth browser flow, admin-gated.
 *
 * Same mechanics as the user CLI's login (localhost callback server, CSRF
 * state nonce, browser opens /cli/login, token comes back). The difference:
 * after receiving the token we call /api/cli/whoami and REJECT non-admin
 * accounts — the token is never written to config for a non-admin. This keeps
 * the admin CLI's stored session always-admin without a separate token type.
 *
 * --dev targets localhost; default is prod. The stored config is separate from
 * the user CLI's (~/.config/actionamp-admin/), so both can be logged in at once.
 */
import { Command } from "commander";
import { createServer } from "node:http";
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
    .option("--dev", "use the local dev server (localhost:3001 / :4000)")
    .option("--json", "emit JSON output")
    .action(async (opts: { dev?: boolean; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      await login(ctx, opts.dev ?? false);
    });
  return cmd;
}

async function login(ctx: OutputCtx, dev: boolean): Promise<void> {
  const { apiUrl, webUrl } = resolveUrls(dev);

  // CSRF nonce — the /cli/login page must echo it back via the callback's
  // state query param. Without this, a malicious page could initiate a login
  // flow and intercept the token.
  const state = randomBytes(16).toString("hex");

  // Spin up a one-shot HTTP server on a random high port.
  const token: string = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "", "http://localhost");
      const tokenParam = url.searchParams.get("token");
      const stateParam = url.searchParams.get("state");

      const sendHtml = (status: number, body: string) => {
        res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><meta charset="utf-8"><title>ActionAmp Admin CLI</title>` +
            `<body style="font-family:system-ui;padding:2rem;color:#1a1a1a">${body}</body>`,
        );
      };

      if (!tokenParam || !stateParam) {
        sendHtml(400, "Missing token or state. Run <code>actionamp-admin login</code> again.");
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

      sendHtml(200, "Authorized. You can close this tab and return to the terminal.");
      server.close();
      resolve(tokenParam);
    });

    server.on("error", (err) => reject(err));

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not bind callback server."));
        server.close();
        return;
      }
      const callbackUrl = `http://localhost:${addr.port}/callback`;
      const loginUrl = new URL(`${webUrl}/cli/login`);
      loginUrl.searchParams.set("callback", callbackUrl);
      loginUrl.searchParams.set("state", state);

      process.stdout.write(`Opening browser to ${loginUrl.toString()}\n`);
      process.stdout.write("Waiting for authorization… (Ctrl+C to cancel)\n");

      openBrowser(loginUrl.toString());
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 5 minutes."));
    }, 5 * 60 * 1000);
  });

  // Validate the token by hitting /api/cli/whoami AND checking admin.
  const { status, body } = await fetchApi<Whoami>(apiUrl, token, "/api/cli/whoami");
  if (status === 401) fail("Token rejected (401). The callback may have been tampered with.", ctx);
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
  // Explicit exit — the OAuth flow spins up an http.Server + fetch sockets that
  // keep the event loop alive after the callback resolves.
  process.exit(0);
}

/** Check if logged in; if so, print who. Used by `actionamp-admin whoami` too. */
export function isLoggedIn(): boolean {
  return readConfig() !== null;
}

export function configPath(): string {
  return getConfigPath();
}
