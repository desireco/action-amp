import { describe, expect, it } from "vitest";
import { submitFeedback } from "./operations";
import { mockContext } from "../test/mockContext";

describe("submitFeedback", () => {
  it("requires authentication", async () => {
    const m = mockContext(null);

    await expect(
      submitFeedback({ message: "hello" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("requires a non-empty message", async () => {
    const m = mockContext();

    await expect(
      submitFeedback({ message: "   " }, m.context),
    ).rejects.toThrow(/Feedback is required/);
  });

  it("stores feedback with user and app context", async () => {
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({ fullName: "Zeljko Dakic" });
    m.entities.Feedback.create.mockResolvedValue({
      id: "feedback-1",
      message: "This is useful.",
      route: "/app/today",
      section: "work",
      lensName: "Work",
      lensColor: "indigo",
      userName: "Zeljko Dakic",
      userEmail: null,
      userAgent: "Vitest",
    });

    const result = await submitFeedback(
      {
        message: "  This is useful.  ",
        route: "/app/today",
        section: "work",
        lens: { id: "lens-1", name: "Work", color: "indigo" },
        userAgent: "Vitest",
      },
      m.context,
    );

    expect(result).toEqual({ id: "feedback-1" });
    expect(m.entities.Feedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        message: "This is useful.",
        userId: "user-1",
        userName: "Zeljko Dakic",
        route: "/app/today",
        section: "work",
        lensId: "lens-1",
        lensName: "Work",
        lensColor: "indigo",
        userAgent: "Vitest",
      }),
      select: expect.objectContaining({ id: true }),
    });
  });
});
