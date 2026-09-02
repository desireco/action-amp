import { describe, it, expect, vi } from "vitest";
import {
  generatePat,
  hashToken,
  looksLikeToken,
  readBearerToken,
  resolvePatCore,
} from "./pat.js";
import type { PatLookupPort, PatUser } from "./pat.js";

/**
 * F10b tests — the PAT resolution core against a mocked PatLookupPort
 * (EntitySpy pattern). Pins: exact 401 bodies from webapp patMiddleware, the
 * hash-then-index-lookup contract, the 402 entitlement gate placement (before
 * handlers), and the fire-and-forget lastUsedAt stamp.
 */

function patUser(overrides: Partial<PatUser> = {}): PatUser & { apiKeyId: string } {
  return {
    apiKeyId: "key-1",
    id: "user-1",
    plan: "PRO",
    planRenewsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    isAdmin: false,
    manualAccessGrant: null,
    email: "cli@local.test",
    fullName: "Cli User",
    ...overrides,
  };
}

function mockPort(row: (PatUser & { apiKeyId: string }) | null = patUser()) {
  const port: PatLookupPort = {
    findApiKeyUserByHash: vi.fn().mockResolvedValue(row),
    touchApiKey: vi.fn().mockResolvedValue(undefined),
  };
  return port;
}

describe("token shape utilities — webapp pat.ts parity", () => {
  it("generatePat: aa_ + 43 base64url chars", () => {
    const token = generatePat();
    expect(token).toMatch(/^aa_[A-Za-z0-9_-]{43}$/);
  });

  it("hashToken: sha256 hex of the full plaintext (aa_ included)", () => {
    // Pinned digest (`printf %s 'aa_x' | sha256sum`) so the storage contract —
    // lowercase-hex SHA-256 of the FULL plaintext, prefix included — can't drift.
    expect(hashToken("aa_x")).toBe(
      "628d146ac85647bb88e1dcd870a7e033af69e8e3a909cca27a8db5b7f49e79a4",
    );
    expect(hashToken("aa_x")).not.toBe(hashToken("aa_y"));
  });

  it("looksLikeToken: aa_ prefix + base64url body only", () => {
    expect(looksLikeToken(generatePat())).toBe(true);
    expect(looksLikeToken("aa_abc")).toBe(true);
    expect(looksLikeToken("abc")).toBe(false); // no prefix
    expect(looksLikeToken("aa_")).toBe(false); // empty body
    expect(looksLikeToken("aa_ab c")).toBe(false); // space in body
  });

  it("readBearerToken: case-insensitive scheme (the accepted superset)", () => {
    expect(readBearerToken("Bearer aa_x")).toBe("aa_x");
    expect(readBearerToken("bearer aa_x")).toBe("aa_x");
    expect(readBearerToken("BEARER   aa_x")).toBe("aa_x");
    expect(readBearerToken("Basic aa_x")).toBeNull();
    expect(readBearerToken(undefined)).toBeNull();
  });
});

describe("resolvePatCore — F10b patMiddleware parity", () => {
  it("valid, entitled PAT → ok + user; hash lookup on the sha256 of the plaintext", async () => {
    const port = mockPort();
    const res = await resolvePatCore(port, "Bearer aa_goodtoken");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user).toMatchObject({ id: "user-1", email: "cli@local.test" });
      expect(res.apiKeyId).toBe("key-1");
    }
    expect(port.findApiKeyUserByHash).toHaveBeenCalledWith(hashToken("aa_goodtoken"));
  });

  it("stamps lastUsedAt after the gate (fire-and-forget)", async () => {
    const port = mockPort();
    await resolvePatCore(port, "Bearer aa_goodtoken");
    expect(port.touchApiKey).toHaveBeenCalledWith("key-1", expect.any(Date));
  });

  it("missing header → 401 exact webapp body", async () => {
    const port = mockPort();
    const res = await resolvePatCore(port, undefined);
    expect(res).toEqual({
      ok: false,
      status: 401,
      body: { error: "Missing or malformed bearer token." },
    });
    expect(port.findApiKeyUserByHash).not.toHaveBeenCalled();
  });

  it("malformed header (wrong scheme / not aa_) → 401 exact webapp body, no hash spent", async () => {
    const port = mockPort();
    for (const header of ["Basic abc", "Bearer not-a-pat-prefix", "Bearer aa_"]) {
      const res = await resolvePatCore(port, header);
      expect(res).toEqual({
        ok: false,
        status: 401,
        body: { error: "Missing or malformed bearer token." },
      });
    }
    expect(port.findApiKeyUserByHash).not.toHaveBeenCalled();
  });

  it("unknown token → 401 exact webapp body (same as revoked — no probing oracle)", async () => {
    const port = mockPort(null);
    const res = await resolvePatCore(port, "Bearer aa_unknown");
    expect(res).toEqual({
      ok: false,
      status: 401,
      body: { error: "Invalid or revoked token." },
    });
    expect(port.touchApiKey).not.toHaveBeenCalled();
  });

  it("FREE user → 402 before handlers, exact webapp shape (feature/reason)", async () => {
    const port = mockPort(patUser({ plan: "FREE", planRenewsAt: null }));
    const res = await resolvePatCore(port, "Bearer aa_freetoken");
    expect(res).toEqual({
      ok: false,
      status: 402,
      body: {
        error: "CLI and API access is a Pro feature.",
        feature: "CLI and API access",
        reason: "use ActionAmp from the terminal or with an agent",
      },
    });
    expect(port.touchApiKey).not.toHaveBeenCalled();
  });

  it("isAdmin bypasses the gate; manualAccessGrant entitled too", async () => {
    const adminPort = mockPort(patUser({ plan: "FREE", isAdmin: true }));
    await expect(resolvePatCore(adminPort, "Bearer aa_admin")).resolves.toMatchObject({
      ok: true,
    });
    const grantedPort = mockPort(
      patUser({ plan: "FREE", manualAccessGrant: "FRIEND" }),
    );
    await expect(resolvePatCore(grantedPort, "Bearer aa_friend")).resolves.toMatchObject({
      ok: true,
    });
  });

  it("expired PRO plan (planRenewsAt past) → 402 (plan state re-checked per request)", async () => {
    const port = mockPort(
      patUser({ plan: "PRO", planRenewsAt: new Date(Date.now() - 1000) }),
    );
    const res = await resolvePatCore(port, "Bearer aa_lapsed");
    expect(res).toMatchObject({ ok: false, status: 402 });
  });
});
