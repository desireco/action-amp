<script lang="ts">
  // PickerSheet — shared bottom-sheet list for choosing one Project, Goal,
  // or similar destination (webapp ui/PickerSheet port).
  import BottomSheet from "./BottomSheet.svelte";

  interface PickerItem {
    id: string;
    label: string;
    meta?: string | null;
    current?: boolean;
  }

  let {
    title,
    items,
    emptyMessage,
    onPick,
    onClose,
  }: {
    title: string;
    items: PickerItem[];
    emptyMessage?: string;
    onPick: (id: string) => void;
    onClose: () => void;
  } = $props();
</script>

<BottomSheet {title} {onClose}>
  {#if items.length === 0 && emptyMessage}
    <p class="aa-picker-sheet__empty">{emptyMessage}</p>
  {:else}
    <ul class="aa-picker-sheet__list">
      {#each items as item, index (item.id)}
        <li>
          <button
            type="button"
            class="aa-picker-sheet__item {item.current ? "current" : ""}"
            onclick={() => onPick(item.id)}
          >
            <span class="aa-picker-sheet__name">{item.label}</span>
            {#if item.meta}<span class="aa-picker-sheet__meta">{item.meta}</span>{/if}
            <span class="aa-picker-sheet__num">{index + 1}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</BottomSheet>

<style>
  .aa-picker-sheet__empty {
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    text-align: center;
    padding: 1rem 0;
  }
  .aa-picker-sheet__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .aa-picker-sheet__item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0.65rem 0.35rem;
    font-size: var(--aa-text-md);
    color: var(--aa-text);
    cursor: pointer;
    border-radius: 8px;
  }
  .aa-picker-sheet__item:hover {
    background: var(--aa-surface-muted, oklch(0.97 0.004 240));
  }
  .aa-picker-sheet__item.current .aa-picker-sheet__name {
    color: var(--aa-teal-cta);
    font-weight: var(--aa-weight-semibold);
  }
  .aa-picker-sheet__name {
    flex: 1;
  }
  .aa-picker-sheet__meta {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-picker-sheet__num {
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    border-radius: 6px;
    padding: 0 0.35rem;
  }
</style>
