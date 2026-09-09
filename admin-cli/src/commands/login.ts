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

  // CSRF nonce — the /cli/login page must echo it back via the callback's
  // state query param. Without this, a malicious page could initiate a login
  // flow and intercept the token.
  const state = randomBytes(16).toString("hex");

  // First-wins handoff: the localhost callback (instant path) or the
  // server-side challenge poll (the fallback — browsers increasingly block
  // public-site → loopback navigations). The /cli/login page files the
  // minted token under this login's state nonce; we poll for it.
  let settled = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    if (pollTimer) clearInterval(pollTimer);
  };

  // Spin up a one-shot HTTP server on a random high port.
  const token: string = await new Promise<string>((resolve, reject) => {
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

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
        // Stray probe or stale tab — answer it, but keep waiting for the
        // real callback. A malformed hit used to abort the whole login.
        sendHtml(400, "Missing token or state. Run <code>actionamp-admin login</code> again.");
        return;
      }
      if (stateParam !== state) {
        // A tab from an earlier login attempt (its callback port is gone),
        // or a cross-site probe. The state check remains the gate for
        // accepting a token — it just no longer kills this login.
        sendHtml(400, "This link belongs to an earlier login attempt. Re-run <code>actionamp-admin login</code> in your terminal for a fresh one.");
        return;
      }

      sendHtml(200, "Authorized. You can close this tab and return to the terminal.");
      server.close();
      finish(tokenParam);
    });

    server.on("error", (err) => fail(err));

    // Dual-stack bind, deliberately not host-pinned: `localhost` resolves to
    // ::1 first on many systems, and the callback URL must say `localhost`
    // (the web page rejects any other hostname). The state nonce is what
    // gates who may actually deliver a token.
    server.listen(0, () => {
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
      process.stdout.write("Waiting for authorization… (Ctrl+C to cancel; expires in 10 min)\n");

      openBrowser(loginUrl.toString());
    });

    // The poll channel — completes the login even when the browser refuses
    // to navigate to the localhost callback. The state is hex, URL-safe.
    pollTimer = setInterval(() => {
      void fetch(`${apiUrl}/api/auth/cli-login-challenge?state=${state}`)
        .then(async (res) => {
          if (!res.ok) return;
          const body = (await res.json().catch(() => null)) as {
            status?: string;
            token?: string;
          } | null;
          if (body?.status === "complete" && typeof body.token === "string") {
            server.close();
            finish(body.token);
          }
        })
        .catch(() => {
          // Transient network error — keep polling until the window ends.
        });
    }, 2000);

    setTimeout(() => {
      server.close();
      fail(
        new Error(
          "Login timed out after 10 minutes. Re-run `actionamp-admin login` — browser tabs from an earlier attempt point at a port that is now closed.",
        ),
      );
    }, 10 * 60 * 1000);
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
