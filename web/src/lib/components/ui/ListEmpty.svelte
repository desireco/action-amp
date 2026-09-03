<script lang="ts">
  // ListEmpty — the calm empty-state shell (webapp lists/ListShell.tsx
  // port). Styles live in ListEmpty.css (the `.aa-list-empty` block,
  // ported verbatim) so it renders exactly like the legacy app's.
  import "./ListEmpty.css";
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
