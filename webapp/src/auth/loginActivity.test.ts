import { describe, expect, it, vi } from "vitest";
import {
  boundedLoginProvider,
  recordLoginActivity,
  recordLoginActivitySafely,
} from "./loginActivity";

function entities() {
  return {
    User: { update: vi.fn().mockResolvedValue(undefined) },
    LoginEvent: { create: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("login activity", () => {
  it("updates last login and records a bounded provider without historical backfill", async () => {
    const db = entities();
    await recordLoginActivity(db, "user-1", "email");
    expect(db.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(db.LoginEvent.create).toHaveBeenCalledWith({
      data: { userId: "user-1", provider: "email", createdAt: expect.any(Date) },
    });
  });

  it("bounds unknown providers and does not persist credential-shaped input", () => {
    expect(boundedLoginProvider("google")).toBe("google");
    expect(boundedLoginProvider("secret-token@example.com")).toBe("other");
  });

  it("swallows recorder failures after authentication succeeds", async () => {
    const db = entities();
    db.User.update.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(recordLoginActivitySafely(db, "user-1", "magic")).resolves.toBeUndefined();
  });
});
