// @vitest-environment node
// Pure mapping — no DOM. Node is correct.
import { describe, it, expect } from "vitest";
import { toFocusTask } from "./focusTaskView";

/**
 * toFocusTask mapping for the Goal context (focus-goal-context spec FG04).
 * Pins Goal precedence (Project Goal → direct Goal → null), description
 * trimming, and the FocusTask.goalContext shape. Timer/session/updates mapping
 * is covered by FocusMode.test.tsx at the component level.
 */

const BASE = {
  id: "task-1",
  description: "Email Sarah",
  status: "TODAY",
  size: "M" as const,
  startedAt: new Date("2026-08-10T09:00:00Z"),
};

describe("toFocusTask — goalContext resolution", () => {
  it("resolves the Project Goal when the Project has one", () => {
    const out = toFocusTask({
      ...BASE,
      project: {
        name: "Launch v2",
        goal: { id: "g1", name: "Reach 100 paid", description: "Prove demand." },
      },
    });
    expect(out.goalContext).toEqual({
      name: "Reach 100 paid",
      description: "Prove demand.",
    });
  });

  it("falls back to the legacy direct Goal when the Project has no Goal", () => {
    const out = toFocusTask({
      ...BASE,
      project: { name: "Launch v2", goal: null },
      goal: { id: "g-direct", name: "Legacy", description: "Old link." },
    });
    expect(out.goalContext).toEqual({ name: "Legacy", description: "Old link." });
  });

  it("Project Goal wins over a conflicting legacy direct Goal", () => {
    const out = toFocusTask({
      ...BASE,
      project: {
        name: "Launch v2",
        goal: { id: "g-proj", name: "Project goal", description: "Proj desc" },
      },
      goal: { id: "g-direct", name: "Direct goal", description: "Direct desc" },
    });
    expect(out.goalContext).toEqual({
      name: "Project goal",
      description: "Proj desc",
    });
  });

  it("returns null goalContext when there is no Project and no direct Goal", () => {
    expect(toFocusTask({ ...BASE, project: null, goal: null }).goalContext).toBeNull();
    expect(toFocusTask({ ...BASE }).goalContext).toBeNull();
  });

  it("trims the Goal description; whitespace-only → null", () => {
    const trimmed = toFocusTask({
      ...BASE,
      goal: { id: "g1", name: "G", description: "   spaced   " },
    });
    expect(trimmed.goalContext?.description).toBe("spaced");

    const blank = toFocusTask({
      ...BASE,
      goal: { id: "g1", name: "G", description: "   \n  " },
    });
    expect(blank.goalContext?.description).toBeNull();
    // Name preserved so the Toward fallback can still render.
    expect(blank.goalContext?.name).toBe("G");
  });
});
