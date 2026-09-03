import type { Meta, StoryObj } from "@storybook/svelte";
import ConfirmDialog from "./ConfirmDialog.svelte";
import { snap, darkTheme } from "./storybook";

/**
 * ConfirmDialog — the small centered confirmation overlay (pattern #04).
 * For destructive or irreversible actions, rarely. Backdrop click dismisses;
 * actions are real Button primitives (secondary + primary/danger).
 */
const meta = {
  title: "ui/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controls: { exclude: ["message"] },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Delete this task?",
    message: snap("“Water the plants” will move to the logbook as deleted. This can't be undone."),
    onConfirm: () => {},
    onClose: () => {},
  },
};

export const Danger: Story = {
  args: {
    title: "Delete lens “Work”?",
    message: snap("28 tasks return to No lens. The tasks themselves are not deleted."),
    danger: true,
    confirmLabel: "Delete lens",
    onConfirm: () => {},
    onClose: () => {},
  },
};

export const CustomLabels: Story = {
  args: {
    title: "Sign out?",
    message: snap("You'll need to log in again to see your tasks."),
    confirmLabel: "Sign out",
    cancelLabel: "Stay",
    onConfirm: () => {},
    onClose: () => {},
  },
};

export const ConfirmDisabled: Story = {
  args: {
    title: "Type to confirm",
    message: snap("The confirm action stays disabled until the requirement is met."),
    confirmDisabled: true,
    onConfirm: () => {},
    onClose: () => {},
  },
};

export const DarkMode: Story = {
  name: "Dark mode",
  decorators: [darkTheme],
  args: {
    title: "Delete this task?",
    message: snap("The overlay shell + buttons re-tune from tokens in dark mode."),
    onConfirm: () => {},
    onClose: () => {},
  },
};
