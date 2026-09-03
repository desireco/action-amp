<script lang="ts">
  /**
   * Card — surface card with optional elevation, interactivity, padding, and
   * header. Ported from webapp ui/Card (classes + Card.css verbatim).
   */
  import "./Card.css";
  import type { Snippet } from "svelte";

  type CardVariant = "default" | "elevated" | "interactive" | "highlighted";
  type CardPadding = "none" | "sm" | "md" | "lg";

  let {
    variant = "default",
    padding = "md",
    header,
    children,
    onclick,
    class: className = "",
  }: {
    variant?: CardVariant;
    /** Built-in padding sizes, or "none" for no padding. */
    padding?: CardPadding;
    /** Optional header element (renders with a hairline divider). */
    header?: Snippet;
    children?: Snippet;
    onclick?: (e: MouseEvent) => void;
    class?: string;
  } = $props();

  const VARIANT_CLASS: Record<CardVariant, string> = {
    default: "",
    elevated: "aa-card--elevated",
    interactive: "aa-card--interactive",
    highlighted: "aa-card--highlighted",
  };
  const PADDING_CLASS: Record<CardPadding, string> = {
    none: "aa-card--pad-none",
    sm: "aa-card--pad-sm",
    md: "aa-card--pad-md",
    lg: "aa-card--pad-lg",
  };

  const cls = $derived(
    ["aa-card", VARIANT_CLASS[variant], PADDING_CLASS[padding], className]
      .filter(Boolean)
      .join(" "),
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class={cls} {onclick}>
  {#if header}<div class="aa-card__header">{@render header()}</div>{/if}
  {@render children?.()}
</div>
