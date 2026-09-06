// Component test for PropertyChips — the shared chip-driven property editor.
// Locks in: config-driven fields render their displayValue; inline-popover
// picks fire onPick(fieldKey, value); built-in picker fields open the sheet;
// externalPicker fields fire onPickerOpen; readOnly renders static pills;
// unset fields render the "+ Label" affordance.
import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, render } from "@testing-library/react";
import { PropertyChips, type PropertyField } from "./PropertyChips";

const fields: PropertyField[] = [
  {
    key: "when",
    variant: "when",
    value: "Today",
    displayValue: "Today",
    options: [
      { value: "Today", label: "Today" },
      { value: "Upcoming", label: "Upcoming" },
      { value: "Someday", label: "Someday" },
    ],
  },
  {
    key: "priority",
    variant: "important",
    value: "IMPORTANT",
    displayValue: "Important",
    options: [
      { value: "LOW", label: "Low" },
      { value: "NORMAL", label: "Normal" },
      { value: "IMPORTANT", label: "Important" },
    ],
  },
  {
    key: "size",
    variant: "size",
    value: "L",
    displayValue: "L",
    options: [
      { value: "S", label: "S" },
      { value: "M", label: "M" },
      { value: "L", label: "L" },
      { value: "XL", label: "XL" },
    ],
  },
];

describe("PropertyChips — closed state", () => {
  it("renders a chip showing each field's displayValue", () => {
    render(
      <PropertyChips
        fields={fields}
        onPick={vi.fn()}
        onPickerPick={vi.fn()}
      />,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Important")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("renders a quiet + Label affordance for unset fields", () => {
    const unsetFields: PropertyField[] = [
      {
        key: "due",
        variant: "due",
        value: null,
        displayValue: "Due",
        addLabel: "Due",
        unset: true,
        options: [{ value: "this-week", label: "This week" }],
      },
    ];
    render(
      <PropertyChips
        fields={unsetFields}
        onPick={vi.fn()}
        onPickerPick={vi.fn()}
      />,
    );
    expect(screen.getByText("+ Due")).toBeInTheDocument();
  });
});

describe("PropertyChips — inline popover picks", () => {
  it("clicking a chip opens its popover and picking fires onPick with the right field+value", () => {
    const onPick = vi.fn();
    render(
      <PropertyChips fields={fields} onPick={onPick} onPickerPick={vi.fn()} />,
    );
    // Open the When chip.
    fireEvent.click(screen.getByText("Today"));
    // Pick "Upcoming" (the option button is the parent of the label span).
    fireEvent.click(screen.getByText("Upcoming").closest("button")!);
    expect(onPick).toHaveBeenCalledWith("when", "Upcoming");
  });

  it("picking a size option fires onPick with the size field", () => {
    const onPick = vi.fn();
    render(
      <PropertyChips fields={fields} onPick={onPick} onPickerPick={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("L"));
    fireEvent.click(screen.getByText("XL").closest("button")!);
    expect(onPick).toHaveBeenCalledWith("size", "XL");
  });
});

describe("PropertyChips — picker fields", () => {
  it("built-in picker fields open a bottom sheet and picking fires onPickerPick", () => {
    const onPickerPick = vi.fn();
    const pickerFields: PropertyField[] = [
      {
        key: "project",
        variant: "project",
        value: null,
        displayValue: "No project",
        picker: {
          title: "Project",
          allowNone: true,
          noneLabel: "No project",
          items: [
            { id: "p1", label: "Dol Hunt" },
            { id: "p2", label: "Ship v2" },
          ],
        },
      },
    ];
    render(
      <PropertyChips
        fields={pickerFields}
        onPick={vi.fn()}
        onPickerPick={onPickerPick}
      />,
    );
    fireEvent.click(screen.getByText("No project"));
    // The picker sheet reveals the project options.
    fireEvent.click(screen.getByText("Dol Hunt"));
    expect(onPickerPick).toHaveBeenCalledWith("project", "p1");
  });

  it("externalPicker fields fire onPickerOpen instead of opening an internal sheet", () => {
    const onPickerOpen = vi.fn();
    const externalFields: PropertyField[] = [
      {
        key: "project",
        variant: "project",
        value: null,
        displayValue: "General",
        externalPicker: true,
      },
    ];
    render(
      <PropertyChips
        fields={externalFields}
        onPick={vi.fn()}
        onPickerOpen={onPickerOpen}
      />,
    );
    fireEvent.click(screen.getByText("General"));
    expect(onPickerOpen).toHaveBeenCalledWith("project");
  });
});

describe("PropertyChips — read-only state", () => {
  it("renders static chips with no popovers when readOnly", () => {
    const onPick = vi.fn();
    render(
      <PropertyChips
        fields={fields}
        readOnly
        onPick={onPick}
        onPickerPick={vi.fn()}
      />,
    );
    // Static labels render.
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Important")).toBeInTheDocument();
    // Clicking does nothing — no popover, no onPick.
    fireEvent.click(screen.getByText("Today"));
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("PropertyChips — open-change notification", () => {
  it("calls onOpenChange(true) when a popover opens and false when it closes", () => {
    const onOpenChange = vi.fn();
    render(
      <PropertyChips
        fields={fields}
        onPick={vi.fn()}
        onPickerPick={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByText("Today")); // open
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
