import type { Meta, StoryObj } from "@storybook/svelte";
import CountLinkButton from "./CountLinkButton.svelte";
import { darkTheme } from "./storybook";

/**
 * CountLinkButton — quiet secondary navigation between list surfaces, with
 * the destination's open count. A secondary sm Button-shaped link; the count
 * is tabular and never guilt-trips (no color, no badge).
 */
const meta = {
  title: "ui/CountLinkButton",
  component: CountLinkButton,
  tags: ["autodocs"],
} satisfies Meta<typeof CountLinkButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCount: Story = {
  args: { label: "Upcoming", count: 7, to: "/do/upcoming" },
};

export const Singular: Story = {
  args: { label: "Today", count: 1, to: "/do/today" },
};

export const Zero: Story = {
  args: { label: "Someday", count: 0, to: "/do/someday" },
};

export const Loading: Story = {
  args: { label: "Logbook", to: "/do/logbook" },
};

export const DarkMode: Story = {
  name: "Dark mode",
  decorators: [darkTheme],
  args: { label: "Upcoming", count: 7, to: "/do/upcoming" },
};
