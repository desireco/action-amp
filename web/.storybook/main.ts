import type { StorybookConfig } from "@storybook/sveltekit";

/**
 * Storybook — the design-system book for the new stack. One story file per
 * primitive in src/lib/components/ui/ (the consolidated port of the legacy
 * app's webapp/src/components/ui/ organization). The sveltekit framework is
 * required here (the svelte-vite one refuses SvelteKit projects); the book
 * itself only exercises token-driven primitives, not $app modules.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|svelte)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/sveltekit",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  staticDirs: [],
};

export default config;
