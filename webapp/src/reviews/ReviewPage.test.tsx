import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import {
  countActionsByLens,
  firstReviewRoute,
  Reflection,
  reviewShortcutFor,
  selectSignificantActions,
  TaskEvidence,
} from "./ReviewPage";
import type { ReviewGoalOption, ReviewTaskItem } from "./types";

const lens = { id: "lens-1", name: "Work", color: "indigo" };

function task(index: number): ReviewTaskItem {
  return {
    id: `task-${index}`,
    title: `Completed task ${index}`,
    permalink: `completed-task-${index}`,
    outcome: index === 1 ? "The customer **approved** it." : null,
    size: "M",
    completedAt: `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    lens,
    goal: { id: "goal-1", name: "Launch", permalink: "launch" },
    project: {
      id: "project-1",
      name: "Release",
      permalink: "release",
      goal: { id: "goal-1", name: "Launch", permalink: "launch" },
    },
  };
}

describe("review route preference resolution", () => {
  it.each([
    [{ today: true, week: true, month: true }, "/app/review/today"],
    [{ today: true, week: true, month: false }, "/app/review/today"],
    [{ today: false, week: false, month: true }, "/app/review/month"],
    [{ today: false, week: false, month: false }, "/app/logbook"],
    [{ today: true, week: false, month: false }, "/app/review/today"],
    [{ today: false, week: true, month: false }, "/app/review/week"],
    [{ today: true, week: false, month: true }, "/app/review/today"],
    [{ today: false, week: true, month: true }, "/app/review/week"],
  ])("routes preferences %#", (preferences, expected) => {
    expect(firstReviewRoute(preferences)).toBe(expected);
  });
});

describe("review keyboard map", () => {
  it("maps review keys and suppresses them while editing", () => {
    expect(reviewShortcutFor("[", false)).toBe("previous");
    expect(reviewShortcutFor("]", false)).toBe("next");
    expect(reviewShortcutFor("J", false)).toBe("down");
    expect(reviewShortcutFor("k", false)).toBe("up");
    expect(reviewShortcutFor("e", false)).toBe("edit");
    expect(reviewShortcutFor("r", false)).toBe("record");
    expect(reviewShortcutFor("r", false, false)).toBeNull();
    expect(reviewShortcutFor("r", true)).toBeNull();
    expect(reviewShortcutFor("x", false)).toBeNull();
  });
});

describe("significant completed actions", () => {
  it("lists at most five Large then Medium actions and excludes other sizes", () => {
    const tasks = [
      { ...task(1), size: "S" as const },
      { ...task(2), size: "M" as const },
      { ...task(3), size: "L" as const },
      { ...task(4), size: "XL" as const },
      { ...task(5), size: "M" as const },
      { ...task(6), size: "L" as const },
      { ...task(7), size: "M" as const },
      { ...task(8), size: "L" as const },
    ];

    const selected = selectSignificantActions(tasks);

    expect(selected).toHaveLength(5);
    expect(selected.map((item) => item.size)).toEqual([
      "L",
      "L",
      "L",
      "M",
      "M",
    ]);
    expect(selected.map((item) => item.id)).not.toContain("task-1");
    expect(selected.map((item) => item.id)).not.toContain("task-4");
  });

  it("counts every completed action by lens", () => {
    const personal = { id: "lens-2", name: "Me", color: "emerald" };
    const counts = countActionsByLens([
      task(1),
      task(2),
      { ...task(3), lens: personal },
    ]);

    expect(
      counts.map(({ lens: itemLens, count }) => [itemLens.name, count]),
    ).toEqual([
      ["Work", 2],
      ["Me", 1],
    ]);
  });
});

describe("TaskEvidence", () => {
  it("keeps every completed task and its outcome inspectable", () => {
    const tasks = Array.from({ length: 12 }, (_, index) => task(index + 1));
    render(
      <MemoryRouter>
        <TaskEvidence tasks={tasks} cadence="MONTHLY" />
      </MemoryRouter>,
    );

    for (const item of tasks) {
      expect(
        screen.getByRole("link", { name: item.title }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("approved")).toBeInTheDocument();
  });
});

describe("Reflection", () => {
  it("renders distinct monthly prompts and emits optional answers", () => {
    const onChange = vi.fn();
    const goals: ReviewGoalOption[] = [
      {
        id: "goal-1",
        name: "Launch",
        permalink: "launch",
        lens,
        isDone: false,
      },
    ];
    render(
      <Reflection
        cadence="MONTHLY"
        answers={{}}
        goals={goals}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("What are you proud of?")).toBeInTheDocument();
    expect(
      screen.getByText("What did this month teach you?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("What deserves attention next month?"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole("textbox")[0]!, {
      target: { value: "We shipped." },
    });
    expect(onChange).toHaveBeenCalledWith("proud", "We shipped.");
    expect(screen.getByRole("combobox")).toHaveTextContent("Launch");
  });
});
