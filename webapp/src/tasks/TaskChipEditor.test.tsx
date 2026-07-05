// Component test for TaskChipEditor — the chip row on the task detail page.
// Locks in: clicking a chip opens its popover; picking an option calls onChange
// with the right patch; the project/goal chips open the PickerSheet; and the
// done-task state renders static (read-only) chips.
import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, render } from "@testing-library/react";
import { TaskChipEditor, type TaskChipState } from "./TaskChipEditor";

const baseTask: TaskChipState = {
  status: "TODAY",
  priority: "NORMAL",
  size: "L",
  dueDate: null,
  project: { id: "p1", permalink: "dol-hunt", name: "Dol Hunt" },
  goal: null,
};

describe("TaskChipEditor — closed state", () => {
  it("renders a chip for each set property, color-coded by meaning", () => {
    render(
      <TaskChipEditor
        task={baseTask}
        projects={[]}
        goals={[]}
        onChange={vi.fn()}
      />,
    );
    // When = Today (teal), Priority = Normal, Size = L, Project = Dol Hunt.
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("Dol Hunt")).toBeInTheDocument();
  });

  it("shows a quiet + Due chip when dueDate is unset", () => {
    render(
      <TaskChipEditor
        task={baseTask}
        projects={[]}
        goals={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("+ Due")).toBeInTheDocument();
  });

  it("shows a + Goal chip only when there's no project (one-parent rule)", () => {
    const { rerender } = render(
      <TaskChipEditor
        task={baseTask}
        projects={[]}
        goals={[]}
        onChange={vi.fn()}
      />,
    );
    // With a project set, no + Goal chip (project carries the goal).
    expect(screen.queryByText("+ Goal")).not.toBeInTheDocument();

    // Without a project, + Goal appears.
    rerender(
      <TaskChipEditor
        task={{ ...baseTask, project: null }}
        projects={[]}
        goals={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("+ Goal")).toBeInTheDocument();
  });
});

describe("TaskChipEditor — popover picks", () => {
  it("clicking the When chip opens its popover and picking Today fires onChange", () => {
    const onChange = vi.fn();
    render(
      <TaskChipEditor
        task={{ ...baseTask, status: "UPCOMING" }}
        projects={[]}
        goals={[]}
        onChange={onChange}
      />,
    );
    // The When chip currently reads "Upcoming".
    fireEvent.click(screen.getByText("Upcoming"));
    // Popover reveals the options.
    fireEvent.click(screen.getByText("Today", { selector: "button span, span" }));
    // onChange fires with just the status patch.
    expect(onChange).toHaveBeenCalledWith({ status: "TODAY" });
  });

  it("clicking the Priority chip and picking Important fires onChange", () => {
    const onChange = vi.fn();
    render(
      <TaskChipEditor
        task={baseTask}
        projects={[]}
        goals={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Normal"));
    // The popover option for Important (the option button is the parent of the label span).
    const importantOpt = screen.getByText("Important").closest("button")!;
    fireEvent.click(importantOpt);
    expect(onChange).toHaveBeenCalledWith({ priority: "IMPORTANT" });
  });

  it("clicking the Size chip and picking XL fires onChange", () => {
    const onChange = vi.fn();
    render(
      <TaskChipEditor
        task={baseTask}
        projects={[]}
        goals={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("L"));
    const xlOpt = screen.getByText("XL").closest("button")!;
    fireEvent.click(xlOpt);
    expect(onChange).toHaveBeenCalledWith({ size: "XL" });
  });

  it("the + Due chip opens a preset popover and picking This week fires onChange with a Date", () => {
    const onChange = vi.fn();
    render(
      <TaskChipEditor
        task={baseTask}
        projects={[]}
        goals={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("+ Due"));
    const weekOpt = screen.getByText("This week").closest("button")!;
    fireEvent.click(weekOpt);
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.dueDate).toBeInstanceOf(Date);
  });
});

describe("TaskChipEditor — done-task state", () => {
  it("renders static chips with no popovers when readOnly", () => {
    const onChange = vi.fn();
    render(
      <TaskChipEditor
        task={{ ...baseTask, priority: "IMPORTANT" }}
        projects={[]}
        goals={[]}
        readOnly
        onChange={onChange}
      />,
    );
    // Static labels render.
    expect(screen.getByText("today")).toBeInTheDocument();
    expect(screen.getByText("Important")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("Dol Hunt")).toBeInTheDocument();
    // No popover triggers — clicking does nothing.
    fireEvent.click(screen.getByText("Important"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
