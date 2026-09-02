import { describe, it, expect, vi } from "vitest";
import { resolveActingUser } from "./resolve.js";
import type { AuthPorts } from "./resolve.js";
import { SESSION_TTL_MS } from "./session.js";
import type { SessionAuthPort, SessionUser } from "./session.js";
import type { PatLookupPort, PatUser } from "./pat.js";

/**
 * F10c tests — the /rpc wrapper's transport routing: Bearer wins over cookie,
 * PATs vs session tokens on the Bearer path, and the CSRF stance (custom
 * header required on cookie-authed mutations; Bearer and GET exempt).
 */

const TOKEN = "abc234567abc234567abc234567abc234567abcd"; // 40-char base32 shape

function sessionUser(): SessionUser {
  return {
    id: "user-1",
    email: "dev@local.test",
    fullName: "Dev Local",
    firstName: "Dev",
    preferredName: null,
    isAdmin: false,
    plan: "FREE",
    planRenewsAt: null,
    manualAccessGrant: null,
    hasSeenOnboarding: true,
  };
}

function patUser(): PatUser {
  return {
    id: "user-2",
    plan: "PRO",
    planRenewsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    isAdmin: false,
    manualAccessGrant: null,
    email: "cli@local.test",
    fullName: "Cli User",
  };
}

function mockPorts(opts: {
  sessionRow?: { expiresAt: Date; authUserId: string | null } | null;
  patRow?: (PatUser & { apiKeyId: string }) | null;
} = {}): AuthPorts {
  const sessionPort: SessionAuthPort = {
    findSessionAuth: vi
      .fn()
      .mockResolvedValue(
        opts.sessionRow === undefined
          ? null
          : opts.sessionRow === null
            ? null
            : opts.sessionRow,
      ),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    extendSession: vi.fn().mockResolvedValue(undefined),
    findUserWithEmail: vi.fn().mockResolvedValue(sessionUser()),
  };
  const patPort: PatLookupPort = {
    findApiKeyUserByHash: vi.fn().mockResolvedValue(opts.patRow ?? null),
    touchApiKey: vi.fn().mockResolvedValue(undefined),
  };
  return { sessionPort, patPort };
}

const liveRow = () => ({ expiresAt: new Date(Date.now() + SESSION_TTL_MS), authUserId: "auth-1" });

describe("resolveActingUser — transport precedence", () => {
  it("cookie-authed POST with the CSRF header → session user", async () => {
    const ports = mockPorts({ sessionRow: liveRow() });
    const res = await resolveActingUser(ports, {
      method: "POST",
      cookie: `wasp_session=${TOKEN}`,
      requestedWith: "actionamp",
    });
    expect(res).toMatchObject({ kind: "authenticated", via: "session" });
    expect(ports.sessionPort.findSessionAuth).toHaveBeenCalledWith(TOKEN);
  });

  it("Authorization header wins over the cookie (attachSessionFromCookie parity)", async () => {
    const ports = mockPorts({ sessionRow: liveRow() });
    const res = await resolveActingUser(ports, {
      method: "POST",
      authorization: `Bearer ${TOKEN}`,
      cookie: "wasp_session=cookiemonster",
      requestedWith: "actionamp",
    });
    expect(res).toMatchObject({ kind: "authenticated", via: "session" });
    expect(ports.sessionPort.findSessionAuth).toHaveBeenCalledWith(TOKEN);
    // The cookie value was never consulted.
    expect(ports.sessionPort.findSessionAuth).not.toHaveBeenCalledWith("cookiemonster");
  });

  it("aa_ Bearer → PAT path; a session cookie is never consulted on it", async () => {
    const ports = mockPorts({ patRow: { ...patUser(), apiKeyId: "key-1" } });
    const res = await resolveActingUser(ports, {
      method: "POST",
      authorization: "Bearer aa_goodtoken",
    });
    expect(res).toMatchObject({ kind: "authenticated", via: "pat" });
    expect(ports.patPort.findApiKeyUserByHash).toHaveBeenCalled();
    expect(ports.sessionPort.findSessionAuth).not.toHaveBeenCalled();
  });

  it("garbage Bearer (session-shaped) → unauthenticated (handlers will 401)", async () => {
    const ports = mockPorts();
    const res = await resolveActingUser(ports, {
      method: "POST",
      authorization: "Bearer garbage",
    });
    expect(res).toEqual({ kind: "unauthenticated", via: "session" });
  });

  it("no credentials at all → unauthenticated via none", async () => {
    const ports = mockPorts();
    const res = await resolveActingUser(ports, { method: "POST" });
    expect(res).toEqual({ kind: "unauthenticated", via: "none" });
  });
});

describe("resolveActingUser — CSRF stance (F10c)", () => {
  it("cookie-authed POST without the custom header → 403 reject, no DB work", async () => {
    const ports = mockPorts({ sessionRow: liveRow() });
    const res = await resolveActingUser(ports, {
      method: "POST",
      cookie: `wasp_session=${TOKEN}`,
    });
    expect(res).toMatchObject({ kind: "reject", status: 403 });
    expect(ports.sessionPort.findSessionAuth).not.toHaveBeenCalled();
  });

  it("x-actionamp-api satisfies the stance header too; value is irrelevant, presence is the signal", async () => {
    const ports = mockPorts({ sessionRow: liveRow() });
    const viaActionampApi = await resolveActingUser(ports, {
      method: "POST",
      cookie: `wasp_session=${TOKEN}`,
      actionAmpApi: "1",
    });
    expect(viaActionampApi).toMatchObject({ kind: "authenticated" });
    const viaEmpty = await resolveActingUser(ports, {
      method: "POST",
      cookie: `wasp_session=${TOKEN}`,
      requestedWith: "   ",
    });
    expect(viaEmpty).toMatchObject({ kind: "reject", status: 403 });
  });

  it("Bearer-authed mutations are CSRF-exempt (both CLIs) — no header required", async () => {
    const ports = mockPorts({ sessionRow: liveRow() });
    const res = await resolveActingUser(ports, {
      method: "POST",
      authorization: `Bearer ${TOKEN}`,
    });
    expect(res).toMatchObject({ kind: "authenticated", via: "session" });
  });

  it("GET with a cookie but no header is exempt (SameSite=Lax + side-effect-free reads)", async () => {
    const ports = mockPorts({ sessionRow: liveRow() });
    const res = await resolveActingUser(ports, {
      method: "GET",
      cookie: `wasp_session=${TOKEN}`,
    });
    expect(res).toMatchObject({ kind: "authenticated" });
  });

  it("expired cookie session still 401s (via handlers) even with the CSRF header", async () => {
    const ports = mockPorts({
      sessionRow: { expiresAt: new Date(Date.now() - 1000), authUserId: "auth-1" },
    });
    const res = await resolveActingUser(ports, {
      method: "POST",
      cookie: `wasp_session=${TOKEN}`,
      requestedWith: "actionamp",
    });
    // CSRF passed, session dead → unauthenticated → typed 401 at the handler.
    expect(res).toEqual({ kind: "unauthenticated", via: "session" });
    expect(ports.sessionPort.deleteSession).toHaveBeenCalledWith(TOKEN);
  });
});

describe("resolveActingUser — PAT error surfacing (webapp bodies)", () => {
  it("aa_-prefixed but malformed body → 401 exact patMiddleware body at the wrapper", async () => {
    const ports = mockPorts();
    const res = await resolveActingUser(ports, {
      method: "POST",
      authorization: "Bearer aa_", // prefix present, body empty → PAT namespace, malformed
    });
    expect(res).toEqual({
      kind: "reject",
      status: 401,
      body: { error: "Missing or malformed bearer token." },
    });
    // Non-aa_ garbage stays in the session namespace (no format assumption
    // there — exact-string lookup), covered by the test above.
  });

  it("unknown aa_ Bearer → 401 exact patMiddleware body at the wrapper", async () => {
    const ports = mockPorts({ patRow: null });
    const res = await resolveActingUser(ports, {
      method: "POST",
      authorization: `Bearer ${"aa_" + "A".repeat(43)}`,
    });
    expect(res).toEqual({
      kind: "reject",
      status: 401,
      body: { error: "Invalid or revoked token." },
    });
  });

  it("FREE-user PAT → 402 with feature/reason before any handler", async () => {
    const ports = mockPorts({
      patRow: { ...patUser(), plan: "FREE", planRenewsAt: null, apiKeyId: "key-1" },
    });
    const res = await resolveActingUser(ports, {
      method: "POST",
      authorization: "Bearer aa_freetoken",
    });
    expect(res).toMatchObject({
      kind: "reject",
      status: 402,
      body: { feature: "CLI and API access" },
    });
  });
});
