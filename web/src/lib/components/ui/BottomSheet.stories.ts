import type { Meta, StoryObj } from "@storybook/svelte";
import BottomSheet from "./BottomSheet.svelte";
import { snap, darkTheme } from "./storybook";

/**
 * BottomSheet — mobile-first overlay anchored to the bottom edge (overlay
 * pattern #03). Esc / backdrop click dismiss. Used for action menus and the
 * "Not now" snooze flow.
 */
const meta = {
  title: "ui/BottomSheet",
  component: BottomSheet,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controls: { exclude: ["children"] },
  },
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Pick a time",
    onClose: () => {},
    children: snap("Sheet body content rides in the thumb zone — anchored to the bottom edge."),
  },
};

export const Untitled: Story = {
  args: {
    onClose: () => {},
    children: snap("No title — just the grabber and the body."),
  },
};

export const DarkMode: Story = {
  name: "Dark mode",
  decorators: [darkTheme],
  args: {
    title: "Pick a time",
    onClose: () => {},
    children: snap("The sheet surface + grabber re-tune from tokens in dark mode."),
  },
};
