// @vitest-environment node
// Core functions are pure DB ops (no DOM); node is the right environment. The
// module under test imports nothing from `wasp/server`, so no mock is needed
// for it — unlike operations.test.ts, which stubs the email path.
import { describe, it, expect, beforeEach } from "vitest";
import {
  submitFeedbackCore,
  listFeedbackCore,
  showFeedbackCore,
  updateFeedbackStatusCore,
  FEEDBACK_STATUSES,
  isFeedbackStatus,
} from "./operationsCore";
import { mockContext } from "../test/mockContext";

/**
 * Pure feedback cores — the shared DB layer for the in-app submit action +
 * the admin /api/cli/feedback/* routes. These tests pin the core behavior
 * directly: validation, the create payload, the list/show/update shapes, and
 * the status enum guard.
 */

const FEEDBACK_ROW = {
  id: "fb-1",
  shortId: "ABCD-1234",
  createdAt: new Date("2026-07-22T10:00:00Z"),
  updatedAt: new Date("2026-07-22T10:00:00Z"),
  message: "Looks great.",
  status: "OPEN",
  userId: "user-1",
  userName: "Zeljko Dakic",
  userEmail: "zeljko@dakic.com",
  route: "/app",
  section: "work",
  lensId: "lens-1",
  lensName: "Work",
  lensColor: "indigo",
  userAgent: "Vitest",
};

describe("isFeedbackStatus", () => {
  it("accepts the 4 canonical values", () => {
    for (const s of FEEDBACK_STATUSES) {
      expect(isFeedbackStatus(s)).toBe(true);
    }
  });

  it("rejects unknown + lowercase values", () => {
    expect(isFeedbackStatus("BOGUS")).toBe(false);
    expect(isFeedbackStatus("open")).toBe(false);
    expect(isFeedbackStatus(null)).toBe(false);
  });
});

describe("submitFeedbackCore", () => {
  it("rejects an empty message", async () => {
    const { entities } = mockContext();
    await expect(
      submitFeedbackCore(entities, { userId: "u1", message: "   " }),
    ).rejects.toThrow(/Feedback is required/);
  });

  it("rejects an over-long message", async () => {
    const { entities } = mockContext();
    await expect(
      submitFeedbackCore(entities, { userId: "u1", message: "x".repeat(4001) }),
    ).rejects.toThrow(/too long/);
  });

  it("trims the message + writes the denormalized context fields", async () => {
    const { entities } = mockContext();
    // collision-check findUnique resolves undefined (no clash) → mint proceeds.
    entities.Feedback.findUnique.mockResolvedValue(null);
    entities.Feedback.create.mockResolvedValue(FEEDBACK_ROW);

    await submitFeedbackCore(entities, {
      userId: "user-1",
      message: "  Looks great.  ",
      route: "/app",
      section: "work",
      lens: { id: "lens-1", name: "Work", color: "indigo" },
      userAgent: "Vitest",
      userName: "Zeljko Dakic",
      userEmail: "zeljko@dakic.com",
    });

    expect(entities.Feedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shortId: expect.stringMatching(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/),
        message: "Looks great.",
        userId: "user-1",
        userName: "Zeljko Dakic",
        userEmail: "zeljko@dakic.com",
        route: "/app",
        section: "work",
        lensId: "lens-1",
        lensName: "Work",
        lensColor: "indigo",
        userAgent: "Vitest",
      }),
      select: expect.objectContaining({ id: true, shortId: true, status: true }),
    });
  });

  it("retries shortId mint on collision", async () => {
    const { entities } = mockContext();
    // First candidate clashes, second doesn't.
    entities.Feedback.findUnique
      .mockResolvedValueOnce({ id: "taken" })
      .mockResolvedValueOnce(null);
    entities.Feedback.create.mockResolvedValue(FEEDBACK_ROW);

    await submitFeedbackCore(entities, { userId: "u1", message: "hi" });

    expect(entities.Feedback.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("listFeedbackCore", () => {
  beforeEach(() => {
    mockContext();
  });

  it("lists newest-first with no filter by default", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([FEEDBACK_ROW]);
    const rows = await listFeedbackCore(entities, {});
    expect(rows).toHaveLength(1);
    expect(entities.Feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        where: undefined,
      }),
    );
  });

  it("filters by status when given", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([]);
    await listFeedbackCore(entities, { status: "RESOLVED" });
    expect(entities.Feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "RESOLVED" } }),
    );
  });
});

describe("showFeedbackCore", () => {
  it("returns the findUnique result (null when absent)", async () => {
    const { entities } = mockContext();
    entities.Feedback.findUnique.mockResolvedValue(null);
    const result = await showFeedbackCore(entities, { id: "missing" });
    expect(result).toBeNull();
    expect(entities.Feedback.findUnique).toHaveBeenCalledWith({
      where: { id: "missing" },
      select: expect.any(Object),
    });
  });

  it("resolves by shortId when the ref looks like one (case-insensitive)", async () => {
    const { entities } = mockContext();
    entities.Feedback.findUnique.mockResolvedValue(FEEDBACK_ROW);
    await showFeedbackCore(entities, { id: "abcd-1234" });
    // normalizeShortId uppercases + keeps the dash → ABCD-1234.
    expect(entities.Feedback.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shortId: "ABCD-1234" } }),
    );
  });
});

describe("updateFeedbackStatusCore", () => {
  it("throws on an invalid status (defense-in-depth)", async () => {
    const { entities } = mockContext();
    // Bypass TS for the bad-value test.
    await expect(
      updateFeedbackStatusCore(entities, { id: "fb-1", status: "BOGUS" as never }),
    ).rejects.toThrow(/Invalid status/);
  });

  it("throws 'Feedback not found.' when the row is absent", async () => {
    const { entities } = mockContext();
    entities.Feedback.findUnique.mockResolvedValue(null);
    await expect(
      updateFeedbackStatusCore(entities, { id: "missing", status: "RESOLVED" }),
    ).rejects.toThrow(/Feedback not found/);
  });

  it("updates + returns the row", async () => {
    const { entities } = mockContext();
    entities.Feedback.findUnique.mockResolvedValue({ id: "fb-1" });
    entities.Feedback.update.mockResolvedValue({ ...FEEDBACK_ROW, status: "RESOLVED" });

    const result = await updateFeedbackStatusCore(entities, {
      id: "fb-1",
      status: "RESOLVED",
    });

    expect(entities.Feedback.update).toHaveBeenCalledWith({
      where: { id: "fb-1" },
      data: { status: "RESOLVED" },
      select: expect.any(Object),
    });
    expect(result.status).toBe("RESOLVED");
  });

  it("resolves by shortId when the ref looks like one", async () => {
    const { entities } = mockContext();
    entities.Feedback.findUnique.mockResolvedValue({ id: "fb-1" });
    entities.Feedback.update.mockResolvedValue({ ...FEEDBACK_ROW, status: "CLOSED" });

    await updateFeedbackStatusCore(entities, { id: "ABCD-1234", status: "CLOSED" });

    expect(entities.Feedback.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shortId: "ABCD-1234" } }),
    );
  });
});
