import { describe, it, expect, vi } from "vitest";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_INTERVAL_MS,
  createCode,
  displayNameFromEmail,
  hash,
  isLocalhostClientUrl,
  requestMagicLoginCore,
  resolveMagicEnv,
  safeAuthReturnTo,
  buildMagicLoginUrl,
  verifyMagicLoginCore,
} from "./magic.js";
import type {
  MagicChallengeRow,
  MagicRequestPort,
  MagicVerifyPort,
} from "./magic.js";
import type { SessionIssuePort } from "./issue.js";

/**
 * S10 tests — the magic-login lifecycle cores against mocked ports
 * (EntitySpy pattern, like pat.test.ts). Pins the webapp magicLogin.ts
 * parity surface: rate limit + identical {sent:true}, supersede, hashing
 * scheme (sha256(id:code) / sha256(token)), TTL, single-use atomic consume,
 * 5-attempt lockout, the localhost fixed code, email-failure → challenge
 * deleted + 503, returnTo sanitization, and the verify identity/issuance
 * flow including login-activity recording.
 */

const NOW = new Date("2026-09-01T12:00:00.000Z");
const ENV = { now: NOW, baseUrl: "http://localhost:4000", localhost: true };

function challengeRow(overrides: Partial<MagicChallengeRow> = {}): MagicChallengeRow {
  return {
    id: "challenge-1",
    email: "user@test.dev",
    codeHash: hash("challenge-1:111111"),
    tokenHash: hash("link-token"),
    expiresAt: new Date(NOW.getTime() + CODE_TTL_MS),
    consumedAt: null,
    attempts: 0,
    createdAt: NOW,
    ...overrides,
  };
}

type RequestSpies = {
  findRecentActiveChallenge: ReturnType<typeof vi.fn>;
  consumeAllForEmail: ReturnType<typeof vi.fn>;
  createChallenge: ReturnType<typeof vi.fn>;
  deleteChallenge: ReturnType<typeof vi.fn>;
  sendLoginEmail: ReturnType<typeof vi.fn>;
};

function mockRequestPort(
  recent: { id: string } | null = null,
): { port: MagicRequestPort; spies: RequestSpies } {
  const spies: RequestSpies = {
    findRecentActiveChallenge: vi.fn().mockResolvedValue(recent),
    consumeAllForEmail: vi.fn().mockResolvedValue(undefined),
    createChallenge: vi.fn().mockResolvedValue(undefined),
    deleteChallenge: vi.fn().mockResolvedValue(undefined),
    sendLoginEmail: vi.fn().mockResolvedValue(undefined),
  };
  return { port: spies as unknown as MagicRequestPort, spies };
}

function mockVerifyPort(
  challenge: MagicChallengeRow | null,
  overrides: Partial<MagicVerifyPort> = {},
): MagicVerifyPort {
  return {
    findChallengeByTokenHash: vi.fn().mockResolvedValue(
      challenge ?? null,
    ),
    findLatestActiveChallengeForEmail: vi.fn().mockResolvedValue(challenge),
    incrementAttempts: vi.fn().mockResolvedValue(undefined),
    consumeChallenge: vi.fn().mockResolvedValue(true),
    findEmailIdentity: vi.fn().mockResolvedValue({ authId: "auth-1" }),
    createEmailIdentityUser: vi
      .fn()
      .mockResolvedValue({ authId: "auth-new", userId: "user-new" }),
    findUserIdByAuthId: vi.fn().mockResolvedValue("user-1"),
    recordLoginActivity: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MagicVerifyPort;
}

function mockIssuePort(): SessionIssuePort {
  return { insertSession: vi.fn().mockResolvedValue(undefined) };
}

describe("constants + helpers — webapp magicLogin.ts parity", () => {
  it("constants: 10-min TTL, 60-s resend interval, 5 attempts", () => {
    expect(CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(RESEND_INTERVAL_MS).toBe(60 * 1000);
    expect(MAX_ATTEMPTS).toBe(5);
  });

  it("localhost gate: hostname localhost → true; else the NODE_ENV fallback", () => {
    expect(isLocalhostClientUrl("http://localhost:4000")).toBe(true);
    expect(isLocalhostClientUrl("http://127.0.0.1:5174")).toBe(false);
    expect(isLocalhostClientUrl("https://app.actionamp.com")).toBe(false);
  });

  it("createCode: fixed 111111 on localhost, 6 digits in prod", () => {
    expect(createCode(true)).toBe("111111");
    for (let i = 0; i < 20; i++) {
      expect(createCode(false)).toMatch(/^\d{6}$/);
    }
  });

  it("displayNameFromEmail: split on [._+-]+, capitalize, There fallback", () => {
    expect(displayNameFromEmail("zeljko.dakic@x.co")).toEqual({
      fullName: "Zeljko Dakic",
      firstName: "Zeljko",
    });
    expect(displayNameFromEmail("a+b@x.co").fullName).toBe("A B");
    expect(displayNameFromEmail("@x.co")).toEqual({
      fullName: "There",
      firstName: "There",
    });
  });

  it("resolveMagicEnv defaults to the webapp client URL", () => {
    const env = resolveMagicEnv({ now: NOW });
    expect(env.baseUrl).toBe("http://localhost:4000");
    expect(env.localhost).toBe(true);
  });

  it("prod hardening: NODE_ENV=production never gets the fixed code, even on a localhost client URL", () => {
    // The webapp keyed isLocalhost() on the hostname alone — a prod deploy
    // without WASP_WEB_CLIENT_URL would resolve the localhost default and
    // answer every login with the universal 111111 code. S10 fails closed:
    // prod takes the random-code + real-send path (503 if the send fails).
    vi.stubEnv("NODE_ENV", "production");
    try {
      const misconfigured = resolveMagicEnv({ now: NOW });
      expect(misconfigured.baseUrl).toBe("http://localhost:4000");
      expect(misconfigured.localhost).toBe(false);
      expect(createCode(misconfigured.localhost)).not.toBe("111111");

      const configured = resolveMagicEnv({
        now: NOW,
        baseUrl: "https://app.actionamp.com",
      });
      expect(configured.localhost).toBe(false);

      // Dev keeps the fixed code.
      vi.stubEnv("NODE_ENV", "development");
      expect(resolveMagicEnv({ now: NOW }).localhost).toBe(true);
      // An unset NODE_ENV (local `bun start`) also keeps it — a local box.
      vi.stubEnv("NODE_ENV", "");
      expect(resolveMagicEnv({ now: NOW }).localhost).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("safeAuthReturnTo / buildMagicLoginUrl — returnTo.ts port", () => {
  it("accepts same-origin relative paths only", () => {
    expect(safeAuthReturnTo("/do/inbox?a=1#frag")).toBe("/do/inbox?a=1#frag");
    expect(safeAuthReturnTo(undefined)).toBe("/do");
    expect(safeAuthReturnTo("https://evil.co/do")).toBe("/do");
    expect(safeAuthReturnTo("//evil.co/do")).toBe("/do");
    expect(safeAuthReturnTo("/\\evil.co")).toBe("/do");
    expect(safeAuthReturnTo("javascript:alert(1)")).toBe("/do");
  });

  it("buildMagicLoginUrl: /login?magic=<token>&returnTo=<safe>", () => {
    const url = buildMagicLoginUrl("http://localhost:4000", "tok", "/do");
    expect(url).toBe("http://localhost:4000/login?magic=tok&returnTo=%2Fdo");
  });
});

describe("requestMagicLoginCore", () => {
  it("rate-limited: recent active challenge → identical {sent:true}, no new row, no send", async () => {
    const { port, spies } = mockRequestPort({ id: "recent" });
    const result = await requestMagicLoginCore(
      port,
      { email: "User@Test.dev" },
      ENV,
    );
    expect(result).toEqual({ sent: true });
    expect(spies.consumeAllForEmail).not.toHaveBeenCalled();
    expect(spies.createChallenge).not.toHaveBeenCalled();
    expect(spies.sendLoginEmail).not.toHaveBeenCalled();
  });

  it("fresh request: supersedes older challenges, stores hashed code+token", async () => {
    const { port, spies } = mockRequestPort(null);
    const result = await requestMagicLoginCore(
      port,
      { email: "  User@Test.dev ", returnTo: "/do/inbox" },
      ENV,
    );
    expect(result).toEqual({ sent: true });
    expect(spies.consumeAllForEmail).toHaveBeenCalledWith(
      "user@test.dev",
      NOW,
    );
    const row = spies.createChallenge.mock.calls[0][0] as {
      id: string;
      email: string;
      codeHash: string;
      tokenHash: string;
      expiresAt: Date;
    };
    expect(row.email).toBe("user@test.dev");
    expect(row.codeHash).toBe(hash(`${row.id}:111111`));
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.expiresAt.getTime() - NOW.getTime()).toBe(CODE_TTL_MS);
  });

  it("localhost: skips the email send entirely", async () => {
    const { port, spies } = mockRequestPort(null);
    await requestMagicLoginCore(port, { email: "a@b.co" }, ENV);
    expect(spies.sendLoginEmail).not.toHaveBeenCalled();
  });

  it("prod: sends with the built login URL; failure deletes the challenge + 503", async () => {
    const prodEnv = { ...ENV, localhost: false };
    const ok = mockRequestPort(null);
    await requestMagicLoginCore(ok.port, { email: "a@b.co" }, prodEnv);
    expect(ok.spies.sendLoginEmail).toHaveBeenCalledTimes(1);
    const args = ok.spies.sendLoginEmail.mock.calls[0][0] as {
      to: string;
      code: string;
      loginUrl: string;
    };
    expect(args.to).toBe("a@b.co");
    expect(args.loginUrl).toContain("/login?magic=");

    const fail = mockRequestPort(null);
    fail.spies.sendLoginEmail.mockRejectedValue(new Error("resend down"));
    await expect(
      requestMagicLoginCore(fail.port, { email: "a@b.co" }, prodEnv),
    ).rejects.toMatchObject({
      status: 503,
      message: "Could not send email. Try again shortly.",
    });
    expect(fail.spies.deleteChallenge).toHaveBeenCalledTimes(1);
  });

  it("invalid email → 400 Enter a valid email.", async () => {
    const { port } = mockRequestPort(null);
    await expect(
      requestMagicLoginCore(port, { email: "not-an-email" }, ENV),
    ).rejects.toMatchObject({ status: 400, message: "Enter a valid email." });
    await expect(
      requestMagicLoginCore(port, { email: "" }, ENV),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("verifyMagicLoginCore", () => {
  it("code path: correct code consumes atomically and issues a session", async () => {
    const challenge = challengeRow();
    const verifyPort = mockVerifyPort(challenge);
    const issue = mockIssuePort();
    const result = await verifyMagicLoginCore(
      verifyPort,
      { email: "user@test.dev", code: "111111" },
      ENV,
      issue,
    );
    expect(verifyPort.findLatestActiveChallengeForEmail).toHaveBeenCalledWith(
      "user@test.dev",
      NOW,
    );
    expect(verifyPort.consumeChallenge).toHaveBeenCalledWith("challenge-1", NOW);
    expect(verifyPort.findEmailIdentity).toHaveBeenCalledWith("user@test.dev");
    // Existing identity: NO user creation, session for the found Auth id.
    expect(verifyPort.createEmailIdentityUser).not.toHaveBeenCalled();
    expect(issue.insertSession).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-z2-7]{40}$/),
      "auth-1",
      expect.any(Date),
    );
    expect(result.sessionId).toMatch(/^[a-z2-7]{40}$/);
    expect(result.userId).toBe("user-1");
    expect(verifyPort.recordLoginActivity).toHaveBeenCalledWith("user-1", "magic");
  });

  it("wrong code: increments attempts, 400 not-valid message", async () => {
    const challenge = challengeRow();
    const verifyPort = mockVerifyPort(challenge);
    await expect(
      verifyMagicLoginCore(
        verifyPort,
        { email: "user@test.dev", code: "999999" },
        ENV,
        mockIssuePort(),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "That code is not valid. Try again or request a new one.",
    });
    expect(verifyPort.incrementAttempts).toHaveBeenCalledWith("challenge-1");
    expect(verifyPort.consumeChallenge).not.toHaveBeenCalled();
  });

  it("no challenge left (expired/exhausted): same not-valid 400, no increment", async () => {
    const verifyPort = mockVerifyPort(null);
    await expect(
      verifyMagicLoginCore(
        verifyPort,
        { email: "user@test.dev", code: "111111" },
        ENV,
        mockIssuePort(),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(verifyPort.incrementAttempts).not.toHaveBeenCalled();
  });

  it("five attempts exhausted: the lookup filter (attempts < 5) drops the row", async () => {
    // The drizzle port filters attempts < MAX_ATTEMPTS; simulate exhaustion by
    // the port answering null (what a 5-attempts row produces).
    const verifyPort = mockVerifyPort(null);
    await expect(
      verifyMagicLoginCore(
        verifyPort,
        { email: "user@test.dev", code: "111111" },
        ENV,
        mockIssuePort(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("expiry + attempts filtering live in the port's lookup (core passes now)", async () => {
    // The webapp pushed expiry (`expiresAt: { gt: now }`) and the attempt cap
    // (`attempts: { lt: 5 }`) into the Prisma where-clause; the drizzle port
    // owns the same filter. The core's contract: pass `now` so the filter is
    // evaluated at call time, and treat null as not-valid.
    const challenge = challengeRow();
    const verifyPort = mockVerifyPort(challenge);
    await verifyMagicLoginCore(
      verifyPort,
      { email: "user@test.dev", code: "111111" },
      ENV,
      mockIssuePort(),
    );
    expect(verifyPort.findLatestActiveChallengeForEmail).toHaveBeenCalledWith(
      "user@test.dev",
      NOW,
    );
  });

  it("non-6-digit code → 400 Enter the six-digit code.", async () => {
    const verifyPort = mockVerifyPort(challengeRow());
    await expect(
      verifyMagicLoginCore(
        verifyPort,
        { email: "user@test.dev", code: "12ab" },
        ENV,
        mockIssuePort(),
      ),
    ).rejects.toMatchObject({ status: 400, message: "Enter the six-digit code." });
  });

  it("link path: resolves by token hash; unknown token → link-no-longer-valid", async () => {
    const verifyPort = mockVerifyPort(challengeRow());
    const result = await verifyMagicLoginCore(
      verifyPort,
      { token: "link-token" },
      ENV,
      mockIssuePort(),
    );
    expect(verifyPort.findChallengeByTokenHash).toHaveBeenCalledWith(
      hash("link-token"),
      NOW,
    );
    expect(result.sessionId).toMatch(/^[a-z2-7]{40}$/);

    const missing = mockVerifyPort(null);
    await expect(
      verifyMagicLoginCore(missing, { token: "bogus" }, ENV, mockIssuePort()),
    ).rejects.toMatchObject({
      status: 400,
      message: "That sign-in link is no longer valid. Request a new one.",
    });
  });

  it("atomic consume: losing a race → 400 already-used, no session", async () => {
    const verifyPort = mockVerifyPort(challengeRow(), {
      consumeChallenge: vi.fn().mockResolvedValue(false),
    });
    const issue = mockIssuePort();
    await expect(
      verifyMagicLoginCore(
        verifyPort,
        { email: "user@test.dev", code: "111111" },
        ENV,
        issue,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "That sign-in link was already used.",
    });
    expect(issue.insertSession).not.toHaveBeenCalled();
  });

  it("unknown email: creates the user (scrypt-hashed unusable password) + session", async () => {
    // A live challenge exists, but no email identity behind it (first login).
    const verifyPort = mockVerifyPort(challengeRow({ email: "new.user@x.co" }), {
      findEmailIdentity: vi.fn().mockResolvedValue(null),
    });
    const issue = mockIssuePort();
    const result = await verifyMagicLoginCore(
      verifyPort,
      { email: "new.user@x.co", code: "111111" },
      ENV,
      issue,
    );
    const create = (verifyPort.createEmailIdentityUser as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(create[0]).toBe("new.user@x.co");
    expect(create[1]).toEqual({ fullName: "New User", firstName: "New" });
    // Lucia scrypt format: "salt:key", both hex.
    expect(create[2]).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(issue.insertSession).toHaveBeenCalledWith(
      expect.any(String),
      "auth-new",
      expect.any(Date),
    );
    expect(result.userId).toBe("user-new");
  });

  it("login-activity failure never fails the login", async () => {
    const verifyPort = mockVerifyPort(challengeRow(), {
      recordLoginActivity: vi.fn().mockRejectedValue(new Error("log write failed")),
    });
    const result = await verifyMagicLoginCore(
      verifyPort,
      { email: "user@test.dev", code: "111111" },
      ENV,
      mockIssuePort(),
    );
    expect(result.sessionId).toMatch(/^[a-z2-7]{40}$/);
  });
});
