// @vitest-environment node
// S1+S4 — tests for the task-lifecycle extras cores (ported from the webapp
// wrapper behaviors the P0 notes pin: completeTaskFromFocus idempotency +
// guards + COMPLETED event, the updateTaskDetails one-parent rules, and the
// unscheduleOverdue payload). EntitySpy mocks per mockContext pattern.
import { describe, expect, it } from "vitest";
import {
  addTaskUpdateCore,
  completeTaskFromFocusCore,
  setTaskOutcomeCore,
  unscheduleOverdueTasksCore,
  updateTaskContentCore,
  updateTaskDetailsCore,
} from "./taskExtrasCore.js";
import { mockContext, type MockContext } from "../test/mockContext.js";

const OWNED_TASK = {
  id: "task-1",
  userId: "user-1",
  lensId: "lens-1",
  projectId: null,
  goalId: null,
  isDone: false,
  completedAt: null,
  startedAt: new Date("2026-09-01T10:00:00Z"),
  isOnboardingSample: false,
};

function asComplete(m: MockContext) {
  m.entities.Task.findUnique.mockResolvedValue({ ...OWNED_TASK });
  m.entities.Task.update.mockResolvedValue({ id: "task-1", completedAt: new Date() });
  m.entities.TaskUpdate.create.mockResolvedValue({ id: "tu-1" });
  m.entities.User.updateMany.mockResolvedValue({ count: 1 });
  // SAFETY: EntitySpy vi.fn()s satisfy the delegate slice at runtime.
  return m.context.entities as Parameters<typeof completeTaskFromFocusCore>[0];
}

describe("completeTaskFromFocusCore", () => {
  it("marks done, closes the open session, and logs one COMPLETED event", async () => {
    const m = mockContext();
    const entities = asComplete(m);

    const result = await completeTaskFromFocusCore(entities, {
      userId: "user-1",
      taskId: "task-1",
      outcome: "  shipped it  ",
    });

    expect(result.completedAt).toBeInstanceOf(Date);
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { isDone: true, completedAt: expect.any(Date), startedAt: null, outcome: "shipped it" },
    });
    expect(m.entities.TaskSession.updateMany).toHaveBeenCalledWith({
      where: { taskId: "task-1", endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
    expect(m.entities.TaskUpdate.create).toHaveBeenCalledWith({
      data: { body: "Completed", kind: "COMPLETED", taskId: "task-1", userId: "user-1" },
    });
  });

  it("is idempotent for an already-done task — no second event, no writes", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      ...OWNED_TASK,
      isDone: true,
      completedAt: new Date("2026-09-01T09:00:00Z"),
    });

    const result = await completeTaskFromFocusCore(
      m.context.entities as Parameters<typeof completeTaskFromFocusCore>[0],
      { userId: "user-1", taskId: "task-1" },
    );

    expect(result.completedAt).toEqual(new Date("2026-09-01T09:00:00Z"));
    expect(m.entities.Task.update).not.toHaveBeenCalled();
    expect(m.entities.TaskUpdate.create).not.toHaveBeenCalled();
  });

  it("requires startedAt (completion happens from focus)", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ ...OWNED_TASK, startedAt: null });
    await expect(
      completeTaskFromFocusCore(
        m.context.entities as Parameters<typeof completeTaskFromFocusCore>[0],
        { userId: "user-1", taskId: "task-1" },
      ),
    ).rejects.toThrow("Start the task before completing it.");
  });

  it("rejects cross-tenant tasks", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ ...OWNED_TASK, userId: "someone-else" });
    await expect(
      completeTaskFromFocusCore(
        m.context.entities as Parameters<typeof completeTaskFromFocusCore>[0],
        { userId: "user-1", taskId: "task-1" },
      ),
    ).rejects.toThrow("Task not found.");
  });

  it("advances onboarding only while on the SAMPLE_TASK stage", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ ...OWNED_TASK, isOnboardingSample: true });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", completedAt: new Date() });
    await completeTaskFromFocusCore(
      m.context.entities as Parameters<typeof completeTaskFromFocusCore>[0],
      { userId: "user-1", taskId: "task-1" },
    );
    expect(m.entities.User.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", onboardingStage: "SAMPLE_TASK" },
      data: { onboardingStage: "CAPTURE" },
    });
  });
});

describe("addTaskUpdateCore", () => {
  it("trims and appends a NOTE; empty body throws", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.TaskUpdate.create.mockResolvedValue({ id: "tu-1" });

    await addTaskUpdateCore(
      m.context.entities as Parameters<typeof addTaskUpdateCore>[0],
      { userId: "user-1", taskId: "task-1", body: "  noted  " },
    );
    expect(m.entities.TaskUpdate.create).toHaveBeenCalledWith({
      data: { body: "noted", kind: "NOTE", taskId: "task-1", userId: "user-1" },
    });

    m.entities.TaskUpdate.create.mockClear();
    await expect(
      addTaskUpdateCore(
        m.context.entities as Parameters<typeof addTaskUpdateCore>[0],
        { userId: "user-1", taskId: "task-1", body: "   " },
      ),
    ).rejects.toThrow("Note cannot be empty.");
    expect(m.entities.TaskUpdate.create).not.toHaveBeenCalled();
  });
});

describe("updateTaskContentCore / setTaskOutcomeCore", () => {
  it("normalizes whitespace-only to null", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", content: null, outcome: null });

    await updateTaskContentCore(
      m.context.entities as Parameters<typeof updateTaskContentCore>[0],
      { userId: "user-1", taskId: "task-1", content: "   " },
    );
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { content: null },
    });

    await setTaskOutcomeCore(
      m.context.entities as Parameters<typeof setTaskOutcomeCore>[0],
      { userId: "user-1", taskId: "task-1", outcome: "done well" },
    );
    expect(m.entities.Task.update).toHaveBeenLastCalledWith({
      where: { id: "task-1" },
      data: { outcome: "done well" },
    });
  });
});

describe("updateTaskDetailsCore", () => {
  function detailsEntities(m: MockContext) {
    m.entities.Task.findUnique.mockResolvedValue({ ...OWNED_TASK });
    m.entities.Task.update.mockResolvedValue({ ...OWNED_TASK });
    // SAFETY: EntitySpy vi.fn()s satisfy the delegate slice at runtime.
    return m.context.entities as Parameters<typeof updateTaskDetailsCore>[0];
  }

  it("requires a non-empty title when description is passed", async () => {
    const m = mockContext();
    await expect(
      updateTaskDetailsCore(detailsEntities(m), {
        userId: "user-1",
        taskId: "task-1",
        description: "   ",
      }),
    ).rejects.toThrow("Task title is required.");
  });

  it("drops scheduledDate when committing to TODAY (one field may say today)", async () => {
    const m = mockContext();
    await updateTaskDetailsCore(detailsEntities(m), {
      userId: "user-1",
      taskId: "task-1",
      status: "TODAY",
    });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "TODAY", scheduledDate: null },
    });
  });

  it("assigning a project clears the goal (one-parent rule)", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ ...OWNED_TASK, goalId: "goal-1" });
    m.entities.Task.update.mockResolvedValue({ ...OWNED_TASK, projectId: "proj-1", goalId: null });
    m.entities.Project.findUnique.mockResolvedValue({
      userId: "user-1",
      lensId: "lens-1",
      type: "STANDARD",
    });
    await updateTaskDetailsCore(
      m.context.entities as Parameters<typeof updateTaskDetailsCore>[0],
      { userId: "user-1", taskId: "task-1", projectId: "proj-1" },
    );
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { projectId: "proj-1", goalId: null },
    });
  });

  it("rejects a goal when the task has a project, and SIMPLE_LIST projects", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ ...OWNED_TASK, projectId: "proj-1" });
    await expect(
      updateTaskDetailsCore(
        m.context.entities as Parameters<typeof updateTaskDetailsCore>[0],
        { userId: "user-1", taskId: "task-1", goalId: "goal-1" },
      ),
    ).rejects.toThrow("A task can't have both a project and a goal.");

    const n = mockContext();
    n.entities.Task.findUnique.mockResolvedValue({ ...OWNED_TASK });
    n.entities.Project.findUnique.mockResolvedValue({
      userId: "user-1",
      lensId: "lens-1",
      type: "SIMPLE_LIST",
    });
    await expect(
      updateTaskDetailsCore(
        n.context.entities as Parameters<typeof updateTaskDetailsCore>[0],
        { userId: "user-1", taskId: "task-1", projectId: "list-1" },
      ),
    ).rejects.toThrow("A task cannot live in a Simple-list Project.");
  });

  it("enforces same-Lens parents", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ ...OWNED_TASK });
    m.entities.Project.findUnique.mockResolvedValue({
      userId: "user-1",
      lensId: "other-lens",
      type: "STANDARD",
    });
    await expect(
      updateTaskDetailsCore(
        m.context.entities as Parameters<typeof updateTaskDetailsCore>[0],
        { userId: "user-1", taskId: "task-1", projectId: "proj-1" },
      ),
    ).rejects.toThrow("Project must be in the same Lens.");
  });
});

describe("unscheduleOverdueTasksCore", () => {
  it("clears only past-dated open Upcoming rows in the lens", async () => {
    const m = mockContext();
    m.entities.Task.updateMany.mockResolvedValue({ count: 3 });
    const today = new Date("2026-09-01T00:00:00Z");
    const result = await unscheduleOverdueTasksCore(
      m.context.entities as Parameters<typeof unscheduleOverdueTasksCore>[0],
      { userId: "user-1", lensId: "lens-1", today },
    );
    expect(result).toEqual({ count: 3 });
    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        lensId: "lens-1",
        status: "UPCOMING",
        isDone: false,
        scheduledDate: { lt: today },
      },
      data: { scheduledDate: null },
    });
  });
});
