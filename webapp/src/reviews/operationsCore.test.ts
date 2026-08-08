import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeReviewData,
  getReviewData,
  saveReviewDraftData,
  validateAnswers,
} from "./operationsCore";

function entities() {
  return {
    Review: { findUnique: vi.fn(), upsert: vi.fn() },
    Task: { findMany: vi.fn() },
    Project: { findMany: vi.fn() },
    Goal: { findMany: vi.fn() },
    TaskSession: { findMany: vi.fn() },
  };
}

const lens = { id: "lens-work", name: "Work", color: "indigo" };

describe("review operation core", () => {
  let db: ReturnType<typeof entities>;

  beforeEach(() => {
    db = entities();
    db.Review.findUnique.mockResolvedValue(null);
    db.Task.findMany.mockResolvedValue([]);
    db.Project.findMany.mockResolvedValue([]);
    db.Goal.findMany.mockResolvedValue([]);
    db.TaskSession.findMany.mockResolvedValue([]);
    db.Review.upsert.mockImplementation(async ({ create, update }: any) => ({
      id: "review-1",
      updatedAt: new Date("2026-08-08T18:00:00Z"),
      completedAt: create?.completedAt ?? update?.completedAt ?? null,
    }));
  });

  it("returns every completed entity and sums focus time", async () => {
    db.Task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        description: "Send proposal",
        permalink: "send-proposal",
        outcome: "Sent and accepted",
        completedAt: new Date("2026-08-08T15:00:00Z"),
        lens,
        goal: null,
        project: {
          id: "project-1",
          name: "Launch",
          permalink: "launch",
          goal: { id: "goal-1", name: "Ship", permalink: "ship" },
        },
      },
    ]);
    db.Project.findMany.mockResolvedValueOnce([
      {
        id: "project-1",
        name: "Launch",
        permalink: "launch",
        description: null,
        completedAt: new Date("2026-08-08T16:00:00Z"),
        lens,
        goal: null,
      },
    ]);
    db.Goal.findMany.mockResolvedValueOnce([
      {
        id: "goal-1",
        name: "Ship",
        permalink: "ship",
        description: "Release it",
        completedAt: new Date("2026-08-08T17:00:00Z"),
        lens,
      },
    ]);
    db.TaskSession.findMany.mockResolvedValueOnce([
      {
        startedAt: new Date("2026-08-08T14:00:00Z"),
        endedAt: new Date("2026-08-08T14:25:00Z"),
      },
    ]);

    const result = await getReviewData(
      db,
      "user-1",
      { cadence: "DAILY", forDate: "2026-08-08", timeZone: "UTC" },
      new Date("2026-08-08T20:00:00Z"),
    );

    expect(result.evidence.tasks.map((task) => task.title)).toEqual([
      "Send proposal",
    ]);
    expect(result.evidence.projects.map((project) => project.name)).toEqual([
      "Launch",
    ]);
    expect(result.evidence.goals.map((goal) => goal.name)).toEqual(["Ship"]);
    expect(result.evidence.focusMinutes).toBe(25);
    expect(result.evidenceSource).toBe("live");
  });

  it("clips focus sessions to the review period and offers active goals for monthly emphasis", async () => {
    db.TaskSession.findMany.mockResolvedValueOnce([
      {
        startedAt: new Date("2026-08-07T23:50:00Z"),
        endedAt: new Date("2026-08-08T00:20:00Z"),
        task: { lensId: lens.id },
      },
      {
        startedAt: new Date("2026-08-08T23:50:00Z"),
        endedAt: new Date("2026-08-09T00:10:00Z"),
        task: { lensId: lens.id },
      },
    ]);
    db.Goal.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "goal-active",
        name: "Grow",
        permalink: "grow",
        lens,
        isDone: false,
      },
    ]);

    const result = await getReviewData(
      db,
      "user-1",
      { cadence: "DAILY", forDate: "2026-08-08", timeZone: "UTC" },
      new Date("2026-08-08T20:00:00Z"),
    );

    expect(result.evidence.focusMinutes).toBe(30);
    expect(result.evidence.focusMinutesByLens).toEqual({ [lens.id]: 30 });
    expect(result.availableGoals.map((goal) => goal.name)).toEqual(["Grow"]);
    expect(db.TaskSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startedAt: { lt: new Date("2026-08-09T00:00:00.000Z") },
          endedAt: { not: null, gt: new Date("2026-08-08T00:00:00.000Z") },
        }),
      }),
    );
  });

  it("keeps monthly week slices on local calendar boundaries across fall DST", async () => {
    db.Task.findMany.mockResolvedValueOnce([
      {
        id: "task-after-fall-back",
        description: "Sunday work",
        permalink: "sunday-work",
        outcome: null,
        completedAt: new Date("2026-11-08T18:00:00Z"),
        lens,
        goal: null,
        project: null,
      },
    ]);

    const result = await getReviewData(
      db,
      "user-1",
      {
        cadence: "MONTHLY",
        forDate: "2026-11-15",
        timeZone: "America/Chicago",
      },
      new Date("2026-11-20T18:00:00Z"),
    );

    expect(
      result.evidence.weeklySlices.map((slice) => slice.startDate),
    ).toEqual([
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
    ]);
    expect(result.evidence.weeklySlices[1]?.completedTasks).toBe(1);
  });

  it("uses a saved snapshot for a completed past period", async () => {
    db.Review.findUnique.mockResolvedValue({
      answers: { memory: "Good day" },
      completedAt: new Date("2026-08-08T23:00:00Z"),
      updatedAt: new Date("2026-08-08T23:00:00Z"),
      snapshot: {
        version: 1,
        capturedAt: "2026-08-08T23:00:00.000Z",
        tasks: [{ id: "deleted-task", title: "Still remembered" }],
        projects: [],
        goals: [],
        focusMinutes: 0,
        weeklySlices: [],
      },
    });

    const result = await getReviewData(
      db,
      "user-1",
      { cadence: "DAILY", forDate: "2026-08-08", timeZone: "UTC" },
      new Date("2026-08-10T12:00:00Z"),
    );

    expect(result.evidenceSource).toBe("snapshot");
    expect(result.evidence.tasks[0]?.title).toBe("Still remembered");
    expect(result.answers).toEqual({ memory: "Good day" });
  });

  it("reports new current-period completions after the saved snapshot", async () => {
    db.Review.findUnique.mockResolvedValue({
      answers: {},
      completedAt: new Date("2026-08-08T12:00:00Z"),
      updatedAt: new Date("2026-08-08T12:00:00Z"),
      snapshot: {
        version: 1,
        capturedAt: "2026-08-08T12:00:00.000Z",
        tasks: [],
        projects: [],
        goals: [],
        focusMinutes: 0,
        weeklySlices: [],
      },
    });
    db.Task.findMany.mockResolvedValueOnce([
      {
        id: "task-new",
        description: "New",
        permalink: "new",
        outcome: null,
        completedAt: new Date("2026-08-08T15:00:00Z"),
        lens,
        goal: null,
        project: null,
      },
    ]);

    const result = await getReviewData(
      db,
      "user-1",
      { cadence: "DAILY", forDate: "2026-08-08", timeZone: "UTC" },
      new Date("2026-08-08T20:00:00Z"),
    );
    expect(result.newCompletionCount).toBe(1);
    expect(result.evidenceSource).toBe("live");
  });

  it("persists drafts by the normalized period key", async () => {
    await saveReviewDraftData(db, "user-1", {
      cadence: "WEEKLY",
      forDate: "2026-08-08",
      timeZone: "UTC",
      answers: { moved: "Launch moved" },
    });
    expect(db.Review.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_cadence_periodStart: {
            userId: "user-1",
            cadence: "WEEKLY",
            periodStart: new Date("2026-08-03T00:00:00.000Z"),
          },
        },
        create: expect.objectContaining({ answers: { moved: "Launch moved" } }),
      }),
    );
  });

  it("completes with a stable evidence snapshot", async () => {
    db.Task.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        description: "Done",
        permalink: "done",
        outcome: null,
        completedAt: new Date("2026-08-08T15:00:00Z"),
        lens,
        goal: null,
        project: null,
      },
    ]);
    const result = await completeReviewData(
      db,
      "user-1",
      { cadence: "DAILY", forDate: "2026-08-08", timeZone: "UTC", answers: {} },
      new Date("2026-08-08T20:00:00Z"),
    );
    expect(result.snapshot.tasks).toHaveLength(1);
    expect(db.Review.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          completedAt: new Date("2026-08-08T20:00:00Z"),
        }),
        update: expect.objectContaining({
          snapshot: expect.objectContaining({ version: 1 }),
        }),
      }),
    );
  });

  it("does not close weekly or monthly reviews", async () => {
    await expect(
      completeReviewData(db, "user-1", {
        cadence: "MONTHLY",
        forDate: "2026-08-08",
        timeZone: "UTC",
        answers: {},
      }),
    ).rejects.toThrow("Only Today reviews can be closed.");
  });
});

describe("validateAnswers", () => {
  it("keeps only cadence fields, trims, and rejects overlong values", () => {
    expect(
      validateAnswers("DAILY", { memory: "  remembered  ", moved: "drop" }),
    ).toEqual({ memory: "remembered" });
    expect(() =>
      validateAnswers("WEEKLY", { moved: "x".repeat(4_001) }),
    ).toThrow(/4,000/);
  });
});
