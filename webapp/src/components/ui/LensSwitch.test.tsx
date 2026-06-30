import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { LensSwitch } from "./LensSwitch";
import { renderInContext } from "wasp/client/test";

// LensSwitch — segmented control for switching contexts (Work / Me). It's a
// fully controlled component; these tests cover the selection contract plus the
// per-lens identity-color affordances (the dot + data-lens-color marker).

const OPTS = [
  { id: "Work", label: "Work", color: "indigo" },
  { id: "Me", label: "Me", color: "emerald" },
];

describe("LensSwitch", () => {
  it("renders one tab per option", () => {
    renderInContext(<LensSwitch options={OPTS} active="Work" onSelect={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Me")).toBeInTheDocument();
  });

  it("marks only the active option as selected", () => {
    renderInContext(<LensSwitch options={OPTS} active="Me" onSelect={() => {}} />);
    expect(screen.getByText("Me").closest("button")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Work").closest("button")).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the option id on click", () => {
    const onSelect = vi.fn();
    renderInContext(<LensSwitch options={OPTS} active="Work" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Me"));
    expect(onSelect).toHaveBeenCalledWith("Me");
  });

  describe("identity color", () => {
    it("renders a color dot for options that carry a color", () => {
      const { container } = renderInContext(
        <LensSwitch options={OPTS} active="Work" onSelect={() => {}} />,
      );
      const dots = container.querySelectorAll(".aa-lens__dot");
      expect(dots).toHaveLength(2);
    });

    it("stamps data-lens-color on each button so CSS can style per-lens", () => {
      renderInContext(<LensSwitch options={OPTS} active="Work" onSelect={() => {}} />);
      expect(screen.getByText("Work").closest("button")).toHaveAttribute("data-lens-color", "indigo");
      expect(screen.getByText("Me").closest("button")).toHaveAttribute("data-lens-color", "emerald");
    });

    it("omits the dot + data-lens-color when no color is provided", () => {
      const noColor = [{ id: "Work", label: "Work" }];
      const { container } = renderInContext(
        <LensSwitch options={noColor} active="Work" onSelect={() => {}} />,
      );
      expect(container.querySelector(".aa-lens__dot")).toBeNull();
      expect(screen.getByText("Work").closest("button")).not.toHaveAttribute("data-lens-color");
    });
  });

  describe("today count", () => {
    it("shows the count badge when a lens has today tasks (> 0)", () => {
      const opts = [
        { id: "Work", label: "Work", color: "indigo", count: 3 },
        { id: "Me", label: "Me", color: "emerald", count: 0 },
      ];
      renderInContext(<LensSwitch options={opts} active="Work" onSelect={() => {}} />);
      // Work shows 3; Me has 0 and shows nothing (no guilt dot for empty).
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    });

    it("labels the badge for screen readers", () => {
      renderInContext(
        <LensSwitch
          options={[{ id: "Work", label: "Work", color: "indigo", count: 2 }]}
          active="Work"
          onSelect={() => {}}
        />,
      );
      expect(screen.getByLabelText("2 today tasks")).toBeInTheDocument();
    });

    it("omits the badge entirely when count is missing or 0", () => {
      const { container } = renderInContext(
        <LensSwitch
          options={[
            { id: "Work", label: "Work", color: "indigo" }, // no count
            { id: "Me", label: "Me", color: "emerald", count: 0 },
          ]}
          active="Work"
          onSelect={() => {}}
        />,
      );
      expect(container.querySelector(".aa-lens__count")).toBeNull();
    });
  });
});
