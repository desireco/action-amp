// @vitest-environment node
// Op-level entitlement wiring — server project (see vitest.config.ts), so the
// REAL guards run: genuine HttpError 402s, no module mocking. Wiring is
// asserted through behavior: the guards' own tenancy-safe Lens.findFirst
// query, the cap guards' real 402 on a violating count, and entity reads
// never happening when a guard rejects.
import { describe, it, expect } from "vitest";

import { createProject } from "../projects/operations";
import { createGoal } from "../goals/operations";
import { getTasks } from "../tasks/operations";
import {
  mockContext,
  type MockContext,
  type MockUser,
} from "../test/mockContext";
import { FREE_LIMITS } from "./config";

const FREE_USER: MockUser = { id: "user-1", plan: "FREE", planRenewsAt: null };

/** A FREE-user context whose lens resolves as the included, LIFE_AREA lens —
 *  what the real lens/type guards admit without a Pro plan. */
function guardedFreeUser(): MockContext {
  const m = mockContext(FREE_USER);
  m.entities.Lens.findFirst.mockResolvedValue({
    id: "lens-1",
    name: "Me",
    isIncluded: true,
    type: "LIFE_AREA",
  });
  return m;
}

/** The guards' own tenancy-safe lens resolution query. */
const tenancyLensLookup = {
  where: { id: "lens-1", userId: "user-1" },
};

describe("createProject — the project cap + lens guards run for real", () => {
  it("resolves the lens tenancy-safely and admits a FREE user under the cap", async () => {
    const m = guardedFreeUser();
    m.entities.Project.count.mockResolvedValue(2); // FREE cap is 3
    m.entities.Project.create.mockResolvedValue({ id: "p", name: "x" });

    await createProject({ name: "x", lensId: "lens-1" }, m.context);

    // The real lens guard resolved the lens before anything else.
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith(
      expect.objectContaining(tenancyLensLookup),
    );
    // The op counted non-done projects for the cap guard, then created.
    expect(m.entities.Project.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", lensId: "lens-1", isDone: false },
      }),
    );
    expect(m.entities.Project.create).toHaveBeenCalled();
  });

  it("throws a REAL 402 when the FREE project cap is reached (3)", async () => {
    const m = guardedFreeUser();
    m.entities.Project.count.mockResolvedValue(FREE_LIMITS.projects);

    await expect(
      createProject({ name: "x", lensId: "lens-1" }, m.context),
    ).rejects.toMatchObject({ statusCode: 402 });
    expect(m.entities.Project.create).not.toHaveBeenCalled();
  });
});

describe("createGoal — the goal cap guard runs for real", () => {
  it("admits a FREE user with zero goals (cap is 1)", async () => {
    const m = guardedFreeUser();
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Goal.create.mockResolvedValue({ id: "g", name: "x" });

    await createGoal({ name: "x", lensId: "lens-1" }, m.context);

    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith(
      expect.objectContaining(tenancyLensLookup),
    );
    expect(m.entities.Goal.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", lensId: "lens-1", isDone: false },
      }),
    );
    expect(m.entities.Goal.create).toHaveBeenCalled();
  });

  it("throws a REAL 402 when the FREE goal cap is reached (1)", async () => {
    const m = guardedFreeUser();
    m.entities.Goal.count.mockResolvedValue(FREE_LIMITS.goals);

    await expect(
      createGoal({ name: "x", lensId: "lens-1" }, m.context),
    ).rejects.toMatchObject({ statusCode: 402 });
    expect(m.entities.Goal.create).not.toHaveBeenCalled();
  });
});

describe("getTasks — the lens guard gates the read for real", () => {
  it("resolves the lens tenancy-safely before reading", async () => {
    const m = guardedFreeUser();
    m.entities.Task.findMany.mockResolvedValue([]);

    await getTasks({ lensId: "lens-1" }, m.context);

    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith(
      expect.objectContaining(tenancyLensLookup),
    );
    expect(m.entities.Task.findMany).toHaveBeenCalled();
  });

  it("throws a REAL 402 (no read) when the lens is not included", async () => {
    const m = mockContext(FREE_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "lens-1",
      name: "Work",
      isIncluded: false,
      type: "LIFE_AREA",
    });
    m.entities.Task.findMany.mockResolvedValue([]);

    await expect(
      getTasks({ lensId: "lens-1" }, m.context),
    ).rejects.toMatchObject({ statusCode: 402 });
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });
});
