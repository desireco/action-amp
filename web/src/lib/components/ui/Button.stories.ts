import type { Meta, StoryObj } from "@storybook/svelte";
import Button from "./Button.svelte";
import ButtonGallery from "./galleries/ButtonGallery.svelte";
import { snap } from "./storybook";

/**
 * Button — the primary interactive element (webapp ui/Button port).
 * Variants: primary (teal CTA), secondary (surface + border), ghost (text),
 * danger (rose). Teal is the only CTA color — the two-accent rule puts
 * danger in rose, never alarm tones.
 */
const meta = {
  title: "ui/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: { controls: { exclude: ["children", "icon"] } },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary", children: snap("Start this") },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: snap("Later") },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: snap("Snooze") },
};

export const Danger: Story = {
  args: { variant: "danger", children: snap("Delete lens") },
};

export const Small: Story = {
  args: { variant: "secondary", size: "sm", children: snap("Snooze 1h") },
};

export const Large: Story = {
  args: { variant: "primary", size: "lg", children: snap("Start this") },
};

export const WithKbdHint: Story = {
  args: { variant: "secondary", kbd: "⌘K", children: snap("Capture") },
};

export const Disabled: Story = {
  args: { variant: "primary", disabled: true, children: snap("Nothing due") },
};

export const Bare: Story = {
  args: { bare: true, children: snap("Bare — embeds inside other components") },
};

/** Every variant × size, plus icon/kbd/disabled/bare states. */
export const AllVariants = {
  render: () => ({ Component: ButtonGallery }),
  parameters: { layout: "fullscreen" },
};
