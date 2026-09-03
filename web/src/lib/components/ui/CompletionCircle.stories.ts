import type { Meta, StoryObj } from "@storybook/svelte";
import CompletionCircle from "./CompletionCircle.svelte";
import CompletionCircleGallery from "./galleries/CompletionCircleGallery.svelte";
import { darkTheme } from "./storybook";

/**
 * CompletionCircle — the signature completion circle: empty border → filled
 * teal + check. sm = 20px (lists), md = 32px (hero cards), lg = 44px
 * (empty states). Binary by design — there is no partial state; the work is
 * either open or done.
 */
const meta = {
  title: "ui/CompletionCircle",
  component: CompletionCircle,
  tags: ["autodocs"],
} satisfies Meta<typeof CompletionCircle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { size: "md" },
};

export const Filled: Story = {
  args: { size: "md", filled: true },
};

export const Disabled: Story = {
  args: { size: "md", disabled: true },
};

/** All sizes, empty → filled, plus burst/pulse hero states. */
export const AllStates = {
  name: "All states",
  render: () => ({ Component: CompletionCircleGallery }),
  parameters: { layout: "fullscreen" },
};

export const DarkMode: Story = {
  name: "Dark mode",
  decorators: [darkTheme],
  args: { size: "md", filled: true },
};
