import type { Meta, StoryObj } from "@storybook/svelte";
import ProGate from "./ProGate.svelte";
import { darkTheme } from "./storybook";

/**
 * ProGate — the shared paywall-moment surface. Calm, specific, honest —
 * not a hard error, not a red dot (PRODUCT.md bans urgency tricks). Two
 * shapes: the inline panel (default) and the at-cap trigger (asTrigger).
 */
const meta = {
  title: "ui/ProGate",
  component: ProGate,
  tags: ["autodocs"],
} satisfies Meta<typeof ProGate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Panel: Story = {
  args: {
    feature: "More than 3 projects",
    reason:
      "The free tier keeps everything that matters: capture, triage, focus. Projects beyond three are a Pro thing.",
  },
};

export const Trigger: Story = {
  args: {
    feature: "New project",
    reason: "At the 3-project cap",
    asTrigger: true,
  },
};

export const DarkMode: Story = {
  name: "Dark mode",
  parameters: { layout: "fullscreen" },
  decorators: [darkTheme],
  args: {
    feature: "More than 3 projects",
    reason:
      "The panel on the dark token set. The lock mark stays a quiet teal key-cap.",
  },
};
