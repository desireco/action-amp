import type { Meta, StoryObj } from "@storybook/svelte";
import PickerSheet from "./PickerSheet.svelte";
import { darkTheme } from "./storybook";

/**
 * PickerSheet — shared bottom-sheet list for choosing one Project, Goal, or
 * similar destination. The current pick gets the teal state tint; the number
 * keys (1–9) are shown as quiet key-caps on the right.
 */
const meta = {
  title: "ui/PickerSheet",
  component: PickerSheet,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PickerSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  { id: "p1", label: "Garage cleanup", meta: "3 open", current: true },
  { id: "p2", label: "Kitchen shelves", meta: "1 open" },
  { id: "p3", label: "Tax paperwork", meta: "No due date" },
  { id: "p4", label: "Bike tune-up" },
];

export const Default: Story = {
  args: {
    title: "Move to project",
    items,
    onPick: () => {},
    onClose: () => {},
  },
};

export const Empty: Story = {
  args: {
    title: "Move to project",
    items: [],
    emptyMessage: "No projects yet — create one from the Projects page.",
    onPick: () => {},
    onClose: () => {},
  },
};

export const DarkMode: Story = {
  name: "Dark mode",
  decorators: [darkTheme],
  args: {
    title: "Move to project",
    items,
    onPick: () => {},
    onClose: () => {},
  },
};
