<script lang="ts">
  // Chip — the one pill, tinted by meaning (two-accent system: teal=state,
  // amber=human emphasis). Ported from webapp ui/Chip; classes + Chip.css
  // verbatim so it renders exactly like the legacy app's.
  import "./Chip.css";
  import type { Snippet } from "svelte";

  let {
    variant = "default",
    small = false,
    removable = false,
    onRemove,
    onclick,
    children,
  }: {
    variant?: "default" | "amber" | "violet" | "rose" | "teal" | "muted";
    small?: boolean;
    /** Removable — shows the × button; fires onRemove (not onclick). */
    removable?: boolean;
    onRemove?: () => void;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span
  class="aa-chip aa-chip--{variant} {small ? "aa-chip--sm" : ""} {onclick
    ? "aa-chip--clickable"
    : ""}"
  role={onclick ? "button" : undefined}
  tabindex={onclick ? 0 : undefined}
  onclick={onclick}
>
  {@render children()}
  {#if removable}
    <button
      type="button"
      class="aa-chip__remove"
      aria-label="Remove"
      onclick={(e) => {
        e.stopPropagation();
        onRemove?.();
      }}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    </button>
  {/if}
</span>
