// @vitest-environment node
// Ported from webapp/src/feedback/operationsCore.test.ts (the
// submitFeedbackCore describe block — S-review feedback-submit port). The
// admin-side core pins live in operationsCore.test.ts; this file pins the
// submit write: validation, the shortId mint (+ collision retry), the create
// payload, and the optional-field clamps.
import { describe, it, expect } from "vitest";
import { submitFeedbackCore } from "./submit.js";
import { uniqueShortId } from "../shared/shortId.js";
import { mockContext } from "../test/mockContext.js";

/** The full-row shape the create returns (the wrapper only needs `{ id }`). */
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
} as const;

describe("submitFeedbackCore", () => {
  it("rejects an empty message", async () => {
    const { entities } = mockContext();
    await expect(
      submitFeedbackCore(
        entities as unknown as Parameters<typeof submitFeedbackCore>[0],
        { userId: "u1", message: "   " },
      ),
    ).rejects.toThrow(/Feedback is required/);
  });

  it("rejects an over-long message", async () => {
    const { entities } = mockContext();
    await expect(
      submitFeedbackCore(
        entities as unknown as Parameters<typeof submitFeedbackCore>[0],
        { userId: "u1", message: "x".repeat(4001) },
      ),
    ).rejects.toThrow(/too long/);
  });

  it("trims the message + writes the denormalized context fields", async () => {
    const { entities } = mockContext();
    // collision-check findUnique resolves null (no clash) → mint proceeds.
    entities.Feedback.findUnique.mockResolvedValue(null);
    entities.Feedback.create.mockResolvedValue(FEEDBACK_ROW);

    await submitFeedbackCore(
      entities as unknown as Parameters<typeof submitFeedbackCore>[0],
      {
        userId: "user-1",
        message: "  Looks great.  ",
        route: "/do",
        section: "work",
        lens: { id: "lens-1", name: "Work", color: "indigo" },
        userAgent: "Vitest",
        userName: "Zeljko Dakic",
        userEmail: "zeljko@dakic.com",
      },
    );

    expect(entities.Feedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shortId: expect.stringMatching(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/),
        message: "Looks great.",
        userId: "user-1",
        userName: "Zeljko Dakic",
        userEmail: "zeljko@dakic.com",
        route: "/do",
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

    await submitFeedbackCore(
      entities as unknown as Parameters<typeof submitFeedbackCore>[0],
      { userId: "u1", message: "hi" },
    );

    expect(entities.Feedback.findUnique).toHaveBeenCalledTimes(2);
  });

  it("persists viewport + timezone when provided, clamped to their caps", async () => {
    const { entities } = mockContext();
    entities.Feedback.create.mockResolvedValue(FEEDBACK_ROW);

    await submitFeedbackCore(
      entities as unknown as Parameters<typeof submitFeedbackCore>[0],
      {
        userId: "u1",
        message: "hi",
        viewport: "1440x900",
        timezone: "America/Toronto",
      },
    );

    expect(entities.Feedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        viewport: "1440x900",
        timezone: "America/Toronto",
      }),
      select: expect.any(Object),
    });
  });

  it("stores null viewport/timezone when omitted", async () => {
    const { entities } = mockContext();
    entities.Feedback.create.mockResolvedValue(FEEDBACK_ROW);

    await submitFeedbackCore(
      entities as unknown as Parameters<typeof submitFeedbackCore>[0],
      { userId: "u1", message: "hi" },
    );

    expect(entities.Feedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ viewport: null, timezone: null }),
      select: expect.any(Object),
    });
  });
});

describe("uniqueShortId", () => {
  it("mints XXXX-XXXX from the Crockford alphabet (no I/L/O/U)", async () => {
    const id = await uniqueShortId(async () => false);
    expect(id).toMatch(/^[0-9A-HJ-NP-TV-Z]{4}-[0-9A-HJ-NP-TV-Z]{4}$/);
  });

  it("retries until the exists predicate clears", async () => {
    // Deterministic: the first three candidates are "taken", the fourth wins.
    // (Can't force WHICH random ids collide — only how many calls it takes.)
    let calls = 0;
    const id = await uniqueShortId(async () => ++calls <= 3);
    expect(calls).toBe(4);
    expect(id).toMatch(/^[0-9A-HJ-NP-TV-Z]{4}-[0-9A-HJ-NP-TV-Z]{4}$/);
  });
});
