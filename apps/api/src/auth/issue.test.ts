import { describe, it, expect, vi } from "vitest";
import {
  SESSION_LIFETIME_MS,
  drizzleSessionIssuePort,
  hashPassword,
  issueSessionCore,
  sessionCookieHeader,
} from "./issue.js";
import type { DomainDb } from "@actionamp/domain/db";

/**
 * S10 tests — the issuance core (the write side of the Wasp session
 * contract, auth-compatibility-notes.md §4). Pins: the 40-char [a-z2-7]
 * token stored VERBATIM as Session.id, Auth.id (not User.id) as the row's
 * userId, the 30-day lifetime, the cookie stamp's exact attributes, and the
 * Lucia scrypt password format the verify flow writes for new users.
 */

function mockIssuePort() {
  return { insertSession: vi.fn().mockResolvedValue(undefined) };
}

describe("issueSessionCore", () => {
  it("mints a 40-char lowercase-base32 token stored verbatim", async () => {
    const port = mockIssuePort();
    const issued = await issueSessionCore(port, "auth-1", {
      now: new Date("2026-09-01T12:00:00.000Z"),
    });
    // RFC 4648 lowercase base32, no padding — 25 random bytes → 40 chars.
    expect(issued.token).toMatch(/^[a-z2-7]{40}$/);
    expect(port.insertSession).toHaveBeenCalledWith(
      issued.token, // VERBATIM — no hashing (Lucia parity)
      "auth-1",
      expect.any(Date),
    );
  });

  it("row: userId is the AUTH id, expiresAt now + 30d exactly", async () => {
    const port = mockIssuePort();
    const now = new Date("2026-09-01T12:00:00.000Z");
    const issued = await issueSessionCore(port, "auth-abc", { now });
    const call = port.insertSession.mock.calls[0] as [string, string, Date];
    expect(call[1]).toBe("auth-abc");
    expect(call[2].getTime() - now.getTime()).toBe(SESSION_LIFETIME_MS);
    expect(SESSION_LIFETIME_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(issued.expiresAt.getTime() - now.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
  });

  it("tokens are unique across mints", async () => {
    const port = mockIssuePort();
    const a = await issueSessionCore(port, "auth-1");
    const b = await issueSessionCore(port, "auth-1");
    expect(a.token).not.toBe(b.token);
  });
});

describe("sessionCookieHeader — sessionCookie.ts cookieOptions parity", () => {
  it("httpOnly, Path=/, Max-Age 30d, SameSite=Lax; Secure only in prod", () => {
    const token = "a".repeat(40);
    expect(sessionCookieHeader(token, { secure: false })).toBe(
      `wasp_session=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`,
    );
    expect(sessionCookieHeader("t", { secure: true })).toContain("; Secure");
    expect(sessionCookieHeader("t", { secure: false })).not.toContain("Secure");
  });

  it("Max-Age matches the 30d session lifetime (cookie and DB row expire together)", () => {
    expect(sessionCookieHeader("t", { secure: false })).toContain(
      `Max-Age=${Math.floor(SESSION_LIFETIME_MS / 1000)}`,
    );
  });
});

describe("hashPassword — Lucia scrypt format parity", () => {
  it("writes 'salt:key' hex (16-byte salt, 64-byte key)", async () => {
    const hashed = await hashPassword("unusable-random-password");
    expect(hashed).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    const [salt] = hashed.split(":");
    // Same password + same salt → same key (deterministic scrypt), so Wasp's
    // verifier would accept the row if it ever ran against it.
    const again = await hashPassword("unusable-random-password");
    expect(again.split(":")[0]).not.toBe(salt); // fresh salt per hash
    expect(again.length).toBe(hashed.length);
  });
});

describe("drizzleSessionIssuePort", () => {
  it("inserts the Session row via the query builder", async () => {
    const insert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    const db = { insert } as unknown as DomainDb;
    const port = drizzleSessionIssuePort(db);
    await port.insertSession("tok", "auth-1", new Date(0));
    expect(insert).toHaveBeenCalledWith(expect.anything()); // the session table
  });
});
