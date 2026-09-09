/**
 * The poll channel for CLI login — the second handoff path that does not
 * depend on the browser reaching localhost.
 *
 * Why: browsers increasingly block public-site → loopback navigations
 * (Firefox/Chrome local-network protection). The /cli/login page still
 * redirects to the CLI's localhost callback as the instant path, but after
 * minting it ALSO files the token under the login's state nonce (mint-cli-
 * token's `state` body field). The CLI, which generated that nonce, polls
 * GET /api/cli/login-challenge?state=… until it appears. Whichever path
 * delivers first wins.
 *
 * Trust model unchanged: the state is a 128-bit CLI-generated nonce and the
 * legacy callback URL carried the token itself — knowing the state was
 * already equivalent to holding the token. Entries are single-use and expire
 * after 10 minutes (the CLI's own login window).
 */
import { Hono } from "hono";

export type ChallengeStore = {
  put(state: string, token: string): void;
  take(state: string): string | null;
};

/**
 * In-memory single-use store. One process, one replica (the Railway deploy)
 * — no cross-instance coordination needed. Lazy expiry on read keeps the
 * map bounded by one login window's worth of entries.
 */
export function createChallengeStore(
  ttlMs = 10 * 60 * 1000,
  now: () => number = Date.now,
): ChallengeStore {
  const entries = new Map<string, { token: string; expiresAt: number }>();
  return {
    put(state, token) {
      entries.set(state, { token, expiresAt: now() + ttlMs });
    },
    take(state) {
      const entry = entries.get(state);
      if (!entry) return null;
      entries.delete(state);
      return now() > entry.expiresAt ? null : entry.token;
    },
  };
}

/** The CLI mints 32-hex states; accept any sane hex nonce, nothing else. */
const STATE_RE = /^[0-9a-f]{16,128}$/;

export function isChallengeState(value: unknown): value is string {
  return typeof value === "string" && STATE_RE.test(value);
}

/**
 * GET /api/auth/cli-login-challenge?state=… — public (the state is the
 * secret, same as the callback URL). Always 200: `{status:"pending"}` until
 * the mint lands, then `{status:"complete", token}` exactly once.
 *
 * Lives under /api/auth/* (beside mint-cli-token, which files entries into
 * the store): the /api/cli/* surface is Bearer-gated end to end
 * (createCliRoutes' middleware matches the whole prefix) and this endpoint
 * is polled by a CLI that does not have a token yet — that's the point.
 */
export function createLoginChallengeRoute(store: ChallengeStore): Hono {
  const app = new Hono();
  app.get("/api/auth/cli-login-challenge", (c) => {
    const state = c.req.query("state") ?? "";
    if (!STATE_RE.test(state)) {
      return c.json({ error: "Bad state." }, 400);
    }
    const token = store.take(state);
    if (!token) {
      return c.json({ status: "pending" });
    }
    return c.json({ status: "complete", token });
  });
  return app;
}
