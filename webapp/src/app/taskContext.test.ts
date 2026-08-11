// @vitest-environment node
// Pure module — no DOM, no Wasp. Node is the right environment.
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import {
  resolveGoal,
  goalRationale,
  resolveContinuity,
  formatWorkedLabel,
  continuityStatsRow,
  buildNowContext,
  type TaskContextInput,
} from "./taskContext";
import type { FocusWhyInput } from "./focusWhy";

/**
 * Pure Goal-rationale + work-continuity normalization (focus-goal-context
 * spec). Covers Goal precedence, time arithmetic, NOTE filtering, grammar,
 * latest-note selection, and CLI context composition.
 */

const NOW = new Date("2026-08-10T10:00:00Z");
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

const iso = (d: Date): string => d.toISOString();
const minutesAfter = (base: Date, m: number): Date =>
  new Date(base.getTime() + m * 60_000);

function session(
  start: Date,
  endMin: number | null,
): { startedAt: Date; endedAt: Date | null } {
  return {
    startedAt: start,
    endedAt: endMin === null ? null : minutesAfter(start, endMin),
  };
}

function note(
  body: string,
  at: Date,
  kind: "NOTE" | "COMPLETED" = "NOTE",
): { body: string; createdAt: Date; kind: string } {
  return { body, createdAt: at, kind };
}

// ----------------------------------------------------------------
// resolveGoal — precedence: Project Goal → legacy direct → null
// ----------------------------------------------------------------
describe("resolveGoal", () => {
  it("returns null when the Task has no Project and no direct Goal", () => {
    expect(resolveGoal({})).toBeNull();
    expect(resolveGoal({ project: null, goal: null })).toBeNull();
  });

  it("uses the Project Goal when the Task's Project has one", () => {
    const task: TaskContextInput = {
      project: {
        id: "p1",
        name: "Launch v2",
        goal: { id: "g1", name: "Reach 100 paid", description: "Prove demand." },
      },
      goal: null,
    };
    expect(resolveGoal(task)).toEqual({
      name: "Reach 100 paid",
      description: "Prove demand.",
    });
  });

  it("falls back to the legacy direct Goal when the Project has no Goal", () => {
    const task: TaskContextInput = {
      project: { id: "p1", name: "Launch v2", goal: null },
      goal: { id: "g-direct", name: "Legacy", description: "Old link." },
    };
    expect(resolveGoal(task)).toEqual({ name: "Legacy", description: "Old link." });
  });

  it("Project Goal wins over a conflicting legacy direct Goal (one shown, never merged)", () => {
    const task: TaskContextInput = {
      project: {
        id: "p1",
        name: "Launch v2",
        goal: { id: "g-proj", name: "Project goal", description: "Proj desc" },
      },
      goal: { id: "g-direct", name: "Direct goal", description: "Direct desc" },
    };
    expect(resolveGoal(task)).toEqual({
      name: "Project goal",
      description: "Proj desc",
    });
  });

  it("trims the description and converts whitespace-only to null", () => {
    const task: TaskContextInput = {
      goal: { id: "g1", name: "G", description: "   spaced out   " },
    };
    expect(resolveGoal(task)).toEqual({ name: "G", description: "spaced out" });

    const blank: TaskContextInput = {
      goal: { id: "g1", name: "G", description: "   \n\t  " },
    };
    expect(resolveGoal(blank)).toEqual({ name: "G", description: null });
  });
});

// ----------------------------------------------------------------
// goalRationale — described / fallback / absent copy
// ----------------------------------------------------------------
describe("goalRationale", () => {
  it("described Goal → question + description + attribution", () => {
    const r = goalRationale({
      goal: { id: "g1", name: "Reach 100 paid", description: "Prove demand." },
    });
    expect(r).toEqual({
      question: "Why does this matter?",
      answer: "Prove demand.",
      attribution: "Goal · Reach 100 paid",
    });
  });

  it("description-less Goal → question + Toward fallback, NO attribution line", () => {
    const r = goalRationale({
      goal: { id: "g1", name: "Reach 100 paid", description: null },
    });
    expect(r).toEqual({
      question: "Why does this matter?",
      answer: "Toward Reach 100 paid.",
      attribution: null,
    });
  });

  it("no Goal → null (no block rendered)", () => {
    expect(goalRationale({})).toBeNull();
  });

  it("whitespace-only description falls back to Toward (no duplicate attribution)", () => {
    const r = goalRationale({
      goal: { id: "g1", name: "G", description: "   " },
    });
    expect(r?.answer).toBe("Toward G.");
    expect(r?.attribution).toBeNull();
  });
});

// ----------------------------------------------------------------
// formatWorkedLabel — duration boundaries
// ----------------------------------------------------------------
describe("formatWorkedLabel", () => {
  it("zero → null", () => {
    expect(formatWorkedLabel(0)).toBeNull();
  });

  it("negative → null (never inflate)", () => {
    expect(formatWorkedLabel(-1000)).toBeNull();
  });

  it("positive sub-minute → '<1 min worked'", () => {
    expect(formatWorkedLabel(1)).toBe("<1 min worked");
    expect(formatWorkedLabel(59_999)).toBe("<1 min worked");
  });

  it("exactly 60s rounds to 1 min (singular)", () => {
    // Math.round(60000/60000) === 1
    expect(formatWorkedLabel(60_000)).toBe("1 min worked");
  });

  it("plural minutes", () => {
    // 42 min exactly
    expect(formatWorkedLabel(42 * 60_000)).toBe("42 min worked");
  });

  it("rounds to nearest whole minute (rounds up on half)", () => {
    // 90s → round(1.5) === 2
    expect(formatWorkedLabel(90_000)).toBe("2 min worked");
    // 119s → round(1.983) === 2
    expect(formatWorkedLabel(119_000)).toBe("2 min worked");
  });
});

// ----------------------------------------------------------------
// resolveContinuity — valid sessions, malformed exclusion, NOTE filtering
// ----------------------------------------------------------------
describe("resolveContinuity", () => {
  it("fresh Task (no sessions, no notes) → all zero/null", () => {
    expect(resolveContinuity({})).toEqual({
      workedMs: 0,
      workedLabel: null,
      sessionCount: 0,
      noteCount: 0,
      latestNote: null,
    });
  });

  it("sums only valid closed sessions (endedAt > startedAt)", () => {
    const task: TaskContextInput = {
      sessions: [
        session(NOW, 25), // valid
        session(NOW, 45), // valid
      ],
    };
    const c = resolveContinuity(task);
    expect(c.workedMs).toBe((25 + 45) * 60_000);
    expect(c.sessionCount).toBe(2);
  });

  it("excludes open sessions (endedAt null) from time + count", () => {
    const task: TaskContextInput = {
      sessions: [
        session(NOW, null), // open — excluded
        session(NOW, 25), // valid
      ],
    };
    const c = resolveContinuity(task);
    expect(c.workedMs).toBe(25 * 60_000);
    expect(c.sessionCount).toBe(1);
  });

  it("excludes zero-length sessions (endedAt === startedAt)", () => {
    const task: TaskContextInput = {
      sessions: [session(NOW, 0)], // zero-length
    };
    const c = resolveContinuity(task);
    expect(c.workedMs).toBe(0);
    expect(c.sessionCount).toBe(0);
  });

  it("excludes reversed sessions (endedAt < startedAt)", () => {
    const reversed = {
      startedAt: minutesAfter(NOW, 10),
      endedAt: NOW, // before start
    };
    const task: TaskContextInput = { sessions: [reversed] };
    const c = resolveContinuity(task);
    expect(c.workedMs).toBe(0);
    expect(c.sessionCount).toBe(0);
  });

  it("sub-minute valid time → workedMs positive, label '<1 min worked'", () => {
    const task: TaskContextInput = {
      sessions: [
        { startedAt: NOW, endedAt: new Date(NOW.getTime() + 30_000) }, // 30s
      ],
    };
    const c = resolveContinuity(task);
    expect(c.workedMs).toBe(30_000);
    expect(c.workedLabel).toBe("<1 min worked");
  });

  it("counts only trimmed non-empty NOTE bodies", () => {
    const task: TaskContextInput = {
      updates: [
        note("First", NOW),
        note("   ", NOW), // whitespace-only → excluded
        note("  trimmed  ", NOW), // trimmed → counted
      ],
    };
    expect(resolveContinuity(task).noteCount).toBe(2);
  });

  it("excludes COMPLETED rows from the note count", () => {
    const task: TaskContextInput = {
      updates: [
        note("a note", NOW, "NOTE"),
        note("Completed", NOW, "COMPLETED"),
        note("another", NOW, "NOTE"),
      ],
    };
    expect(resolveContinuity(task).noteCount).toBe(2);
  });

  it("selects the newest NOTE independent of input ordering", () => {
    const task: TaskContextInput = {
      updates: [
        note("oldest", minutesAfter(NOW, -60)),
        note("newest", NOW),
        note("middle", minutesAfter(NOW, -30)),
      ],
    };
    expect(resolveContinuity(task).latestNote).toBe("newest");
  });

  it("trims the latest note body", () => {
    const task: TaskContextInput = {
      updates: [note("  spaced  ", NOW)],
    };
    expect(resolveContinuity(task).latestNote).toBe("spaced");
  });

  it("history with only time, no notes → workedLabel set, noteCount 0, latestNote null", () => {
    const c = resolveContinuity({ sessions: [session(NOW, 25)] });
    expect(c.workedLabel).toBe("25 min worked");
    expect(c.noteCount).toBe(0);
    expect(c.latestNote).toBeNull();
  });

  it("history with only notes, no valid time → workedLabel null, noteCount set", () => {
    const c = resolveContinuity({ updates: [note("hi", NOW)] });
    expect(c.workedLabel).toBeNull();
    expect(c.workedMs).toBe(0);
    expect(c.noteCount).toBe(1);
    expect(c.latestNote).toBe("hi");
  });
});

// ----------------------------------------------------------------
// continuityStatsRow — grammar + zero suppression
// ----------------------------------------------------------------
describe("continuityStatsRow", () => {
  it("empty → null (no row rendered)", () => {
    expect(
      continuityStatsRow({
        workedMs: 0,
        workedLabel: null,
        sessionCount: 0,
        noteCount: 0,
        latestNote: null,
      }),
    ).toBeNull();
  });

  it("full row in order: worked · sessions · notes", () => {
    expect(
      continuityStatsRow({
        workedMs: 42 * 60_000,
        workedLabel: "42 min worked",
        sessionCount: 2,
        noteCount: 3,
        latestNote: null,
      }),
    ).toBe("42 min worked · 2 sessions · 3 notes");
  });

  it("singular session", () => {
    expect(
      continuityStatsRow({
        workedMs: 25 * 60_000,
        workedLabel: "25 min worked",
        sessionCount: 1,
        noteCount: 0,
        latestNote: null,
      }),
    ).toBe("25 min worked · 1 session");
  });

  it("singular note", () => {
    expect(
      continuityStatsRow({
        workedMs: 0,
        workedLabel: null,
        sessionCount: 0,
        noteCount: 1,
        latestNote: "x",
      }),
    ).toBe("1 note");
  });

  it("sub-minute time still shows '<1 min worked'", () => {
    expect(
      continuityStatsRow({
        workedMs: 30_000,
        workedLabel: "<1 min worked",
        sessionCount: 1,
        noteCount: 0,
        latestNote: null,
      }),
    ).toBe("<1 min worked · 1 session");
  });

  it("notes-only row (no worked time, no sessions)", () => {
    expect(
      continuityStatsRow({
        workedMs: 0,
        workedLabel: null,
        sessionCount: 0,
        noteCount: 2,
        latestNote: "x",
      }),
    ).toBe("2 notes");
  });
});

// ----------------------------------------------------------------
// buildNowContext — CLI Project/Goal/whyNow/whyItMatters
// ----------------------------------------------------------------
const baseMatcher: FocusWhyInput = {
  startedAt: null,
  priority: "IMPORTANT",
  size: "M",
  dueDate: iso(NOW), // due today → truthful due clause
};

function cliTask(
  over: Partial<TaskContextInput & FocusWhyInput>,
): TaskContextInput & FocusWhyInput {
  return { ...baseMatcher, ...over };
}

describe("buildNowContext", () => {
  it("full context: Project + resolved Goal + truthful whyNow + whyItMatters", () => {
    const task = cliTask({
      project: {
        id: "p1",
        name: "Launch v2",
        permalink: "launch",
        goal: { id: "g1", name: "Reach 100 paid", description: "Prove demand." },
      },
    });
    const ctx = buildNowContext(task, task.project);
    expect(ctx.project).toEqual({ id: "p1", name: "Launch v2", permalink: "launch" });
    expect(ctx.goal).toEqual({
      id: "g1",
      name: "Reach 100 paid",
      description: "Prove demand.",
    });
    // IMPORTANT + due today → truthful joined reason.
    expect(ctx.whyNow?.toLowerCase()).toContain("important");
    expect(ctx.whyNow?.toLowerCase()).toContain("due today");
    expect(ctx.whyItMatters).toBe("Prove demand.");
  });

  it("Project-only (no Goal on Project, no direct Goal) → goal null, whyItMatters null", () => {
    const task = cliTask({
      project: { id: "p1", name: "Launch v2", goal: null },
    });
    const ctx = buildNowContext(task, task.project);
    expect(ctx.project?.name).toBe("Launch v2");
    expect(ctx.goal).toBeNull();
    expect(ctx.whyItMatters).toBeNull();
    // whyNow still composed truthfully.
    expect(ctx.whyNow).not.toBeNull();
  });

  it("Goal-only (no Project) → goal from legacy direct Goal, whyItMatters uses description", () => {
    const task = cliTask({
      project: null,
      goal: { id: "g-direct", name: "Legacy", description: "Old link." },
    });
    const ctx = buildNowContext(task, null);
    expect(ctx.project).toBeNull();
    expect(ctx.goal?.id).toBe("g-direct");
    expect(ctx.whyItMatters).toBe("Old link.");
  });

  it("description-less Goal → whyItMatters uses Toward fallback", () => {
    const task = cliTask({
      goal: { id: "g1", name: "Reach 100", description: null },
    });
    const ctx = buildNowContext(task, null);
    expect(ctx.whyItMatters).toBe("Toward Reach 100.");
  });

  it("Project Goal precedence in CLI context (over conflicting direct Goal)", () => {
    const task = cliTask({
      project: {
        id: "p1",
        name: "Launch v2",
        goal: { id: "g-proj", name: "Project goal", description: "Proj desc" },
      },
      goal: { id: "g-direct", name: "Direct goal", description: "Direct desc" },
    });
    const ctx = buildNowContext(task, task.project);
    expect(ctx.goal?.id).toBe("g-proj");
    expect(ctx.whyItMatters).toBe("Proj desc");
  });

  it("matcher with no truthful reason → whyNow null (no placeholder)", () => {
    const task = cliTask({
      priority: "NORMAL",
      size: "L", // not a quick win
      dueDate: null, // no due clause
      startedAt: null,
    });
    const ctx = buildNowContext(task, null);
    expect(ctx.whyNow).toBeNull();
  });

  it("no Project and no Goal → project null, goal null, whyItMatters null", () => {
    const task = cliTask({ project: null, goal: null });
    const ctx = buildNowContext(task, null);
    expect(ctx.project).toBeNull();
    expect(ctx.goal).toBeNull();
    expect(ctx.whyItMatters).toBeNull();
  });

  it("never invents whyItMatters from Project or Task text", () => {
    const task = cliTask({
      project: { id: "p1", name: "Launch v2", goal: null },
      // No Goal anywhere — whyItMatters must stay null even though a Project
      // name exists.
    });
    const ctx = buildNowContext(task, task.project);
    expect(ctx.whyItMatters).toBeNull();
    expect(ctx.whyNow).not.toContain("Launch"); // matcher never mentions project
  });
});
