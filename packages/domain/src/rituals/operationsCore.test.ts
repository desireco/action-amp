// @vitest-environment node
// Rituals core tests — due-ness derivation across all four cadences (+ the
// timezone edge on the INTERVAL phase anchor), complete/uncheck idempotency,
// reflection edit, the whole-feature entitlement guard, and lens joins on
// the Today read (docs/specs/rituals.md §Work parts 3/9).
import { describe, expect, it, vi } from "vitest";
import { plainDateFrom } from "../shared/time/temporal.js";
import {
  MAX_RITUAL_NAME_LENGTH,
  RITUALS_MESSAGE,
  archiveRitualCore,
  assertRitualsAllowed,
  completeRitualCore,
  createRitualCore,
  deleteRitualCore,
  getArchivedRitualsData,
  getRitualHistoryCore,
  getRitualsData,
  getTodayRitualsData,
  reorderRitualsCore,
  restoreRitualCore,
  isDueOn,
  setRitualPausedCore,
  uncheckRitualCore,
  updateReflectionCore,
  updateRitualCore,
  type RitualEntities,
  type RitualRow,
} from "./operationsCore.js";

function ritualDelegate() {
  return {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findMaxOrder: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function entryDelegate() {
  return {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findManyForRitual: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function entities() {
  return {
    Ritual: ritualDelegate(),
    RitualEntry: entryDelegate(),
    Lens: { findNames: vi.fn() },
    Goal: { findOwned: vi.fn().mockResolvedValue({ id: "goal-1" }) },
  } as unknown as RitualEntities & {
    Ritual: ReturnType<typeof ritualDelegate>;
    RitualEntry: ReturnType<typeof entryDelegate>;
    Lens: { findNames: ReturnType<typeof vi.fn> };
  };
}

function row(overrides: Partial<RitualRow> = {}): RitualRow {
  return {
    id: "ritual-1",
    userId: "user-1",
    lensId: "lens-me",
    name: "Morning walk",
    interval: "MORNING",
    cadence: "DAILY",
    weekday: null,
    intervalDays: null,
    guidance: null,
    benefit: null,
    goalId: null,
    order: 0,
    pausedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-09-15T00:00:00Z"),
    updatedAt: new Date("2026-09-15T00:00:00Z"),
    ...overrides,
  };
}

/** 2026-09-18 is a Friday. */
const FRIDAY = plainDateFrom("2026-09-18");
const SATURDAY = plainDateFrom("2026-09-19");
const WEDNESDAY = plainDateFrom("2026-09-16");

describe("isDueOn", () => {
  it("DAILY is due every day", () => {
    expect(isDueOn(row({ cadence: "DAILY" }), FRIDAY)).toBe(true);
    expect(isDueOn(row({ cadence: "DAILY" }), SATURDAY)).toBe(true);
  });

  it("WEEKDAYS is due Monday–Friday and not on the weekend", () => {
    expect(isDueOn(row({ cadence: "WEEKDAYS" }), FRIDAY)).toBe(true);
    expect(isDueOn(row({ cadence: "WEEKDAYS" }), SATURDAY)).toBe(false);
  });

  it("WEEKLY matches weekday in 0–6 ISO order (Mon = 0)", () => {
    // Friday is dayOfWeek 5 → weekday 4.
    expect(isDueOn(row({ cadence: "WEEKLY", weekday: 4 }), FRIDAY)).toBe(true);
    expect(isDueOn(row({ cadence: "WEEKLY", weekday: 2 }), WEDNESDAY)).toBe(true);
    expect(isDueOn(row({ cadence: "WEEKLY", weekday: 0 }), FRIDAY)).toBe(false);
  });

  it("INTERVAL lands every intervalDays from the creation local date", () => {
    const every3 = row({ cadence: "INTERVAL", intervalDays: 3, createdAt: new Date("2026-09-15T00:00:00Z") });
    expect(isDueOn(every3, plainDateFrom("2026-09-15"), "UTC")).toBe(true);
    expect(isDueOn(every3, plainDateFrom("2026-09-18"), "UTC")).toBe(true);
    expect(isDueOn(every3, plainDateFrom("2026-09-17"), "UTC")).toBe(false);
    // Before creation → never due.
    expect(isDueOn(every3, plainDateFrom("2026-09-14"), "UTC")).toBe(false);
  });

  it("INTERVAL anchors the phase on the creation LOCAL date in the user's zone", () => {
    // 2026-09-15T22:00Z is still 09-15 in Chicago (17:00 local) but already
    // 09-16 in Tokyo — the anchor moves with the zone.
    const createdAt = new Date("2026-09-15T22:00:00Z");
    const every2 = row({ cadence: "INTERVAL", intervalDays: 2, createdAt });
    expect(isDueOn(every2, plainDateFrom("2026-09-17"), "America/Chicago")).toBe(true);
    expect(isDueOn(every2, plainDateFrom("2026-09-18"), "Asia/Tokyo")).toBe(true);
    expect(isDueOn(every2, plainDateFrom("2026-09-17"), "Asia/Tokyo")).toBe(false);
  });

  it("INTERVAL without a usable intervalDays is never due", () => {
    expect(isDueOn(row({ cadence: "INTERVAL", intervalDays: null }), FRIDAY)).toBe(false);
  });
});

describe("assertRitualsAllowed", () => {
  it("throws the 402 shape for a FREE user", () => {
    try {
      assertRitualsAllowed({ plan: "FREE" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toMatchObject({
        statusCode: 402,
        message: "Rituals is a Pro feature.",
        data: { feature: RITUALS_MESSAGE.feature, reason: RITUALS_MESSAGE.reason },
      });
    }
  });

  it("passes an active PRO, FOUNDER, manual grant, and admin; blocks a lapsed PRO", () => {
    expect(() =>
      assertRitualsAllowed({ plan: "PRO", planRenewsAt: new Date("2027-01-01T00:00:00Z") }),
    ).not.toThrow();
    expect(() => assertRitualsAllowed({ plan: "FOUNDER", planRenewsAt: null })).not.toThrow();
    expect(() => assertRitualsAllowed({ plan: "FREE", manualAccessGrant: "PRO" })).not.toThrow();
    expect(() => assertRitualsAllowed({ isAdmin: true })).not.toThrow();
    expect(() =>
      assertRitualsAllowed({ plan: "PRO", planRenewsAt: new Date("2026-01-01T00:00:00Z") }),
    ).toThrow(/Pro feature/);
    expect(() => assertRitualsAllowed(null)).toThrow(/Pro feature/);
  });
});

describe("getRitualsData", () => {
  it("lists the lens's active rituals (paused included) with today's entry state", async () => {
    const db = entities();
    db.Ritual.findMany.mockResolvedValue([row(), row({ id: "ritual-2", pausedAt: new Date() })]);
    db.RitualEntry.findMany.mockResolvedValue([
      { id: "e1", ritualId: "ritual-1", userId: "user-1", localDate: new Date("2026-09-18T00:00:00Z"), mood: "HAPPY", note: "felt good", createdAt: new Date() },
    ]);

    const rows = await getRitualsData(db, { userId: "user-1", lensId: "lens-me", today: FRIDAY });

    expect(db.Ritual.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "lens-me", includePaused: true },
    });
    expect(rows[0]?.entryToday).toEqual({ mood: "HAPPY", note: "felt good" });
    expect(rows[1]?.entryToday).toBeNull();
  });
});

describe("getTodayRitualsData", () => {
  it("returns only due, unpaused, unarchived rituals with lens names and checked state", async () => {
    const db = entities();
    db.Ritual.findMany.mockResolvedValue([
      row({ id: "due-1", lensId: "lens-me", cadence: "DAILY" }),
      row({ id: "not-due", lensId: "lens-me", cadence: "WEEKDAYS" }), // Saturday
      row({ id: "paused", lensId: "lens-me", cadence: "DAILY", pausedAt: new Date() }),
      row({ id: "archived", lensId: "lens-me", cadence: "DAILY", archivedAt: new Date() }),
      row({ id: "due-2", lensId: "lens-work", cadence: "WEEKLY", weekday: 5, interval: "EVENING" }),
    ]);
    db.Lens.findNames.mockResolvedValue([
      { id: "lens-me", name: "Me" },
      { id: "lens-work", name: "Work" },
    ]);
    db.RitualEntry.findMany.mockResolvedValue([
      { id: "e1", ritualId: "due-1", userId: "user-1", localDate: new Date(), mood: "NEUTRAL", note: null, createdAt: new Date() },
    ]);

    const rows = await getTodayRitualsData(db, { userId: "user-1", today: SATURDAY, timeZone: "UTC" });

    expect(rows.map((r) => r.id)).toEqual(["due-1", "due-2"]);
    expect(rows[0]).toMatchObject({ lensName: "Me", checked: true, mood: "NEUTRAL" });
    expect(rows[1]).toMatchObject({ lensName: "Work", checked: false, mood: null, interval: "EVENING" });
  });

  it("never joins a foreign entry onto the user's rows", async () => {
    const db = entities();
    db.Ritual.findMany.mockResolvedValue([row({ id: "due-1" })]);
    db.Lens.findNames.mockResolvedValue([{ id: "lens-me", name: "Me" }]);
    db.RitualEntry.findMany.mockResolvedValue([
      { id: "foreign", ritualId: "due-1", userId: "someone-else", localDate: new Date(), mood: "HAPPY", note: null, createdAt: new Date() },
    ]);

    const rows = await getTodayRitualsData(db, { userId: "user-1", today: FRIDAY });

    expect(rows[0]?.checked).toBe(false);
  });
});

describe("createRitualCore", () => {
  it("trims the name, validates cadence fields, and appends after the highest order", async () => {
    const db = entities();
    db.Ritual.findMaxOrder.mockResolvedValue(7);
    db.Ritual.create.mockResolvedValue(row());

    await createRitualCore(db, {
      userId: "user-1",
      lensId: "lens-me",
      name: "  Water  ",
      cadence: "WEEKLY",
      weekday: 4,
      interval: "EVENING",
    });

    expect(db.Ritual.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        lensId: "lens-me",
        name: "Water",
        interval: "EVENING",
        cadence: "WEEKLY",
        weekday: 4,
        intervalDays: null,
        guidance: null,
        benefit: null,
        goalId: null,
        order: 8,
      },
    });
  });

  it("rejects a blank or over-long name (the cleanName set)", async () => {
    const db = entities();
    await expect(
      createRitualCore(db, { userId: "user-1", lensId: "lens-me", name: "   " }),
    ).rejects.toThrow("Ritual name is required.");
    await expect(
      createRitualCore(db, {
        userId: "user-1",
        lensId: "lens-me",
        name: "x".repeat(MAX_RITUAL_NAME_LENGTH + 1),
      }),
    ).rejects.toThrow("120 characters or fewer");
  });

  it("rejects WEEKLY without a weekday and INTERVAL without a 2–365 length", async () => {
    const db = entities();
    await expect(
      createRitualCore(db, { userId: "user-1", lensId: "lens-me", name: "Water", cadence: "WEEKLY" }),
    ).rejects.toThrow("need a day of the week");
    await expect(
      createRitualCore(db, { userId: "user-1", lensId: "lens-me", name: "Water", cadence: "INTERVAL", intervalDays: 1 }),
    ).rejects.toThrow("2 to 365 days");
    await expect(
      createRitualCore(db, { userId: "user-1", lensId: "lens-me", name: "Water", cadence: "INTERVAL" }),
    ).rejects.toThrow("2 to 365 days");
  });
});

describe("updateRitualCore", () => {
  it("validates the EFFECTIVE combination when the cadence changes", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row({ cadence: "DAILY" }));

    await expect(
      updateRitualCore(db, { userId: "user-1", id: "ritual-1", cadence: "WEEKLY" }),
    ).rejects.toThrow("need a day of the week");

    await updateRitualCore(db, { userId: "user-1", id: "ritual-1", cadence: "WEEKLY", weekday: 4 });
    expect(db.Ritual.update).toHaveBeenLastCalledWith({
      where: { id: "ritual-1" },
      data: { cadence: "WEEKLY", weekday: 4, intervalDays: null },
    });
  });

  it("clears the cadence fields when switching back to DAILY", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row({ cadence: "WEEKLY", weekday: 4 }));

    await updateRitualCore(db, { userId: "user-1", id: "ritual-1", cadence: "DAILY" });

    expect(db.Ritual.update).toHaveBeenCalledWith({
      where: { id: "ritual-1" },
      data: { cadence: "DAILY", weekday: null, intervalDays: null },
    });
  });

  it("rejects a foreign or missing ritual", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(null);
    await expect(
      updateRitualCore(db, { userId: "user-1", id: "other", name: "Water" }),
    ).rejects.toThrow("Ritual not found.");
  });
});

describe("completeRitualCore / uncheckRitualCore", () => {
  const DAY = new Date("2026-09-18T00:00:00Z");

  it("creates the entry with optional mood and a trimmed note", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row());
    db.RitualEntry.findFirst.mockResolvedValue(null);
    db.RitualEntry.create.mockResolvedValue({ id: "e1" });

    await completeRitualCore(db, {
      userId: "user-1",
      ritualId: "ritual-1",
      localDate: DAY,
      mood: "HAPPY",
      note: "  easy  ",
    });

    expect(db.RitualEntry.create).toHaveBeenCalledWith({
      data: { ritualId: "ritual-1", userId: "user-1", localDate: DAY, mood: "HAPPY", note: "easy" },
    });
  });

  it("completing with nothing entered is a valid check", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row());
    db.RitualEntry.findFirst.mockResolvedValue(null);
    db.RitualEntry.create.mockResolvedValue({ id: "e1" });

    await completeRitualCore(db, { userId: "user-1", ritualId: "ritual-1", localDate: DAY });

    expect(db.RitualEntry.create).toHaveBeenCalledWith({
      data: { ritualId: "ritual-1", userId: "user-1", localDate: DAY, mood: null, note: null },
    });
  });

  it("is idempotent: a second complete rewrites the reflection instead of creating", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row());
    db.RitualEntry.findFirst.mockResolvedValue({ id: "e1", ritualId: "ritual-1", userId: "user-1", localDate: DAY, mood: "NEUTRAL", note: null, createdAt: new Date() });

    await completeRitualCore(db, { userId: "user-1", ritualId: "ritual-1", localDate: DAY, mood: "HAPPY", note: null });

    expect(db.RitualEntry.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { mood: "HAPPY", note: null } });
    expect(db.RitualEntry.create).not.toHaveBeenCalled();
  });

  it("uncheck deletes the day's entry and is idempotent", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row());
    db.RitualEntry.findFirst.mockResolvedValue(null);
    db.RitualEntry.delete.mockResolvedValue(undefined);

    await uncheckRitualCore(db, { userId: "user-1", ritualId: "ritual-1", localDate: DAY });

    expect(db.RitualEntry.delete).toHaveBeenCalledWith({ where: { ritualId: "ritual-1", localDate: DAY } });
  });

  it("rejects completing a foreign ritual", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(null);
    await expect(
      completeRitualCore(db, { userId: "user-1", ritualId: "other", localDate: DAY }),
    ).rejects.toThrow("Ritual not found.");
    expect(db.RitualEntry.create).not.toHaveBeenCalled();
  });
});

describe("updateReflectionCore", () => {
  const DAY = new Date("2026-09-18T00:00:00Z");

  it("edits the saved mood/note in place", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row());
    db.RitualEntry.findFirst.mockResolvedValue({ id: "e1", ritualId: "ritual-1", userId: "user-1", localDate: DAY, mood: "NEUTRAL", note: null, createdAt: new Date() });
    db.RitualEntry.update.mockResolvedValue({ id: "e1" });

    await updateReflectionCore(db, { userId: "user-1", ritualId: "ritual-1", localDate: DAY, mood: "NEGATIVE", note: "rough morning" });

    expect(db.RitualEntry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { mood: "NEGATIVE", note: "rough morning" },
    });
  });

  it("requires an existing entry — there is nothing to edit on an unchecked day", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row());
    db.RitualEntry.findFirst.mockResolvedValue(null);
    await expect(
      updateReflectionCore(db, { userId: "user-1", ritualId: "ritual-1", localDate: DAY, mood: null, note: null }),
    ).rejects.toThrow("not checked off");
  });
});

describe("setRitualPausedCore / archiveRitualCore", () => {
  it("pause stamps pausedAt and resume clears it", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row());
    db.Ritual.update.mockResolvedValue(row());

    await setRitualPausedCore(db, { userId: "user-1", id: "ritual-1", paused: true });
    const first = db.Ritual.update.mock.calls[0]?.[0];
    expect(first?.data.pausedAt).toBeInstanceOf(Date);

    await setRitualPausedCore(db, { userId: "user-1", id: "ritual-1", paused: false });
    const second = db.Ritual.update.mock.calls[1]?.[0];
    expect(second?.data.pausedAt).toBeNull();
  });

  it("archive stamps archivedAt — history stays, the row leaves the active list", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row());
    db.Ritual.update.mockResolvedValue(row());

    await archiveRitualCore(db, { userId: "user-1", id: "ritual-1" });

    const call = db.Ritual.update.mock.calls[0]?.[0];
    expect(call?.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("guidance + benefit", () => {
  it("create trims and stores both definition fields", async () => {
    const db = entities();
    db.Ritual.findMaxOrder.mockResolvedValue(null);
    db.Ritual.create.mockResolvedValue(row());

    await createRitualCore(db, {
      userId: "user-1",
      lensId: "lens-me",
      name: "Journaling",
      guidance: "  Ten minutes, three bullets, no editing.  ",
      benefit: "Clears the noise before the day starts",
    });

    const data = db.Ritual.create.mock.calls[0]?.[0]?.data;
    expect(data?.guidance).toBe("Ten minutes, three bullets, no editing.");
    expect(data?.benefit).toBe("Clears the noise before the day starts");
  });

  it("caps each definition field at 500 characters", async () => {
    const db = entities();
    await expect(
      createRitualCore(db, {
        userId: "user-1",
        lensId: "lens-me",
        name: "Journaling",
        guidance: "x".repeat(501),
      }),
    ).rejects.toThrow("Guidance must be 500 characters or fewer.");
    await expect(
      createRitualCore(db, {
        userId: "user-1",
        lensId: "lens-me",
        name: "Journaling",
        benefit: "x".repeat(501),
      }),
    ).rejects.toThrow("Benefit must be 500 characters or fewer.");
  });

  it("update can clear either field with null", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row({ guidance: "old", benefit: "old" }));
    db.Ritual.update.mockResolvedValue(row());

    await updateRitualCore(db, { userId: "user-1", id: "ritual-1", guidance: null });

    expect(db.Ritual.update).toHaveBeenLastCalledWith({
      where: { id: "ritual-1" },
      data: { guidance: null },
    });
  });
});

describe("history + reorder", () => {
  it("history requires ownership and returns the delegate's rows", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row());
    db.RitualEntry.findManyForRitual.mockResolvedValue([]);

    await getRitualHistoryCore(db, { userId: "user-1", ritualId: "ritual-1", limit: 30 });

    expect(db.RitualEntry.findManyForRitual).toHaveBeenCalledWith({
      where: { ritualId: "ritual-1" },
      take: 30,
    });
  });

  it("history rejects a foreign ritual", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(null);
    await expect(
      getRitualHistoryCore(db, { userId: "user-1", ritualId: "other" }),
    ).rejects.toThrow("Ritual not found.");
  });

  it("reorder writes order = index for the full array", async () => {
    const db = entities();
    db.Ritual.findMany.mockResolvedValue([
      row({ id: "r-a", order: 1 }),
      row({ id: "r-b", order: 0 }),
    ]);
    db.Ritual.update.mockResolvedValue(row());

    await reorderRitualsCore(db, { userId: "user-1", lensId: "lens-me", orderedIds: ["r-b", "r-a"] });

    expect(db.Ritual.update).toHaveBeenCalledTimes(2);
    expect(db.Ritual.update).toHaveBeenNthCalledWith(1, { where: { id: "r-b" }, data: { order: 0 } });
    expect(db.Ritual.update).toHaveBeenNthCalledWith(2, { where: { id: "r-a" }, data: { order: 1 } });
  });

  it("reorder rejects foreign or partial arrays", async () => {
    const db = entities();
    db.Ritual.findMany.mockResolvedValue([row({ id: "r-a" }), row({ id: "r-b" })]);
    await expect(
      reorderRitualsCore(db, { userId: "user-1", lensId: "lens-me", orderedIds: ["r-a"] }),
    ).rejects.toThrow(/cover exactly/);
    await expect(
      reorderRitualsCore(db, { userId: "user-1", lensId: "lens-me", orderedIds: ["r-a", "foreign"] }),
    ).rejects.toThrow(/cover exactly/);
    expect(db.Ritual.update).not.toHaveBeenCalled();
  });
});

describe("goal link", () => {
  it("create with a foreign goal id rejects with the calm 404", async () => {
    const db = entities();
    (db as unknown as { Goal: { findOwned: ReturnType<typeof vi.fn> } }).Goal.findOwned.mockResolvedValue(null);
    await expect(
      createRitualCore(db, { userId: "user-1", lensId: "lens-me", name: "Water", goalId: "foreign" }),
    ).rejects.toThrow("Goal not found.");
    expect(db.Ritual.create).not.toHaveBeenCalled();
  });

  it("create with an owned goal passes it through", async () => {
    const db = entities();
    db.Ritual.findMaxOrder.mockResolvedValue(null);
    db.Ritual.create.mockResolvedValue(row());
    await createRitualCore(db, { userId: "user-1", lensId: "lens-me", name: "Water", goalId: "goal-1" });
    expect(db.Ritual.create.mock.calls[0]?.[0]?.data.goalId).toBe("goal-1");
  });
});

describe("archive ↔ restore", () => {
  it("the archived read uses the retired-only set", async () => {
    const db = entities();
    db.Ritual.findMany.mockResolvedValue([row({ archivedAt: new Date() })]);
    await getArchivedRitualsData(db, { userId: "user-1", lensId: "lens-me" });
    expect(db.Ritual.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "lens-me", archivedOnly: true, includePaused: true },
    });
  });

  it("restore clears archivedAt", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row({ archivedAt: new Date() }));
    db.Ritual.update.mockResolvedValue(row());
    await restoreRitualCore(db, { userId: "user-1", id: "ritual-1" });
    const call = db.Ritual.update.mock.calls[0]?.[0];
    expect(call?.data.archivedAt).toBeNull();
  });
});

describe("deleteRitualCore", () => {
  it("deletes an archived ritual", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row({ archivedAt: new Date() }));
    db.Ritual.delete.mockResolvedValue(row());

    await deleteRitualCore(db, { userId: "user-1", id: "ritual-1" });

    expect(db.Ritual.delete).toHaveBeenCalledWith({ where: { id: "ritual-1" } });
  });

  it("refuses an ACTIVE ritual — archive first, then delete", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(row()); // archivedAt: null
    await expect(
      deleteRitualCore(db, { userId: "user-1", id: "ritual-1" }),
    ).rejects.toThrow("Only archived rituals can be deleted.");
    expect(db.Ritual.delete).not.toHaveBeenCalled();
  });

  it("rejects a foreign ritual", async () => {
    const db = entities();
    db.Ritual.findFirst.mockResolvedValue(null);
    await expect(
      deleteRitualCore(db, { userId: "user-1", id: "other" }),
    ).rejects.toThrow("Ritual not found.");
  });
});
