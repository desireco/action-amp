import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { TaskRow, type TaskRowTask } from "./TaskRow";
import { renderInContext } from "wasp/client/test";

// TaskRow — the universal task list row. Completion circle toggle + row click
// (onOpen) + conditional meta chips. Uses fireEvent over user-event (no dep).

const BASE_TASK: TaskRowTask = {
  id: "task-1",
  description: "Email Sarah",
  isDone: false,
};

describe("TaskRow", () => {
  describe("rendering", () => {
    it("shows the task description", () => {
      renderInContext(<TaskRow task={BASE_TASK} />);
      expect(screen.getByText("Email Sarah")).toBeInTheDocument();
    });

    it("shows project chip when a project is provided", () => {
      renderInContext(
        <TaskRow task={{ ...BASE_TASK, project: { id: "p1", name: "Ship v2" } }} />,
      );
      expect(screen.getByText("Ship v2")).toBeInTheDocument();
    });

    it("omits the meta section when no project/size/due/priority", () => {
      const { container } = renderInContext(<TaskRow task={BASE_TASK} />);
      expect(container.querySelector(".aa-task-row__meta")).toBeNull();
    });
  });

  describe("completion toggle", () => {
    it("fires onToggleDone with flipped isDone when circle is clicked", () => {
      const onToggleDone = vi.fn();
      renderInContext(<TaskRow task={BASE_TASK} onToggleDone={onToggleDone} />);

      // The circle is a clickable element inside .aa-task-row__circle.
      const circle = screen
        .getByText("Email Sarah")
        .closest("li")!
        .querySelector(".aa-task-row__circle button")!;
      fireEvent.click(circle);

      expect(onToggleDone).toHaveBeenCalledTimes(1);
      expect(onToggleDone).toHaveBeenCalledWith(
        expect.objectContaining({ id: "task-1", isDone: true }),
      );
    });

    it("does not attach a circle handler when onToggleDone is omitted (read-only)", () => {
      // Logbook rows pass no onToggleDone — the circle is decorative.
      const { container } = renderInContext(<TaskRow task={BASE_TASK} />);
      const circle = container.querySelector(".aa-task-row__circle")!;
      // No throw, no crash — the click is a no-op.
      expect(() => fireEvent.click(circle)).not.toThrow();
    });
  });

  describe("row click (onOpen)", () => {
    it("fires onOpen with the task when the row is clicked", () => {
      const onOpen = vi.fn();
      renderInContext(<TaskRow task={BASE_TASK} onOpen={onOpen} />);

      const row = screen.getByText("Email Sarah").closest("li")!;
      fireEvent.click(row);

      expect(onOpen).toHaveBeenCalledWith(BASE_TASK);
    });

    it("does not render the row as a button when onOpen is omitted", () => {
      // The completion-circle button is always present; what's absent is the
      // row itself being a clickable button.
      renderInContext(<TaskRow task={BASE_TASK} />);
      const li = screen.getByText("Email Sarah").closest("li")!;
      expect(li).not.toHaveAttribute("role");
      expect(li).not.toHaveAttribute("tabindex");
    });
  });
});
