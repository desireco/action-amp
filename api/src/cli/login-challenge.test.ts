import { describe, expect, it } from "vitest";
import {
  createChallengeStore,
  createLoginChallengeRoute,
  isChallengeState,
} from "./login-challenge.js";

describe("challenge store", () => {
  it("holds a token under its state and yields it exactly once", () => {
    const store = createChallengeStore();
    store.put("a".repeat(32), "aa_token");
    expect(store.take("a".repeat(32))).toBe("aa_token");
    expect(store.take("a".repeat(32))).toBeNull();
  });

  it("expires entries after the TTL", () => {
    let clock = 0;
    const store = createChallengeStore(1000, () => clock);
    store.put("b".repeat(32), "aa_token");
    clock = 1500;
    expect(store.take("b".repeat(32))).toBeNull();
  });

  it("unknown states stay null", () => {
    const store = createChallengeStore();
    expect(store.take("c".repeat(32))).toBeNull();
  });

  it("a re-put overwrites the previous entry", () => {
    const store = createChallengeStore();
    store.put("d".repeat(32), "aa_first");
    store.put("d".repeat(32), "aa_second");
    expect(store.take("d".repeat(32))).toBe("aa_second");
  });
});

describe("isChallengeState", () => {
  it("accepts hex nonces in the CLI's shape", () => {
    expect(isChallengeState("0123456789abcdef".repeat(2))).toBe(true);
  });
  it("rejects non-hex, non-string, and out-of-range lengths", () => {
    expect(isChallengeState("zzz")).toBe(false);
    expect(isChallengeState(42)).toBe(false);
    expect(isChallengeState("ab".repeat(7))).toBe(false); // 14 chars — too short
    expect(isChallengeState("ab".repeat(65))).toBe(false); // too long
  });
});

describe("GET /api/auth/cli-login-challenge", () => {
  it("answers pending until the mint lands, then complete exactly once", async () => {
    const store = createChallengeStore();
    const app = createLoginChallengeRoute(store);
    const state = "e".repeat(32);

    const before = await app.request(`/api/auth/cli-login-challenge?state=${state}`);
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ status: "pending" });

    store.put(state, "aa_token");
    const hit = await app.request(`/api/auth/cli-login-challenge?state=${state}`);
    expect(hit.status).toBe(200);
    expect(await hit.json()).toEqual({ status: "complete", token: "aa_token" });

    const after = await app.request(`/api/auth/cli-login-challenge?state=${state}`);
    expect(await after.json()).toEqual({ status: "pending" });
  });

  it("rejects malformed states with 400", async () => {
    const app = createLoginChallengeRoute(createChallengeStore());
    const res = await app.request("/api/auth/cli-login-challenge?state=../../etc");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad state." });
  });
});
