import type { Meta, StoryObj } from "@storybook/svelte";
import Icon from "./Icon.svelte";
import IconGallery from "./galleries/IconGallery.svelte";

/**
 * Icon — the small stroke-icon set (1.5 stroke, 16×16 grid), ported from
 * webapp ui/icons. Sized in px here; `size` scales with its label in-app.
 */
const meta = {
  title: "ui/Icon",
  component: Icon,
  tags: ["autodocs"],
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every icon in the set at its in-app size. */
export const Gallery = {
  name: "Gallery",
  render: () => ({ Component: IconGallery }),
  parameters: { layout: "fullscreen" },
};

export const Star: Story = {
  args: { name: "star", size: 16 },
};

export const Inbox: Story = {
  args: { name: "box", size: 16 },
};

export const Calendar: Story = {
  args: { name: "calendar", size: 16 },
};

export const Trash: Story = {
  args: { name: "trash", size: 16 },
};
