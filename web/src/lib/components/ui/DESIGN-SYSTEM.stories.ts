import type { Meta } from "@storybook/svelte";
import DesignSystemPage from "./galleries/DesignSystemPage.svelte";

/**
 * DESIGN-SYSTEM — the decided system (docs/DESIGN-SYSTEM.md): the
 * two-accent rule, the type scale, the neutral ramp, and the radii grid.
 * `src/lib/tokens.css` is the source of truth; every primitive in this book
 * consumes only these tokens.
 */
const meta = {
  title: "DESIGN-SYSTEM",
  component: DesignSystemPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DesignSystemPage>;


export default meta;

export const Overview = {
  name: "Overview",
  render: () => ({ Component: DesignSystemPage }),
};

export const DarkMode = {
  name: "Dark mode",
  render: () => {
    // The preview's global decorator re-writes [data-theme] from the toolbar
    // on every other story render, so forcing it here never leaks.
    document.documentElement.dataset.theme = "dark";
    return { Component: DesignSystemPage };
  },
};
