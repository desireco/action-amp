import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/admin/AdminActivityPage.tsx"), "utf8");

describe("AdminActivityPage contract", () => {
  it("shows calendar-week sections: this week, month by week, last 8 weeks", () => {
    for (const text of [
      "This week",
      "Current month, week by week",
      "Last 8 weeks",
      "Monday–Sunday · UTC",
      "in progress",
      "-total",
    ]) {
      expect(source).toContain(text);
    }
  });

  it("compares this week against last week on every tile", () => {
    expect(source).toContain("last week");
    expect(source).toContain("delta(");
    for (const field of ["signups", "activeUsers", "captures", "tasksCompleted"]) {
      expect(source).toContain(`"${field}"`);
    }
  });

  it("keeps the month rows clipped and labelled honestly", () => {
    expect(source).toContain("clipped to the month's edges");
    expect(source).toContain("best-effort browser telemetry");
  });
});
