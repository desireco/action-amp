import { beforeEach, describe, expect, it } from "vitest";
import { mockContext } from "../test/mockContext";
import { completeReview, getReview, saveReviewDraft } from "./operations";

const args = {
  cadence: "DAILY" as const,
  forDate: "2026-08-08",
  timeZone: "UTC",
};

describe("review operation guards", () => {
  it.each([
    ["read", (context: any) => getReview(args, context)],
    [
      "save",
      (context: any) => saveReviewDraft({ ...args, answers: {} }, context),
    ],
    [
      "complete",
      (context: any) => completeReview({ ...args, answers: {} }, context),
    ],
  ])("rejects unauthenticated %s", async (_name, call) => {
    await expect(call(mockContext(null).context)).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("review ownership", () => {
  const userId = "review-owner";
  let m: ReturnType<typeof mockContext>;

  beforeEach(() => {
    m = mockContext(userId);
    m.entities.Review.findUnique.mockResolvedValue(null);
    m.entities.Task.findMany.mockResolvedValue([]);
    m.entities.Project.findMany.mockResolvedValue([]);
    m.entities.Goal.findMany.mockResolvedValue([]);
    m.entities.TaskSession.findMany.mockResolvedValue([]);
    m.entities.Review.upsert.mockResolvedValue({
      id: "review-1",
      updatedAt: new Date("2026-08-08T20:00:00Z"),
      completedAt: null,
    });
  });

  it("keys reads to the authenticated user", async () => {
    await getReview(args, m.context);
    expect(m.entities.Task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId }),
      }),
    );
    expect(m.entities.Review.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_cadence_periodStart: expect.objectContaining({ userId }),
        },
      }),
    );
  });

  it("keys writes to the authenticated user", async () => {
    await saveReviewDraft({ ...args, answers: { memory: "Done." } }, m.context);
    expect(m.entities.Review.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId }),
      }),
    );
  });
});
