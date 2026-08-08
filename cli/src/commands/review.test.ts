import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewReportResult } from "../types.js";

const requestMock = vi.fn();
vi.mock("../api.js", () => ({
  request: (path: string, init?: unknown) => requestMock(path, init),
}));

const { makeReviewCommand } = await import("./review.js");

let stdout = "";
const originalWrite = process.stdout.write.bind(process.stdout);

const RESULT: ReviewReportResult = {
  report: {
    cadence: "MONTHLY",
    period: {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-09-01T00:00:00.000Z",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      label: "August 2026",
      inProgress: false,
    },
    lensId: null,
    totals: { actions: 3, projects: 1, goals: 1, focusMinutes: 90 },
    actionsByLens: [
      { lens: { id: "work", name: "Work", color: "indigo" }, count: 2 },
      { lens: { id: "me", name: "Me", color: "emerald" }, count: 1 },
    ],
    highlights: [
      {
        id: "task-1",
        title: "Ship onboarding",
        permalink: "ship-onboarding",
        outcome: "Customers reached value faster.",
        size: "L",
        completedAt: "2026-08-20T12:00:00.000Z",
        lens: { id: "work", name: "Work", color: "indigo" },
        project: { id: "project-1", name: "Activation" },
        goal: null,
      },
    ],
    tasks: [],
    projects: [
      {
        id: "project-1",
        name: "Activation",
        permalink: "activation",
        description: null,
        completedAt: "2026-08-25T12:00:00.000Z",
        lens: { id: "work", name: "Work", color: "indigo" },
        goal: null,
      },
    ],
    goals: [
      {
        id: "goal-1",
        name: "Improve activation",
        permalink: "improve-activation",
        description: null,
        completedAt: "2026-08-28T12:00:00.000Z",
        lens: { id: "work", name: "Work", color: "indigo" },
      },
    ],
    weeklySlices: [],
    reflection: { proud: "We made setup calmer." },
    emphasisGoal: {
      id: "goal-2",
      name: "Earn customer trust",
      permalink: "earn-customer-trust",
      lens: { id: "work", name: "Work", color: "indigo" },
    },
  },
};

async function run(args: string[]) {
  await makeReviewCommand().parseAsync(args, { from: "user" });
  return stdout;
}

beforeEach(() => {
  stdout = "";
  requestMock.mockReset();
  requestMock.mockResolvedValue(RESULT);
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  };
});

afterEach(() => {
  process.stdout.write = originalWrite;
});

describe("review command", () => {
  it("prints a calm monthly overview", async () => {
    const output = await run(["month", "--time-zone", "UTC"]);

    expect(output).toContain("August 2026");
    expect(output).toContain("3 actions · 1 project · 1 goal");
    expect(output).toContain("Work  2");
    expect(output).toContain("L  Ship onboarding");
    expect(output).toContain("Customers reached value faster.");
    expect(output).toContain("We made setup calmer.");
    expect(output).toContain("Next emphasis: Earn customer trust");
  });

  it("requests the previous week without a write payload", async () => {
    await run([
      "week",
      "--previous",
      "--lens-id",
      "work",
      "--time-zone",
      "America/Chicago",
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      "/api/cli/review?cadence=WEEKLY&timeZone=America%2FChicago&previous=true&lensId=work",
      undefined,
    );
  });

  it("passes an exact review date", async () => {
    await run(["month", "--for", "2026-07-15", "--time-zone", "UTC"]);

    expect(requestMock).toHaveBeenCalledWith(
      "/api/cli/review?cadence=MONTHLY&timeZone=UTC&for=2026-07-15",
      undefined,
    );
  });

  it("emits the complete machine-readable report", async () => {
    const output = await run(["month", "--time-zone", "UTC", "--json"]);

    expect(JSON.parse(output)).toEqual(RESULT);
  });
});
