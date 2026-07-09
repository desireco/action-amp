// Component test for the Breadcrumb component — pins the controlled-component
// contract: crumbs render in order, the active crumb is highlighted with
// aria-current, and onSelect fires with the crumb id on click.
import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, render } from "@testing-library/react";
import { Breadcrumb } from "./Breadcrumb";
import type { BreadcrumbItem } from "./Breadcrumb";

const ITEMS: BreadcrumbItem[] = [
  { id: "goal:g1", label: "Grow audience" },
  { id: "project:p1", label: "Newsletter" },
  { id: "task:t1", label: "Send issue #1" },
];

describe("Breadcrumb", () => {
  it("renders all crumbs in order shallowest → deepest", () => {
    render(
      <Breadcrumb items={ITEMS} active="task:t1" onSelect={vi.fn()} />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Grow audience",
      "Newsletter",
      "Send issue #1",
    ]);
  });

  it("marks the active crumb with aria-current=location", () => {
    render(
      <Breadcrumb items={ITEMS} active="project:p1" onSelect={vi.fn()} />,
    );
    const active = screen.getByText("Newsletter");
    expect(active).toHaveAttribute("aria-current", "location");
    // The other crumbs are NOT active.
    expect(screen.getByText("Grow audience")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Send issue #1")).not.toHaveAttribute("aria-current");
  });

  it("fires onSelect with the crumb id when a crumb is clicked", () => {
    const onSelect = vi.fn();
    render(
      <Breadcrumb items={ITEMS} active="task:t1" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText("Grow audience"));
    expect(onSelect).toHaveBeenCalledWith("goal:g1");

    fireEvent.click(screen.getByText("Newsletter"));
    expect(onSelect).toHaveBeenCalledWith("project:p1");
  });

  it("fires onSelect even when clicking the already-active crumb", () => {
    const onSelect = vi.fn();
    render(
      <Breadcrumb items={ITEMS} active="task:t1" onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText("Send issue #1"));
    expect(onSelect).toHaveBeenCalledWith("task:t1");
  });

  it("renders the separator between crumbs but not before the first", () => {
    const { container } = render(
      <Breadcrumb items={ITEMS} active="task:t1" onSelect={vi.fn()} />,
    );
    const seps = container.querySelectorAll(".aa-breadcrumb__sep");
    expect(seps).toHaveLength(2); // between 1↔2 and 2↔3, not before 1
  });
});
