import type { Meta, StoryObj } from "@storybook/svelte";
import { createRawSnippet } from "svelte";
import ListEmpty from "./ListEmpty.svelte";
import ListEmptyGallery from "./galleries/ListEmptyGallery.svelte";
import { snap, darkTheme } from "./storybook";

/**
 * ListEmpty — the calm empty-state shell. A teal-tinted icon tile, one
 * sentence of title, one line of text, at most one action. Never a red dot,
 * never a guilt trip.
 */
const meta = {
  title: "ui/ListEmpty",
  component: ListEmpty,
  tags: ["autodocs"],
} satisfies Meta<typeof ListEmpty>;

export default meta;
type Story = StoryObj<typeof meta>;

const icon = createRawSnippet(() => ({
  render: () =>
    `<svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
}));

export const Default: Story = {
  args: {
    icon,
    title: "Nothing overdue",
    text: "Everything due has been handled. The next thing that matters is in Today.",
  },
};

export const WithAction: Story = {
  args: {
    icon,
    title: "Inbox zero",
    text: "Captured items all found a home. Capture something new any time.",
    action: snap('<a class="aa-linkify" href="#">Open Today</a>'),
  },
};

export const WithoutIcon: Story = {
  args: {
    title: "No results",
    text: "Nothing matches that search. Try a different word.",
  },
};

/** Full-width shell with an action Button, as lists embed it. */
export const AsEmbedded = {
  name: "As embedded",
  render: () => ({ Component: ListEmptyGallery }),
  parameters: { layout: "fullscreen" },
};

export const DarkMode: Story = {
  name: "Dark mode",
  decorators: [darkTheme],
  args: {
    icon,
    title: "Nothing overdue",
    text: "The surface tile + icon tint re-tune from tokens in dark mode.",
  },
};
