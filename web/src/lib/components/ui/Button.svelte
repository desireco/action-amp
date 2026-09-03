<script lang="ts">
  /**
   * Button — the primary interactive element. Ported from webapp ui/Button
   * (classes + Button.css verbatim, so it renders exactly like the legacy
   * app's). Variants: primary (teal CTA), secondary (surface + border),
   * ghost (text), danger (rose). Sizes: sm, md (default), lg.
   * Supports icon (leading by default, trailing with iconEnd), kbd hints,
   * and bare mode (no outer padding — for embedding in other components).
   */
  import "./Button.css";
  import type { Snippet } from "svelte";

  type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
  type ButtonSize = "sm" | "md" | "lg";

  let {
    variant = "primary",
    size = "md",
    children,
    icon,
    iconEnd = false,
    kbd,
    bare = false,
    type = "button",
    disabled = false,
    title,
    onclick,
    class: className = "",
  }: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children?: Snippet;
    icon?: Snippet;
    /** Place icon after the label instead of before. */
    iconEnd?: boolean;
    /** Monospace kbd hint rendered after the label. */
    kbd?: string;
    /** Render only the button content without outer padding. */
    bare?: boolean;
    type?: "button" | "submit";
    disabled?: boolean;
    title?: string;
    onclick?: (e: MouseEvent) => void;
    class?: string;
  } = $props();

  const VARIANT_MAP: Record<ButtonVariant, string> = {
    primary: "aa-btn--primary",
    secondary: "aa-btn--secondary",
    ghost: "aa-btn--ghost",
    danger: "aa-btn--danger",
  };
  const SIZE_MAP: Record<ButtonSize, string> = {
    sm: "aa-btn--sm",
    md: "",
    lg: "aa-btn--lg",
  };

  const cls = $derived(
    [
      bare ? "aa-btn--bare" : "aa-btn",
      bare ? "" : VARIANT_MAP[variant],
      bare ? "" : SIZE_MAP[size],
      className,
    ]
      .filter(Boolean)
      .join(" "),
  );
</script>

<button {type} class={cls} {disabled} {title} {onclick}>
  {#if icon && !iconEnd}<span class="aa-btn__icon">{@render icon()}</span>{/if}
  {#if children}<span class="aa-btn__label">{@render children()}</span>{/if}
  {#if kbd}<kbd class="aa-btn__kbd">{kbd}</kbd>{/if}
  {#if icon && iconEnd}<span class="aa-btn__icon">{@render icon()}</span>{/if}
</button>
