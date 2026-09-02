import { describe, it, expect, vi } from "vitest";
import {
  generateSessionToken,
  readSessionCookie,
  validateSessionCore,
  SESSION_HALF_LIFE_MS,
  SESSION_TTL_MS,
} from "./session.js";
import type { SessionAuthPort, SessionUser } from "./session.js";

/**
 * F10a tests — the session validation core against a mocked SessionAuthPort
 * (EntitySpy pattern, packages/domain/src/test/mockContext.ts style). The
 * drizzle port itself is exercised by the F10a curl proofs against
 * actionamp_dev; these pin the orchestration: exact-string lookup, lazy
 * expiry deletion, half-life extension with no id rotation, orphan rejection.
 */

const NOW = Date.now();

function baseUser(): SessionUser {
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

interface PortBehavior {
  row?: { expiresAt: Date; authUserId: string | null } | null;
  user?: SessionUser | null;
}

function mockPort(behavior: PortBehavior = {}) {
  const port: SessionAuthPort = {
    findSessionAuth: vi.fn().mockResolvedValue(
      behavior.row === undefined ? null : behavior.row,
    ),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    extendSession: vi.fn().mockResolvedValue(undefined),
    findUserWithEmail: vi
      .fn()
      .mockResolvedValue(behavior.user === undefined ? baseUser() : behavior.user),
  };
  return port;
}

describe("generateSessionToken — Wasp/Lucia token format", () => {
  it("mints exactly 40 chars of lowercase base32 ([a-z2-7], no padding)", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateSessionToken()).toMatch(/^[a-z2-7]{40}$/);
    }
  });

  it("does not repeat tokens", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });
});

describe("readSessionCookie — webapp sessionCookie.ts parity", () => {
  it("extracts wasp_session from a multi-cookie header", () => {
    expect(
      readSessionCookie("other=x; wasp_session=abc234567abc234567abc234567abc234567abcd; more=y"),
    ).toBe("abc234567abc234567abc234567abc234567abcd");
  });

  it("URI-decodes the value (decodeURIComponent with raw fallback)", () => {
    expect(readSessionCookie("wasp_session=a%20b")).toBe("a b");
    // A bare % is malformed URI — falls back to the raw value.
    expect(readSessionCookie("wasp_session=a%b")).toBe("a%b");
  });

  it("returns undefined for absent header, absent cookie, or empty value", () => {
    expect(readSessionCookie(undefined)).toBeUndefined();
    expect(readSessionCookie("other=x")).toBeUndefined();
    expect(readSessionCookie("wasp_session=")).toBeUndefined();
  });
});

describe("validateSessionCore — F10a expiry semantics (Lucia parity)", () => {
  it("absent token → null with zero DB work", async () => {
    const port = mockPort();
    await expect(validateSessionCore(port, null)).resolves.toBeNull();
    await expect(validateSessionCore(port, "")).resolves.toBeNull();
    expect(port.findSessionAuth).not.toHaveBeenCalled();
  });

  it("unknown token → null (no row, no side effects)", async () => {
    const port = mockPort();
    await expect(validateSessionCore(port, "nope")).resolves.toBeNull();
    expect(port.findSessionAuth).toHaveBeenCalledWith("nope");
    expect(port.deleteSession).not.toHaveBeenCalled();
    expect(port.extendSession).not.toHaveBeenCalled();
  });

  it("valid session → hydrated user, no writes", async () => {
    const port = mockPort({
      row: { expiresAt: new Date(NOW + SESSION_TTL_MS), authUserId: "auth-1" },
    });
    await expect(validateSessionCore(port, "tok")).resolves.toMatchObject({
      id: "user-1",
      email: "dev@local.test",
    });
    expect(port.deleteSession).not.toHaveBeenCalled();
    expect(port.extendSession).not.toHaveBeenCalled();
  });

  it("expired session → null AND the row deleted (lazy cleanup)", async () => {
    const port = mockPort({
      row: { expiresAt: new Date(NOW - 1000), authUserId: "auth-1" },
    });
    await expect(validateSessionCore(port, "expired-tok")).resolves.toBeNull();
    expect(port.deleteSession).toHaveBeenCalledWith("expired-tok");
    expect(port.findUserWithEmail).not.toHaveBeenCalled();
  });

  it("past half-life → expiresAt rewritten to now+30d on the SAME id (no rotation)", async () => {
    const port = mockPort({
      row: {
        expiresAt: new Date(NOW + SESSION_HALF_LIFE_MS - 60_000), // 1 min inside the renewal window
        authUserId: "auth-1",
      },
    });
    await expect(validateSessionCore(port, "aging-tok")).resolves.toMatchObject({
      id: "user-1",
    });
    expect(port.extendSession).toHaveBeenCalledTimes(1);
    const [id, newExpiresAt] = vi.mocked(port.extendSession).mock.calls[0];
    expect(id).toBe("aging-tok"); // id unchanged — extension, not rotation
    expect(newExpiresAt!.getTime()).toBeGreaterThanOrEqual(NOW + SESSION_TTL_MS);
    expect(newExpiresAt!.getTime()).toBeLessThan(NOW + SESSION_TTL_MS + 5000);
  });

  it("just outside the half-life window → no extension", async () => {
    const port = mockPort({
      row: {
        expiresAt: new Date(NOW + SESSION_HALF_LIFE_MS + 60_000),
        authUserId: "auth-1",
      },
    });
    await validateSessionCore(port, "fresh-tok");
    expect(port.extendSession).not.toHaveBeenCalled();
  });

  it("orphan Auth (Auth.userId null) → null, no side effects (authenticates nobody)", async () => {
    const port = mockPort({
      row: { expiresAt: new Date(NOW + SESSION_TTL_MS), authUserId: null },
    });
    await expect(validateSessionCore(port, "orphan-tok")).resolves.toBeNull();
    expect(port.deleteSession).not.toHaveBeenCalled();
    expect(port.findUserWithEmail).not.toHaveBeenCalled();
  });

  it("user row missing after a valid session → null AND row deleted (Lucia parity)", async () => {
    const port = mockPort({
      row: { expiresAt: new Date(NOW + SESSION_TTL_MS), authUserId: "auth-1" },
      user: null,
    });
    await expect(validateSessionCore(port, "ghost-tok")).resolves.toBeNull();
    expect(port.deleteSession).toHaveBeenCalledWith("ghost-tok");
  });
});
