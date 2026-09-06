// @vitest-environment node
/**
 * Pure-contract tests for the daily-reminder body copy.
 *
 * The web-push + Prisma plumbing in `sendDailyTodayReminder` is environment-
 * gated (VAPID env vars, PgBoss schedule, PushSubscription table) and not
 * unit-testable here. The body-string contract — what the user actually reads
 * — is the part worth locking. It lives in the pure `buildReminderBody` +
 * `truncate` exports.
 */
import { describe, it, expect } from "vitest";
import { buildReminderBody, truncate } from "./dailyReminderJob";

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
