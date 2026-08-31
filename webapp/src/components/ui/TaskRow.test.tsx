import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { TaskRow, type TaskRowTask } from "./TaskRow";
import { renderInContext } from "wasp/client/test";

// TaskRow — the universal task list row (variant: HoverCompact). Title leads,
// meta chips wrap below, status is a leading dot, actions hover-reveal on the
// right. No completion control here; a done task reads as such via the
// `--done` class. Notes are not edited in the row — that moved to the detail
// page. Uses fireEvent over user-event (no dep).

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

    it("can render the unboxed list variant", () => {
      const { container } = renderInContext(
        <TaskRow as="div" variant="list" task={BASE_TASK} />,
      );
      const row = container.querySelector(".aa-task-row")!;
      expect(row).toHaveClass("aa-task-row--list");
    });
  });

  describe("status dot", () => {
    it("renders a teal-filled dot for TODAY", () => {
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, status: "TODAY" }} />,
      );
      expect(container.querySelector(".aa-task-row__dot--today")).toBeTruthy();
    });

    it("renders an open-ring dot for UPCOMING", () => {
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, status: "UPCOMING" }} />,
      );
      expect(
        container.querySelector(".aa-task-row__dot--upcoming"),
      ).toBeTruthy();
    });

    it("renders a faint dot for SOMEDAY", () => {
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, status: "SOMEDAY" }} />,
      );
      expect(container.querySelector(".aa-task-row__dot--someday")).toBeTruthy();
    });

    it("renders a filled-checkmark dot for done tasks (and overrides status)", () => {
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, status: "TODAY", isDone: true }} />,
      );
      expect(container.querySelector(".aa-task-row__dot--done")).toBeTruthy();
      // Done wins over Today — the dot is one or the other, not both.
      expect(container.querySelector(".aa-task-row__dot--today")).toBeNull();
    });

    it("renders no dot when status and isDone are both unset", () => {
      const { container } = renderInContext(<TaskRow task={BASE_TASK} />);
      expect(container.querySelector(".aa-task-row__dot")).toBeNull();
    });
  });

  describe("meta chips", () => {
    it("shows a muted chip with the size label", () => {
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, size: "L" }} />,
      );
      const chip = container.querySelector(".aa-task-row__size-chip");
      expect(chip).toHaveTextContent("L");
    });

    it("shows an amber star chip only when priority is IMPORTANT", () => {
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, priority: "IMPORTANT" }} />,
      );
      expect(container.querySelector(".aa-chip--amber")).toBeTruthy();
    });

    it("does not render a priority chip for NORMAL/LOW (calm-system rule)", () => {
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, priority: "NORMAL" }} />,
      );
      expect(container.querySelector(".aa-chip--amber")).toBeNull();
    });

    it("shows due date as a teal chip when in the future", () => {
      const future = new Date();
      future.setDate(future.getDate() + 3);
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, scheduledDate: future }} />,
      );
      const teal = container.querySelector(".aa-chip--teal");
      expect(teal).toBeTruthy();
      expect(teal!.textContent).toMatch(/in 3d/);
    });

    it("shows due date as a rose chip when overdue", () => {
      const past = new Date();
      past.setDate(past.getDate() - 2);
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, scheduledDate: past }} />,
      );
      const rose = container.querySelector(".aa-chip--rose");
      expect(rose).toBeTruthy();
      expect(rose!.textContent).toMatch(/2d overdue/);
    });

    it("hides the due chip on committed (TODAY) tasks — the status is the date", () => {
      const today = new Date();
      const { container } = renderInContext(
        <TaskRow task={{ ...BASE_TASK, status: "TODAY", scheduledDate: today }} />,
      );
      // Same task without the commitment keeps its chip — the rule is about
      // redundancy on Today, not about hiding dates everywhere.
      expect(container.querySelector(".aa-chip--teal")).toBeNull();
      const bench = renderInContext(
        <TaskRow task={{ ...BASE_TASK, scheduledDate: today }} />,
      );
      expect(bench.container.querySelector(".aa-chip--teal")).toBeTruthy();
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

    it("delegates click to the main region when the row has children (actions)", () => {
      const onOpen = vi.fn();
      renderInContext(
        <TaskRow task={BASE_TASK} onOpen={onOpen}>
          <button type="button">Edit</button>
        </TaskRow>,
      );
      // Root is no longer the click target when actions are present.
      const root = screen.getByText("Email Sarah").closest("li")!;
      expect(root).not.toHaveAttribute("role");
      // The title click still opens.
      fireEvent.click(screen.getByText("Email Sarah"));
      expect(onOpen).toHaveBeenCalledWith(BASE_TASK);
    });
  });

  describe("actions slot", () => {
    it("renders children inside the focus-revealed actions region", () => {
      const { container } = renderInContext(
        <TaskRow task={BASE_TASK}>
          <button type="button">Edit</button>
        </TaskRow>,
      );
      const actions = container.querySelector(".aa-task-row__actions")!;
      expect(actions).toContainElement(
        screen.getByRole("button", { name: "Edit" }),
      );
    });
  });
});
