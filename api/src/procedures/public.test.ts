import { describe, expect, it } from "vitest";
import type { DomainDb } from "@actionamp/domain/db";
import {
  founding100Payload,
  recordPublicAnalyticsEvent,
  type PublicAnalyticsInput,
} from "./publicCore.js";

/**
 * S15 unit pins (s15-public/README.md §6: "getFounding100Status math and the
 * status handler's payload … cap/reserved/remaining/isFull boundaries at
 * claimed = 97/98/99" + the recorder's validation rules).
 */

describe("founding100Payload — the exact wire contract", () => {
  it("orders the keys cap, reserved, claimed, remaining, isFull", () => {
    expect(Object.keys(founding100Payload(3))).toEqual([
      "cap",
      "reserved",
      "claimed",
      "remaining",
      "isFull",
    ]);
  });

  it.each([0, 50, 97])(
    "claimed=%i → remaining shrinks, not full (public cap 98 = 100 − 2 reserved)",
    (claimed) => {
      const p = founding100Payload(claimed);
      expect(p).toEqual({
        cap: 100,
        reserved: 2,
        claimed,
        remaining: 98 - claimed,
        isFull: false,
      });
    },
  );

  it("claimed=97 → one public spot left (boundary)", () => {
    const p = founding100Payload(97);
    expect(p.remaining).toBe(1);
    expect(p.isFull).toBe(false);
  });

  it("claimed=98 → public cap hit: remaining 0, isFull true (boundary)", () => {
    const p = founding100Payload(98);
    expect(p.remaining).toBe(0);
    expect(p.isFull).toBe(true);
  });

  it("claimed=99 → stays saturated, never negative (boundary)", () => {
    const p = founding100Payload(99);
    expect(p.remaining).toBe(0);
    expect(p.isFull).toBe(true);
  });

  it("claimed=100 (all spots incl. reserve) → still saturated at 0", () => {
    const p = founding100Payload(100);
    expect(p.remaining).toBe(0);
    expect(p.isFull).toBe(true);
  });
});

// ----------------------------------------------------------------
// The public recorder's validation rules (the REST layer maps any
// throw to the 400 body; these pin WHAT throws).
// ----------------------------------------------------------------

type Row = Record<string, unknown>;

// A drizzle query builder is an awaitable chain (every method returns itself,
// awaited at the call) — faking one is inherently thenable. Scoped disable,
// not a blanket one: the fake below is the only thenable in the suite.
// oxlint-disable unicorn/no-thenable
function recorderHarness(existingEvents: Row[] = []): {
  db: DomainDb;
  inserted: Row[];
} {
  const inserted: Row[] = [];
  const db = {
    select: (() => {
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => chain,
        then: (res: (v: unknown) => void) => Promise.resolve(existingEvents).then(res),
      };
      return chain;
    }) as never,
    update: (() => {
      const chain = { set: () => chain, where: () => chain, then: (r: (v: unknown) => void) => Promise.resolve({}).then(r) };
      return chain;
    }) as never,
    insert: ((() => {
      const chain = {
        values: (v: Row) => {
          inserted.push(v);
          return chain;
        },
        then: (r: (v: unknown) => void) => Promise.resolve({}).then(r),
      };
      return chain;
    })) as never,
  } as unknown as DomainDb;
  return { db, inserted };
}
// oxlint-enable unicorn/no-thenable

const BASE: PublicAnalyticsInput = {
  name: "LANDING_VIEW",
  visitorId: "visitor-abc_123",
};

describe("recordPublicAnalyticsEvent — validation", () => {
  it("rejects an unknown event name", async () => {
    const { db } = recorderHarness();
    await expect(
      recordPublicAnalyticsEvent(db, { ...BASE, name: "NOT_A_REAL_EVENT" }),
    ).rejects.toThrow("Unknown analytics event.");
  });

  it("rejects a visitor id with characters outside [a-zA-Z0-9_-]", async () => {
    const { db } = recorderHarness();
    await expect(
      recordPublicAnalyticsEvent(db, { ...BASE, visitorId: "bad id!" }),
    ).rejects.toThrow("Invalid analytics visitor id.");
  });

  it("trims and caps the visitor id at 80 chars (webapp clean())", async () => {
    const { db, inserted } = recorderHarness();
    const long = `${"v".repeat(120)} `;
    await recordPublicAnalyticsEvent(db, { ...BASE, visitorId: long });
    // inserted[0] = the session upsert, inserted[1] = the event.
    expect((inserted[0] as { visitorId: string }).visitorId).toBe("v".repeat(80));
  });

  it("drops metadata keys outside the allow-list and caps strings at 120", async () => {
    const { db, inserted } = recorderHarness();
    await recordPublicAnalyticsEvent(db, {
      ...BASE,
      metadata: {
        surface: "founding",
        evil: "nope",
        plan: "x".repeat(300),
      },
    });
    const event = inserted.at(-1) as { metadata: Record<string, unknown> };
    expect(event.metadata).toEqual({ surface: "founding", plan: "x".repeat(120) });
  });

  it("records a one-time event only once per user (dedup short-circuits the insert)", async () => {
    // The fake answers every select with one existing event row — the dedup
    // probe finds it and the recorder must return before inserting.
    const { db, inserted } = recorderHarness([{ id: "evt-1" }]);
    const result = await recordPublicAnalyticsEvent(
      db,
      { name: "ONBOARDING_COMPLETED", visitorId: "user_u1" },
      "u1",
    );
    expect(result).toEqual({ recorded: false });
    expect(inserted).toHaveLength(0);
  });
});
