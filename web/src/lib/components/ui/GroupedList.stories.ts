import type { Meta, StoryObj } from "@storybook/svelte";
import { createRawSnippet } from "svelte";
import GroupedList from "./GroupedList.svelte";
import GroupedListGallery from "./galleries/GroupedListGallery.svelte";
import { darkTheme } from "./storybook";

/**
 * GroupedList — sections of rows with eyebrow headings + counts. Shared
 * layout for Today (by Goal), Upcoming (by date), Projects, Logbook. An
 * empty-string label renders rows without a heading.
 */
const meta = {
  title: "ui/GroupedList",
  component: GroupedList,
  tags: ["autodocs"],
  parameters: { controls: { exclude: ["renderItem"] } },
} satisfies Meta<typeof GroupedList>;

export default meta;
type Story = StoryObj<typeof meta>;

const row = createRawSnippet<[unknown]>((item) => ({
  render: () =>
    `<div style="padding:8px 0;font-size:var(--aa-text-base);color:var(--aa-text)">${item}</div>`,
}));

export const Default: Story = {
  args: {
    groups: [
      { key: "overdue", label: "Overdue", items: ["Renew parking permit", "Pay water bill"] },
      { key: "today", label: "Today", items: ["Water the plants", "Call the bank"] },
      { key: "later", label: "Later this week", items: ["Book dentist"] },
    ],
    renderItem: row,
  },
};

export const SingleUnnamedGroup: Story = {
  args: {
    groups: [
      { key: "all", label: "", items: ["Water the plants", "Call the bank", "Book dentist"] },
    ],
    renderItem: row,
  },
};

export const WithOverdueTint: Story = {
  args: {
    groups: [
      { key: "overdue", label: "Overdue", items: ["Renew parking permit"] },
      { key: "today", label: "Today", items: ["Water the plants"] },
    ],
    renderItem: row,
    groupClass: (label: string) =>
      label === "Overdue" ? "aa-grouped__group--overdue" : undefined,
  },
};

export const DarkMode: Story = {
  name: "Dark mode",
  decorators: [darkTheme],
  args: {
    groups: [
      { key: "today", label: "Today", items: ["Water the plants", "Call the bank"] },
      { key: "done", label: "Done today", items: ["Book dentist"] },
    ],
    renderItem: row,
  },
};

/** With real row components + an empty group kept visible. */
export const WithTaskRows = {
  name: "With task rows",
  render: () => ({ Component: GroupedListGallery }),
  parameters: { layout: "fullscreen" },
};
