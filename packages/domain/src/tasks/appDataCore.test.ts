// @vitest-environment node
/**
 * App-shell bootstrap core tests — the S4 counts plus the Planning-structure
 * trio (projects/goals/rituals). Mock delegates per the domain test
 * convention (vi.fn spies; the `as unknown as` cast mirrors
 * lifecycleCore.test.ts's asLenses — runtime shape is what's asserted).
 */
import { describe, it, expect, vi } from "vitest";
import { getAppDataCore, type AppDataEntities } from "./appDataCore.js";

const NOW = new Date();

/** Delegates standing in for the seam: same-day rollover stamp (no rollover
 *  write) + a fresh activity stamp (no throttle write), so the counts are
 *  the only observable behavior. */
function fakeEntities(opts?: {
  lensRows?: Array<{ id: string; name: string; isIncluded: boolean }>;
  taskCounts?: { today?: number; upcoming?: number; someday?: number };
}) {
  const lensRows =
    opts?.lensRows ?? [{ id: "lens-1", name: "Work", isIncluded: false }];
  const taskCounts = opts?.taskCounts ?? { today: 2, upcoming: 3, someday: 4 };
  const Task = {
    count: vi.fn().mockImplementation((args: { where: { status?: string } }) => {
      switch (args.where.status) {
        case "TODAY":
          return Promise.resolve(taskCounts.today ?? 0);
        case "UPCOMING":
          return Promise.resolve(taskCounts.upcoming ?? 0);
        case "SOMEDAY":
          return Promise.resolve(taskCounts.someday ?? 0);
        default:
          return Promise.resolve(0);
      }
    }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const Lens = {
    // Both the lens-list read and resolveAccessibleLenses's read hit this
    // spy; the full-row shape satisfies both (extra fields are ignored).
    findMany: vi.fn().mockResolvedValue(
      lensRows.map((l) => ({ ...l, color: null, purpose: null, isDefault: false })),
    ),
  };
  const Project = { count: vi.fn().mockResolvedValue(5) };
  const Goal = { count: vi.fn().mockResolvedValue(6) };
  const Ritual = { count: vi.fn().mockResolvedValue(7) };
  const User = {
    findUnique: vi.fn().mockResolvedValue({
      id: "user-1",
      timeZone: "UTC",
      lastTodayRolloverAt: NOW,
      lastActiveAt: NOW,
      todayCap: 5,
      focusSessionMinutes: 25,
    }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  return { Task, Lens, Project, Goal, Ritual, User };
}

function asEntities(fake: ReturnType<typeof fakeEntities>): AppDataEntities {
  // SAFETY: vi.fn spies satisfy the delegate slices at runtime.
  return fake as unknown as AppDataEntities;
}

// Entitled user → the accessible-lens set is every lens (isAdmin shortcut).
const USER = { isAdmin: true };

describe("getAppDataCore counts", () => {
  it("scopes the Planning-structure trio to the active lens", async () => {
    const fake = fakeEntities();
    const out = await getAppDataCore(asEntities(fake), {
      user: USER,
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(out.counts).toEqual({
      today: 2,
      upcoming: 3,
      someday: 4,
      projects: 5,
      goals: 6,
      rituals: 7,
    });
    // Projects: the page's active cards — not done, not archived.
    expect(fake.Project.count).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "lens-1", isDone: false, archivedAt: null },
    });
    // Goals: the active list.
    expect(fake.Goal.count).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "lens-1", isDone: false },
    });
    // Rituals: the Planning list — unarchived, paused included.
    expect(fake.Ritual.count).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "lens-1", includePaused: true },
    });
  });

  it("counts nothing when the account has no lenses yet", async () => {
    const fake = fakeEntities({ lensRows: [] });
    const out = await getAppDataCore(asEntities(fake), {
      user: USER,
      userId: "user-1",
      lensId: null,
    });

    expect(out.counts).toEqual({
      today: 0,
      upcoming: 0,
      someday: 0,
      projects: 0,
      goals: 0,
      rituals: 0,
    });
    expect(fake.Project.count).not.toHaveBeenCalled();
    expect(fake.Goal.count).not.toHaveBeenCalled();
    expect(fake.Ritual.count).not.toHaveBeenCalled();
  });
});
