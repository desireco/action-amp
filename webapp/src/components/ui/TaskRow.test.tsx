import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { TaskRow, type TaskRowTask } from "./TaskRow";
import { renderInContext } from "wasp/client/test";

// TaskRow — the universal task list row. Title + meta chips + row click (onOpen).
// There is no completion control here; a done task reads as such via the
// `--done` class (driven by task.isDone). Uses fireEvent over user-event (no dep).

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
        <TaskRow
          task={{ ...BASE_TASK, project: { id: "p1", name: "Ship v2" } }}
        />,
      );
      expect(screen.getByText("Ship v2")).toBeInTheDocument();
    });

    it("omits the meta section when no project/size/due/priority", () => {
      const { container } = renderInContext(<TaskRow task={BASE_TASK} />);
      expect(container.querySelector(".aa-task-row__meta")).toBeNull();
    });

    it("marks done rows with the done class (no checkbox — completion is elsewhere)", () => {
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, isDone: true }} />,
      );
      const li = container.querySelector(".aa-task-row")!;
      expect(li).toHaveClass("aa-task-row--done");
    });

    it("can render the reusable surface variant as a div", () => {
      const { container } = renderInContext(
        <TaskRow as="div" variant="surface" task={BASE_TASK} />,
      );
      const row = container.querySelector(".aa-task-row")!;
      expect(row.tagName).toBe("DIV");
      expect(row).toHaveClass("aa-task-row--surface");
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
      renderInContext(<TaskRow task={BASE_TASK} />);
      const li = screen.getByText("Email Sarah").closest("li")!;
      expect(li).not.toHaveAttribute("role");
      expect(li).not.toHaveAttribute("tabindex");
    });
  });

  describe("notes editing", () => {
    it("shows existing task notes and saves edits inline", async () => {
      const onSaveContent = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <TaskRow
          task={{ ...BASE_TASK, content: "Bring the contract notes." }}
          onSaveContent={onSaveContent}
        />,
      );

      expect(screen.getByText("Bring the contract notes.")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /edit notes/i }));
      fireEvent.change(screen.getByLabelText(/task notes/i), {
        target: { value: "  Updated notes  " },
      });
      fireEvent.click(screen.getByRole("button", { name: /save notes/i }));

      await waitFor(() =>
        expect(onSaveContent).toHaveBeenCalledWith(
          { ...BASE_TASK, content: "Bring the contract notes." },
          "Updated notes",
        ),
      );
    });

    it("can add notes when a task has no content yet", async () => {
      const onSaveContent = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <TaskRow task={BASE_TASK} onSaveContent={onSaveContent} />,
      );

      fireEvent.click(screen.getByRole("button", { name: /add notes/i }));
      fireEvent.change(screen.getByLabelText(/task notes/i), {
        target: { value: "First useful detail" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save notes/i }));

      await waitFor(() =>
        expect(onSaveContent).toHaveBeenCalledWith(
          BASE_TASK,
          "First useful detail",
        ),
      );
    });

    it("can place the update control in the action rail", () => {
      const onSaveContent = vi.fn().mockResolvedValue(undefined);
      const { container } = renderInContext(
        <TaskRow
          task={BASE_TASK}
          onSaveContent={onSaveContent}
          notesToggleLabel="Update task"
          notesTogglePlacement="actions"
        />,
      );

      const actions = container.querySelector(".aa-task-row__actions")!;
      expect(actions).toContainElement(
        screen.getByRole("button", { name: /update task/i }),
      );
      expect(
        container.querySelector(".aa-task-row__notes"),
      ).not.toContainElement(
        screen.getByRole("button", { name: /update task/i }),
      );
    });
  });
});
