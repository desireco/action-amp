import type { Meta, StoryObj } from "@storybook/svelte";
import Card from "./Card.svelte";
import CardGallery from "./galleries/CardGallery.svelte";
import { snap, darkTheme } from "./storybook";

/**
 * Card — surface card with optional elevation, interactivity, padding, and
 * header. One of four surfaces; hairline border, blue-tinted shadows.
 */
const meta = {
  title: "ui/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: { controls: { exclude: ["children", "header"] } },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: snap("The next thing that matters, framed on a quiet surface."),
  },
};

export const Elevated: Story = {
  args: {
    variant: "elevated",
    children: snap("Elevated — soft blue-tinted shadow, no border."),
  },
};

export const Interactive: Story = {
  args: {
    variant: "interactive",
    onclick: () => {},
    children: snap("Interactive — hover lifts 1px. Used for choosers."),
  },
};

export const Highlighted: Story = {
  args: {
    variant: "highlighted",
    children: snap("Highlighted — teal ring marks the active choice."),
  },
};

export const WithHeader: Story = {
  args: {
    header: snap("Today"),
    children: snap("A header renders with a hairline divider under it."),
  },
};

/** All variants + padding presets side by side. */
export const AllVariants = {
  name: "All variants",
  render: () => ({ Component: CardGallery }),
  parameters: { layout: "fullscreen" },
};

export const DarkMode: Story = {
  name: "Dark mode",
  decorators: [darkTheme],
  args: {
    variant: "elevated",
    children: snap("The same card under [data-theme=dark] — tokens re-tune, structure holds."),
  },
};
