// @vitest-environment node
// Op-level entitlement wiring — verifies each guarded op invokes the
// entitlement guards with the right arguments. The guards themselves (pure
// violation logic) are unit-tested in entitlements.test.ts; the HTTP throw
// (402 + ProGate body) is verified end-to-end. Here we stub the server-only
// HttpError layer so this test never loads `wasp/server` (blocked by
// detectServerImports under src/ in the client build Vitest uses) and assert
// the ops call the guards at the right points.
import { describe, it, expect, vi } from "vitest";

const assertLensAllowed = vi.fn().mockResolvedValue(undefined);
const assertUnderCap = vi.fn().mockResolvedValue(undefined);
vi.mock("../billing/entitlementHttp", () => ({ assertLensAllowed, assertUnderCap }));

// Import AFTER the mock so the ops pick up the stubbed guards.
const { createProject } = await import("../projects/operations");
const { createGoal } = await import("../goals/operations");
const { getTasks } = await import("../tasks/operations");
import { mockContext, type MockUser } from "../test/mockContext";
import { FREE_LIMITS } from "./config";

const FUTURE = new Date(Date.now() + 86_400_000);
const FREE_USER: MockUser = { id: "user-1", plan: "FREE", planRenewsAt: null };

/** The lens lookup happens inside assertLensAllowed now (stubbed), so the op no
 * longer calls Lens.findFirst itself — clear spies between tests. */
function resetSpies() {
  assertLensAllowed.mockClear();
  assertUnderCap.mockClear();
}

describe("createProject — invokes the project cap + lens guards", () => {
  it("calls assertLensAllowed with the lensId + assertUnderCap with the cap", async () => {
    resetSpies();
    const m = mockContext(FREE_USER);
    m.entities.Project.count.mockResolvedValue(2);
    m.entities.Project.create.mockResolvedValue({ id: "p", name: "x" });

    await createProject({ name: "x", lensId: "lens-1" }, m.context);

    expect(assertLensAllowed).toHaveBeenCalledWith(m.context, "lens-1");
    expect(assertUnderCap).toHaveBeenCalledWith(
      m.context,
      "lens-1",
      2,
      FREE_LIMITS.projects,
      { feature: "a 4th project", reason: "organize more than 3 projects with Pro" },
    );
  });

  it("does NOT create when the cap guard throws", async () => {
    resetSpies();
    const m = mockContext(FREE_USER);
    assertUnderCap.mockRejectedValueOnce(new Error("402"));
    m.entities.Project.create.mockResolvedValue({ id: "p", name: "x" });

    await expect(createProject({ name: "x", lensId: "lens-1" }, m.context)).rejects.toThrow("402");
    expect(m.entities.Project.create).not.toHaveBeenCalled();
  });
});

describe("createGoal — invokes the goal cap + lens guards", () => {
  it("calls assertLensAllowed + assertUnderCap with the goal cap (1)", async () => {
    resetSpies();
    const m = mockContext(FREE_USER);
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Goal.create.mockResolvedValue({ id: "g", name: "x" });

    await createGoal({ name: "x", lensId: "lens-1" }, m.context);

    expect(assertLensAllowed).toHaveBeenCalledWith(m.context, "lens-1");
    expect(assertUnderCap).toHaveBeenCalledWith(
      m.context,
      "lens-1",
      0,
      FREE_LIMITS.goals,
      { feature: "a 2nd goal", reason: "link work to more than one outcome with Pro" },
    );
  });
});

describe("getTasks — invokes the lens guard before reading", () => {
  it("calls assertLensAllowed with the lensId", async () => {
    resetSpies();
    const m = mockContext(FREE_USER);
    m.entities.Task.findMany.mockResolvedValue([]);

    await getTasks({ lensId: "lens-1" }, m.context);

    expect(assertLensAllowed).toHaveBeenCalledWith(m.context, "lens-1");
  });

  it("does NOT read when the lens guard throws", async () => {
    resetSpies();
    const m = mockContext(FREE_USER);
    assertLensAllowed.mockRejectedValueOnce(new Error("402"));
    m.entities.Task.findMany.mockResolvedValue([]);

    await expect(getTasks({ lensId: "lens-1" }, m.context)).rejects.toThrow("402");
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });
});
