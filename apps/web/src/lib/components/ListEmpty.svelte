<script lang="ts">
  // ListEmpty — the calm empty-state shell (ListShell.tsx port).
  import type { Snippet } from "svelte";

  let {
    icon,
    title,
    text,
    action,
  }: {
    icon?: Snippet;
    title: string;
    text: string;
    action?: Snippet;
  } = $props();
</script>

<div class="aa-list-empty">
  {#if icon}<div class="aa-list-empty__icon">{@render icon()}</div>{/if}
  <h2 class="aa-list-empty__title">{title}</h2>
  <p class="aa-list-empty__text">{text}</p>
  {#if action}<div class="aa-list-empty__action">{@render action()}</div>{/if}
</div>

<style>
  .aa-list-empty {
    text-align: center;
    padding: 3.5rem 1rem;
    max-width: 34rem;
    margin: 0 auto;
  }
  .aa-list-empty__icon {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
    color: var(--aa-teal-soft-strong);
  }
  .aa-list-empty__title {
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-semibold);
    margin: 0 0 0.4rem;
    color: var(--aa-text);
  }
  .aa-list-empty__text {
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin: 0;
    line-height: var(--aa-leading-relaxed);
  }
  .aa-list-empty__action {
    margin-top: 1.25rem;
    display: flex;
    justify-content: center;
  }
</style>
