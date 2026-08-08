import { describe, expect, it } from "vitest";
import { buildReviewReport, countActionsByLens } from "./report";
import type { ReviewResult, ReviewTaskItem } from "./types";

const work = { id: "work", name: "Work", color: "indigo" };
const me = { id: "me", name: "Me", color: "emerald" };

function task(
  id: string,
  size: ReviewTaskItem["size"],
  lens = work,
): ReviewTaskItem {
  return {
    id,
    title: `Task ${id}`,
    permalink: `task-${id}`,
    outcome: null,
    size,
    completedAt: `2026-08-${id.padStart(2, "0")}T12:00:00.000Z`,
    lens,
    project: null,
    goal: null,
  };
}

function result(cadence: "DAILY" | "WEEKLY" | "MONTHLY"): ReviewResult {
  return {
    cadence,
    period: {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-09-01T00:00:00.000Z",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      label: "August 2026",
      inProgress: false,
    },
    answers: { proud: "Shipped calmly." },
    completedAt: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    evidenceSource: "live",
    newCompletionCount: 0,
    availableGoals: [
      {
        id: "goal-1",
        name: "Grow calmly",
        permalink: "grow-calmly",
        lens: work,
        isDone: false,
      },
    ],
    evidence: {
      version: 1,
      capturedAt: "2026-09-01T00:00:00.000Z",
      tasks: [task("1", "S"), task("2", "M"), task("3", "L", me)],
      projects: [],
      goals: [],
      focusMinutes: 90,
      focusMinutesByLens: { work: 60, me: 30 },
      weeklySlices: [],
    },
  };
}

describe("review reports", () => {
  it("builds an agent-ready monthly report", () => {
    const report = buildReviewReport(result("MONTHLY"), "UTC");

    expect(report.totals).toEqual({
      actions: 3,
      projects: 0,
      goals: 0,
      focusMinutes: 90,
    });
    expect(report.highlights.map((item) => item.size)).toEqual(["L", "M"]);
    expect(
      report.actionsByLens.map(({ lens, count }) => [lens.name, count]),
    ).toEqual([
      ["Work", 2],
      ["Me", 1],
    ]);
    expect(report.reflection.proud).toBe("Shipped calmly.");
    expect(report.state).toBe("finished");
    expect(report.checkIn).toEqual({});
    expect(report.weeklySlices).toHaveLength(5);
  });

  it("separates an active-period check-in from its later reflection", () => {
    const active = result("WEEKLY");
    active.period.inProgress = true;
    active.answers = {
      howGoing: "Moving steadily.",
      goingWell: "Customer calls.",
      challenges: "A dependency.",
      currentAttention: "Unblock the release.",
      moved: "Earlier retrospective stays saved.",
    };

    const report = buildReviewReport(active, "UTC");

    expect(report.state).toBe("in_progress");
    expect(report.checkIn).toEqual({
      howGoing: "Moving steadily.",
      goingWell: "Customer calls.",
      challenges: "A dependency.",
      currentAttention: "Unblock the release.",
    });
    expect(report.reflection).toEqual({
      moved: "Earlier retrospective stays saved.",
    });
  });

  it("filters evidence, totals, and focus by lens", () => {
    const report = buildReviewReport(result("WEEKLY"), "UTC", "me");

    expect(report.totals.actions).toBe(1);
    expect(report.totals.focusMinutes).toBe(30);
    expect(report.tasks[0]?.lens.id).toBe("me");
    expect(report.actionsByLens).toEqual([{ lens: me, count: 1 }]);
  });

  it("rejects daily reports", () => {
    expect(() => buildReviewReport(result("DAILY"), "UTC")).toThrow(
      "Week and Month",
    );
  });

  it("sorts equal counts by lens name", () => {
    expect(
      countActionsByLens([task("1", "M", work), task("2", "M", me)]),
    ).toEqual([
      { lens: me, count: 1 },
      { lens: work, count: 1 },
    ]);
  });
});
