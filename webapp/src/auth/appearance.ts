import type { CustomizationOptions } from "wasp/client/auth";

/**
 * Maps Wasp's auth-form color tokens onto the ActionAmp palette.
 *
 * Wasp turns each key into a CSS variable (--color-<key>), so we can pass
 * our own token references and keep a single source of truth. The few
 * hardcoded values in the forms (e.g. the input background) are overridden
 * in ./auth.css.
 */
export const aaAuthAppearance: CustomizationOptions = {
  appearance: {
    colors: {
      // Primary button — teal CTA, white label
      brand: "var(--aa-teal-cta)",
      brandAccent: "var(--aa-teal-cta-hover)",
      submitButtonText: "var(--aa-surface)",

      // Neutral controls — input border + focus ring + disabled states
      gray600: "var(--aa-border-strong)", // input border
      gray700: "var(--aa-teal)", // input focus border
      gray400: "var(--aa-surface-muted-2)", // disabled bg
      gray500: "var(--aa-text-4)", // disabled text

      // Errors — rose
      errorBackground: "var(--aa-rose-soft)",
      errorText: "var(--aa-rose-text)",
      formErrorText: "var(--aa-rose)",

      // Success — teal
      successBackground: "var(--aa-teal-soft)",
      successText: "var(--aa-teal-cta)",
    },
    fontSizes: {
      sm: "0.95rem",
    },
  },
};
