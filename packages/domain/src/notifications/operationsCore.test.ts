// Unit tests for the S12/S14 notification cores — ported from
// webapp/src/notifications/dailyReminderJob.test.ts (the body contract) plus
// new pins for the subscription upsert + the clock helpers the job seam uses.
import { describe, it, expect, vi } from "vitest";

import {
  buildReminderBody,
  buildReminderPayload,
  deletePushSubscriptionCore,
  localClock,
  savePushSubscriptionCore,
  sentThisLocalDate,
  truncate,
} from "./operationsCore.js";

describe("truncate", () => {
  it("returns short names unchanged", () => {
    expect(truncate("Ship the launch")).toBe("Ship the launch");
  });

  it("truncates at the default max with an ellipsis", () => {
    const long = "A".repeat(80);
    expect(truncate(long)).toBe("A".repeat(47) + "…");
    expect(truncate(long).length).toBe(48);
  });

  it("respects a custom max", () => {
    expect(truncate("abcdefgh", 5)).toBe("abcd…");
  });

  it("leaves exactly-max-length names alone (boundary)", () => {
    expect(truncate("A".repeat(48))).toBe("A".repeat(48));
  });
});

describe("buildReminderBody", () => {
  it("names the tasks when ≤3 are present", () => {
    expect(buildReminderBody(["Write tests", "Ship it"], 2)).toBe(
      "Today: Write tests, Ship it",
    );
  });

  it("appends '+N more' when the total exceeds the named sample", () => {
    expect(buildReminderBody(["A", "B", "C"], 7)).toBe(
      "Today: A, B, C (+4 more)",
    );
  });

  it("does not append '+0 more' when the count equals the sample", () => {
    expect(buildReminderBody(["A", "B", "C"], 3)).toBe("Today: A, B, C");
  });

  it("falls back to the calm empty nudge when no tasks are on Today", () => {
    expect(buildReminderBody([], 0)).toBe(
      "Nothing planned yet. Choose what matters.",
    );
  });

  it("truncates long task names in the body", () => {
    const long = "Z".repeat(80);
    const body = buildReminderBody([long], 1);
    expect(body).toBe(`Today: ${"Z".repeat(47)}…`);
  });

  it("only sees the named sample even if totalCount is somehow lower", () => {
    // Defensive: if a race drops a task between the findMany and the count,
    // totalCount could be < names.length. Never emit a negative "+N more".
    expect(buildReminderBody(["A", "B", "C"], 2)).toBe("Today: A, B, C");
  });
});

describe("buildReminderPayload", () => {
  it("wraps the body in the SW payload contract ({title, body, url})", () => {
    expect(buildReminderPayload("Today: A")).toBe(
      JSON.stringify({ title: "ActionAmp", body: "Today: A", url: "/do/today" }),
    );
  });
});

describe("savePushSubscriptionCore", () => {
  it("upserts by endpoint: create carries userId+endpoint+keys", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    await savePushSubscriptionCore(
      { PushSubscription: { upsert } },
      { userId: "u1", endpoint: "https://push.example/1", p256dh: "k1", auth: "a1" },
    );
    expect(upsert).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example/1" },
      create: { userId: "u1", endpoint: "https://push.example/1", p256dh: "k1", auth: "a1" },
      update: { userId: "u1", p256dh: "k1", auth: "a1" },
    });
  });

  it("re-calling with the same endpoint updates userId + keys (no second row)", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const entities = { PushSubscription: { upsert } };
    await savePushSubscriptionCore(entities, {
      userId: "u1",
      endpoint: "ep",
      p256dh: "k1",
      auth: "a1",
    });
    await savePushSubscriptionCore(entities, {
      userId: "u2",
      endpoint: "ep",
      p256dh: "k2",
      auth: "a2",
    });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1]?.[0]).toEqual({
      where: { endpoint: "ep" },
      create: { userId: "u2", endpoint: "ep", p256dh: "k2", auth: "a2" },
      update: { userId: "u2", p256dh: "k2", auth: "a2" },
    });
  });

  it("throws the webapp's exact message when any key is missing", async () => {
    const upsert = vi.fn();
    await expect(
      savePushSubscriptionCore(
        { PushSubscription: { upsert } },
        { userId: "u1", endpoint: "", p256dh: "k", auth: "a" },
      ),
    ).rejects.toThrow("Invalid push subscription.");
    await expect(
      savePushSubscriptionCore(
        { PushSubscription: { upsert } },
        // SAFETY: exercise the undefined-branch of the webapp's truthiness check.
        { userId: "u1", endpoint: "ep", p256dh: undefined, auth: "a" },
      ),
    ).rejects.toThrow("Invalid push subscription.");
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("deletePushSubscriptionCore", () => {
  it("deletes by id (the 404/410 prune)", async () => {
    const del = vi.fn().mockResolvedValue({});
    await deletePushSubscriptionCore({ PushSubscription: { delete: del } }, {
      where: { id: "sub-1" },
    });
    expect(del).toHaveBeenCalledWith({ where: { id: "sub-1" } });
  });
});

describe("localClock + sentThisLocalDate", () => {
  it("splits an instant into the zone's local date + HH:mm", () => {
    // 2026-09-02T07:30Z is 09:30 in Paris (CEST, +2) and 00:30 in Los Angeles.
    const now = new Date("2026-09-02T07:30:00.000Z");
    expect(localClock(now, "Europe/Paris")).toEqual({
      date: "2026-09-02",
      time: "09:30",
    });
    expect(localClock(now, "America/Los_Angeles")).toEqual({
      date: "2026-09-02",
      time: "00:30",
    });
  });

  it("throws on an invalid IANA zone (the job skips that user)", () => {
    expect(() => localClock(new Date(), "Not/AZone")).toThrow();
  });

  it("same-local-date stamp suppresses; yesterday's does not", () => {
    // 07:30Z is 09:30 in Paris on 2026-09-02.
    const earlierToday = new Date("2026-09-02T05:00:00.000Z"); // 07:00 Paris
    const yesterday = new Date("2026-09-01T07:30:00.000Z");
    expect(sentThisLocalDate(earlierToday, { date: "2026-09-02" }, "Europe/Paris")).toBe(true);
    expect(sentThisLocalDate(yesterday, { date: "2026-09-02" }, "Europe/Paris")).toBe(false);
    expect(sentThisLocalDate(null, { date: "2026-09-02" }, "Europe/Paris")).toBe(false);
  });
});
