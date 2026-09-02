<script lang="ts">
  // Chip — the one pill, tinted by meaning (two-accent system: teal=state,
  // amber=human emphasis). Ported from webapp ui/Chip.
  import type { Snippet } from "svelte";

  let {
    variant = "default",
    small = false,
    children,
  }: {
    variant?: "default" | "amber" | "violet" | "rose" | "teal" | "muted";
    small?: boolean;
    children: Snippet;
  } = $props();
</script>

<span class="aa-chip aa-chip--{variant} {small ? "aa-chip--sm" : ""}">{@render children()}</span>

<style>
  .aa-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border-radius: 999px;
    padding: 0.1rem 0.55rem;
    font-size: var(--aa-text-sm);
    line-height: var(--aa-leading-snug);
    background: var(--aa-surface-muted, oklch(0.96 0.005 240));
    color: var(--aa-text);
    white-space: nowrap;
  }
  .aa-chip--sm {
    font-size: var(--aa-text-xs);
    padding: 0.05rem 0.45rem;
  }
  .aa-chip--amber {
    background: var(--aa-amber-soft);
    color: var(--aa-amber-text);
  }
  .aa-chip--violet {
    background: var(--aa-violet-soft);
    color: var(--aa-violet-text);
  }
  .aa-chip--rose {
    background: var(--aa-rose-soft);
    color: var(--aa-rose-text);
  }
  .aa-chip--teal {
    background: var(--aa-teal-soft);
    color: var(--aa-teal-cta);
  }
  .aa-chip--muted {
    background: transparent;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
  }
</style>
