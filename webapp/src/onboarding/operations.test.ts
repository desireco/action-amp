import { describe, it, expect } from "vitest";
import { ensureOnboarded, setPreferredName, getAppData } from "./operations";
import { mockContext } from "../test/mockContext";

/**
 * Onboarding operations — three ops with distinct shapes:
 *   - ensureOnboarded: loop-based find-or-create (idempotency)
 *   - setPreferredName: simple update + validation
 *   - getAppData: Promise.all aggregation of 5 entity calls
 */

describe("ensureOnboarded — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(ensureOnboarded(undefined as never, m.context)).rejects.toThrow(/Not authenticated/);
  });
});

describe("ensureOnboarded — idempotency", () => {
  it("creates both default lenses when neither exists", async () => {
    const m = mockContext();
    m.entities.Lens.findFirst.mockResolvedValue(null); // both missing
    m.entities.Lens.create
      .mockResolvedValueOnce({ id: "lens-work", name: "Work" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me" });

    const result = await ensureOnboarded(undefined as never, m.context);

    expect(result.createdLenses).toEqual([
      { id: "lens-work", name: "Work" },
      { id: "lens-me", name: "Me" },
    ]);
    expect(m.entities.Lens.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Work", userId: "user-1" }),
      select: { id: true, name: true },
    });
  });

  it("creates only the missing lens when one already exists", async () => {
    const m = mockContext();
    // Work exists, Me doesn't.
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work" })
      .mockResolvedValueOnce(null);
    m.entities.Lens.create.mockResolvedValueOnce({ id: "lens-me", name: "Me" });

    const result = await ensureOnboarded(undefined as never, m.context);

    expect(result.createdLenses).toEqual([{ id: "lens-me", name: "Me" }]);
    expect(m.entities.Lens.create).toHaveBeenCalledTimes(1);
    expect(m.entities.Lens.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Me", userId: "user-1" }),
      select: { id: true, name: true },
    });
  });

  it("creates nothing when both lenses exist", async () => {
    const m = mockContext();
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me" });

    const result = await ensureOnboarded(undefined as never, m.context);

    expect(result.createdLenses).toEqual([]);
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
  });
});

describe("setPreferredName — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      setPreferredName({ preferredName: "Z" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("throws on empty name", async () => {
    const m = mockContext();
    await expect(
      setPreferredName({ preferredName: "" }, m.context),
    ).rejects.toThrow(/Preferred name is required/);
  });
});

describe("setPreferredName — happy path", () => {
  it("updates the user and returns the trimmed name", async () => {
    const m = mockContext();
    m.entities.User.update.mockResolvedValue({});

    const result = await setPreferredName(
      { preferredName: "  Jake  " },
      m.context,
    );

    expect(result).toEqual({ preferredName: "Jake" });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { preferredName: "Jake" },
    });
  });
});

describe("getAppData — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getAppData(undefined as never, m.context)).rejects.toThrow(/Not authenticated/);
  });
});

describe("getAppData — happy path", () => {
  it("aggregates lenses + four counts into the shell payload", async () => {
    const m = mockContext();
    const lenses = [
      { id: "lens-work", name: "Work" },
      { id: "lens-me", name: "Me" },
    ];

    // Promise.all runs 5 entity calls — mock each one.
    m.entities.Lens.findMany.mockResolvedValue(lenses);
    m.entities.InboxItem.count.mockResolvedValue(5);
    m.entities.Task.count.mockResolvedValue(3);
    m.entities.Project.count.mockResolvedValue(7);
    m.entities.Goal.count.mockResolvedValue(2);

    const result = await getAppData(undefined as never, m.context);

    expect(result).toEqual({
      lenses,
      counts: { inbox: 5, today: 3, projects: 7, goals: 2 },
    });

    // Verify the count queries use the right filters.
    expect(m.entities.Task.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "TODAY", isDone: false }),
      }),
    );
    expect(m.entities.Project.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDone: false }),
      }),
    );
  });
});
