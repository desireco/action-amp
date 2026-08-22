import { describe, it, expect } from "vitest";
import { composeWhy, type FocusWhyInput } from "./focusWhy";
import { currentPlainDate } from "../shared/time/temporal";

/**
 * The transparent "why" line — every spec branch, plus the load-bearing
 * invariant: the line NEVER states a reason that isn't true (no "due today"
 * for an undated task, no "Important" for a Normal one).
 *
 * Dates are passed as ISO strings to avoid wall-clock drift in CI; dayDiff is
 * day-granular so tests use explicit near/far dates relative to "today" via
 * offset helpers.
 */

const daysFromNow = (n: number): string =>
  currentPlainDate().add({ days: n }).toString();

const task = (over: Partial<FocusWhyInput>): FocusWhyInput => ({
  priority: "NORMAL",
  size: "M",
  startedAt: null,
  scheduledDate: null,
  ...over,
});

const joined = (w: { lead: string; detail: string }): string =>
  [w.lead, w.detail].filter(Boolean).join(" ").trim();

describe("composeWhy — in-progress (the terminal signal)", () => {
  it("says 'You're already doing this.' and nothing else, regardless of other fields", () => {
    const w = composeWhy(task({ startedAt: new Date(), priority: "IMPORTANT", scheduledDate: daysFromNow(-3) }));
    expect(w.lead).toBe("You're already doing this.");
    expect(w.detail).toBe("");
    expect(joined(w)).toBe("You're already doing this.");
  });
});

describe("composeWhy — Important", () => {
  it("leads with 'Important' and appends overdue", () => {
    const w = composeWhy(task({ priority: "IMPORTANT", scheduledDate: daysFromNow(-1) }));
    expect(w.lead).toBe("Important");
    expect(joined(w).toLowerCase()).toContain("overdue");
  });

  it("leads with 'Important' and appends due today", () => {
    const w = composeWhy(task({ priority: "IMPORTANT", scheduledDate: daysFromNow(0) }));
    expect(joined(w).toLowerCase()).toContain("due today");
  });

  it("Important with no due date states only 'Important' (no fabricated due reason)", () => {
    // size L so no 'fits in' clause muddies the isolation
    const w = composeWhy(task({ priority: "IMPORTANT", size: "L" }));
    expect(joined(w)).toBe("Important");
  });
});

describe("composeWhy — Low priority", () => {
  it("says 'Quick win' when size is S/M", () => {
    const w = composeWhy(task({ priority: "LOW", size: "S" }));
    expect(w.lead.toLowerCase()).toBe("quick win");
  });

  it("says 'Low priority' when size is L/XL (not a quick win)", () => {
    const w = composeWhy(task({ priority: "LOW", size: "XL" }));
    expect(w.lead).toBe("Low priority");
  });
});

describe("composeWhy — Normal priority (no lead; detail is the reason)", () => {
  it("undated Normal task with no special size → empty line (nothing untruthful to say)", () => {
    // size L: not a quick win, no due → genuinely nothing to add
    const w = composeWhy(task({ priority: "NORMAL", size: "L" }));
    expect(joined(w)).toBe("");
  });

  it("undated Normal small task → 'Fits in 15 min' (size-fit is the honest signal)", () => {
    const w = composeWhy(task({ priority: "NORMAL", size: "S" }));
    expect(joined(w)).toBe("Fits in 15 min");
  });

  it("Normal task due tomorrow → 'Due tomorrow' (size L isolates the due clause)", () => {
    const w = composeWhy(task({ priority: "NORMAL", size: "L", scheduledDate: daysFromNow(1) }));
    expect(joined(w)).toBe("Due tomorrow");
  });

  it("Normal overdue task → 'Overdue' (size L isolates the overdue clause)", () => {
    const w = composeWhy(task({ priority: "NORMAL", size: "L", scheduledDate: daysFromNow(-2) }));
    expect(joined(w)).toBe("Overdue");
  });
});

describe("composeWhy — the load-bearing invariant: never lie", () => {
  it("NEVER says 'due today' for a task with no scheduledDate", () => {
    const w = composeWhy(task({ priority: "NORMAL" }));
    expect(joined(w).toLowerCase()).not.toContain("due");
  });

  it("NEVER says 'Important' for a Normal task", () => {
    const w = composeWhy(task({ priority: "NORMAL", scheduledDate: daysFromNow(0) }));
    expect(w.lead).toBe("");
    expect(joined(w).toLowerCase()).not.toContain("important");
  });

  it("NEVER says 'overdue' for a future-dated task", () => {
    const w = composeWhy(task({ priority: "IMPORTANT", scheduledDate: daysFromNow(5) }));
    expect(joined(w).toLowerCase()).not.toContain("overdue");
    expect(joined(w).toLowerCase()).toContain("due");
  });

  it("composes a multi-clause truthful line: Quick win — due today, fits in 15 min", () => {
    const w = composeWhy(task({ priority: "LOW", size: "S", scheduledDate: daysFromNow(0) }));
    // lead = "Quick win"; detail carries the due + size clauses.
    expect(w.lead).toBe("Quick win");
    expect(w.detail.toLowerCase()).toContain("due today");
    expect(w.detail.toLowerCase()).toContain("fits in 15 min");
  });
});
