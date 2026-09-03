import type { Preview, Decorator } from "@storybook/svelte-vite";
import "../src/app.css";
import "../src/lib/tokens.css";

/**
 * The book renders on the real token set (tokens.css — byte-identical to the
 * legacy app's). Dark mode is keyed off `[data-theme="dark"]` on <html>,
 * exactly like the app's theme.ts applyTheme() — the toolbar toggle writes
 * the same attribute, so every story can be checked in both themes.
 */
const themeDecorator: Decorator = (Story, context) => {
  document.documentElement.dataset.theme = context.globals.theme ?? "light";
  return Story();
};

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "app-bg",
      values: [{ name: "app-bg", value: "var(--aa-bg)" }],
    },
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  globalTypes: {
    theme: {
      description: "App color theme ([data-theme] on <html>)",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: ["light", "dark"],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  decorators: [themeDecorator],
};

export default preview;
