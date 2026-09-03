import type { Meta, StoryObj } from "@storybook/svelte";
import Chip from "./Chip.svelte";
import ChipGallery from "./galleries/ChipGallery.svelte";
import { snap } from "./storybook";

/**
 * Chip — the one pill, tinted by meaning. Two-accent rule: teal = state,
 * amber = rare human emphasis; violet marks projects/goals, rose errors.
 * default + muted are neutral.
 */
const meta = {
  title: "ui/Chip",
  component: Chip,
  tags: ["autodocs"],
  parameters: { controls: { exclude: ["children"] } },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: snap("Today") },
};

export const Teal: Story = {
  args: { variant: "teal", children: snap("Due Fri") },
};

export const Amber: Story = {
  args: { variant: "amber", children: snap("Important") },
};

export const Violet: Story = {
  args: { variant: "violet", children: snap("Garage cleanup") },
};

export const Rose: Story = {
  args: { variant: "rose", children: snap("Overdue") },
};

export const Muted: Story = {
  args: { variant: "muted", children: snap("Someday") },
};

export const Small: Story = {
  args: { variant: "teal", small: true, children: snap("2m") },
};

export const Clickable: Story = {
  args: { variant: "violet", onclick: () => {}, children: snap("Open project") },
};

export const Removable: Story = {
  args: { variant: "default", removable: true, onRemove: () => {}, children: snap("tag") },
};

/** Every tone at both sizes. */
export const AllTones = {
  name: "All tones",
  render: () => ({ Component: ChipGallery }),
  parameters: { layout: "fullscreen" },
};
