// Pure feedback cores (S17 port of webapp/src/feedback/operationsCore.test.ts,
// minus the submitFeedbackCore block — that core is not part of this slice).
// Core functions are pure DB ops; node is the right environment.
import { describe, it, expect, beforeEach } from "vitest";
import {
  listFeedbackCore,
  showFeedbackCore,
  updateFeedbackStatusCore,
  deleteFeedbackCore,
  FEEDBACK_STATUSES,
  isFeedbackStatus,
} from "./operationsCore.js";
import { mockContext } from "../test/mockContext.js";

/**
 * Pure feedback cores — the shared DB layer for the admin /api/cli/feedback/*
 * routes + the dashboard's feedback ops. These tests pin the core behavior
 * directly: the list/show/update shapes and the status enum guard.
 */

const FEEDBACK_ROW = {
  id: "fb-1",
  shortId: "ABCD-1234",
  createdAt: new Date("2026-07-22T10:00:00Z"),
  updatedAt: new Date("2026-07-22T10:00:00Z"),
  deletedAt: null,
  message: "Looks great.",
  status: "OPEN",
  userId: "user-1",
  userName: "Zeljko Dakic",
  userEmail: "zeljko@dakic.com",
  route: "/do",
  section: "work",
  lensId: "lens-1",
  lensName: "Work",
  lensColor: "indigo",
  userAgent: "Vitest",
  viewport: null,
  timezone: null,
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

describe("listFeedbackCore", () => {
  beforeEach(() => {
    mockContext();
  });

  it("lists newest-first with no filter by default", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([FEEDBACK_ROW]);
    const rows = await listFeedbackCore(entities as never, {});
    expect(rows).toHaveLength(1);
    expect(entities.Feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        where: { deletedAt: null },
      }),
    );
  });

  it("filters by status when given", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([]);
    await listFeedbackCore(entities as never, { status: "RESOLVED" });
    expect(entities.Feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, status: "RESOLVED" } }),
    );
  });

  it("applies take when a limit is given", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([]);
    await listFeedbackCore(entities as never, { limit: 25 });
    expect(entities.Feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
  });

  it("omits take (unbounded) when no limit is given", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([]);
    await listFeedbackCore(entities as never, {});
    const call = entities.Feedback.findMany.mock.calls[0][0];
    expect(call).not.toHaveProperty("take");
  });
});

describe("showFeedbackCore", () => {
  it("returns null when no row matches", async () => {
    const { entities } = mockContext();
    entities.Feedback.findFirst.mockResolvedValue(null);
    const result = await showFeedbackCore(entities as never, { id: "missing" });
    expect(result).toBeNull();
    // Prefix lookup uses findFirst (newest-first), not findUnique.
    expect(entities.Feedback.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("matches a shortId prefix (case-insensitive, partial ok)", async () => {
    const { entities } = mockContext();
    entities.Feedback.findFirst.mockResolvedValue(FEEDBACK_ROW);
    await showFeedbackCore(entities as never, { id: "cfv" });
    // "CFV" is ≤4 chars → no dash inserted → matches stored "ABCD-..." only if
    // the stored shortId started with CFV; here we assert the prefix shape.
    expect(entities.Feedback.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { shortId: { startsWith: "CFV" } },
            { id: { startsWith: "cfv" } },
          ],
        },
      }),
    );
  });

  it("maps Crockford-ambiguous characters (O→0, I/L→1, U→V)", async () => {
    const { entities } = mockContext();
    entities.Feedback.findFirst.mockResolvedValue(FEEDBACK_ROW);
    await showFeedbackCore(entities as never, { id: "CoVu" });
    expect(entities.Feedback.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { shortId: { startsWith: "C0VV" } },
            { id: { startsWith: "CoVu" } },
          ],
        },
      }),
    );
  });

  it("matches a full shortId (dash re-inserted to match stored format)", async () => {
    const { entities } = mockContext();
    entities.Feedback.findFirst.mockResolvedValue(FEEDBACK_ROW);
    await showFeedbackCore(entities as never, { id: "abcd-1234" });
    // 8 chars → dash re-inserted at position 4 → "ABCD-1234" matches stored format.
    expect(entities.Feedback.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { shortId: { startsWith: "ABCD-1234" } },
            { id: { startsWith: "abcd-1234" } },
          ],
        },
      }),
    );
  });
});

describe("updateFeedbackStatusCore", () => {
  it("throws on an invalid status (defense-in-depth)", async () => {
    const { entities } = mockContext();
    // Bypass TS for the bad-value test.
    await expect(
      updateFeedbackStatusCore(entities as never, { id: "fb-1", status: "BOGUS" as never }),
    ).rejects.toThrow(/Invalid status/);
  });

  it("throws 'Feedback not found.' when no row matches", async () => {
    const { entities } = mockContext();
    entities.Feedback.findFirst.mockResolvedValue(null);
    await expect(
      updateFeedbackStatusCore(entities as never, { id: "missing", status: "RESOLVED" }),
    ).rejects.toThrow(/Feedback not found/);
  });

  it("updates by the resolved PK (not the input prefix)", async () => {
    const { entities } = mockContext();
    // findFirst resolves the row; its real id is "fb-1".
    entities.Feedback.findFirst.mockResolvedValue({ id: "fb-1" });
    entities.Feedback.update.mockResolvedValue({ ...FEEDBACK_ROW, status: "RESOLVED" });

    const result = await updateFeedbackStatusCore(entities as never, {
      id: "CFV", // prefix — resolves to fb-1
      status: "RESOLVED",
    });

    // Update uses the resolved PK, so a prefix that matches several rows can
    // only ever touch the one findFirst returned.
    expect(entities.Feedback.update).toHaveBeenCalledWith({
      where: { id: "fb-1" },
      data: { status: "RESOLVED" },
      select: expect.any(Object),
    });
    expect(result.status).toBe("RESOLVED");
  });

  it("uses findFirst (prefix) to resolve the row", async () => {
    const { entities } = mockContext();
    entities.Feedback.findFirst.mockResolvedValue({ id: "fb-1" });
    entities.Feedback.update.mockResolvedValue({ ...FEEDBACK_ROW, status: "CLOSED" });

    await updateFeedbackStatusCore(entities as never, { id: "ABCD", status: "CLOSED" });

    expect(entities.Feedback.findFirst).toHaveBeenCalled();
    expect(entities.Feedback.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fb-1" } }),
    );
  });
});

describe("deleteFeedbackCore", () => {
  it("throws 'Feedback not found.' when no row matches", async () => {
    const { entities } = mockContext();
    entities.Feedback.findFirst.mockResolvedValue(null);
    await expect(deleteFeedbackCore(entities as never, { id: "missing" })).rejects.toThrow(
      /Feedback not found/,
    );
  });

  it("sets deletedAt (by resolved PK) without destroying the row", async () => {
    const { entities } = mockContext();
    entities.Feedback.findFirst.mockResolvedValue({ id: "fb-1" });
    entities.Feedback.update.mockResolvedValue({ ...FEEDBACK_ROW, deletedAt: new Date("2026-07-23T10:00:00Z") });

    const result = await deleteFeedbackCore(entities as never, { id: "CFV" });

    expect(entities.Feedback.update).toHaveBeenCalledWith({
      where: { id: "fb-1" },
      data: { deletedAt: expect.any(Date) },
      select: expect.any(Object),
    });
    expect(result.deletedAt).toBeTruthy();
  });
});
