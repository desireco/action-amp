import { createRawSnippet } from "svelte";
import type { Decorator } from "@storybook/svelte";

/**
 * Helpers for the design-system book (CSF3 + Svelte 5). Not part of the
 * app bundle — consumed only by *.stories.ts.
 */

/** Make a children snippet from a plain string (for CSF3 props). */
export function snap(text: string) {
  return createRawSnippet(() => ({
    render: () => text,
  }));
}

/**
 * Story decorator: force this story under [data-theme="dark"] so a single
 * story can show the dark rendering. The preview's global decorator re-writes
 * data-theme from the toolbar on every other story render, so this never
 * leaks across stories.
 */
export const darkTheme: Decorator = (Story) => {
  document.documentElement.dataset.theme = "dark";
  return Story();
};
