<script lang="ts">
  // PickerSheet — shared bottom-sheet list for choosing one Project, Goal,
  // or similar destination (webapp ui/PickerSheet port). Classes + Picker-
  // Sheet.css verbatim; the sheet shell is the shared BottomSheet.
  import BottomSheet from "./BottomSheet.svelte";
  import "./PickerSheet.css";

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
      {#each items as item (item.id)}
        <li>
          <button
            type="button"
            class="aa-picker-sheet__item {item.current ? "current" : ""}"
            onclick={() => onPick(item.id)}
          >
            <span class="aa-picker-sheet__name">{item.label}</span>
            {#if item.meta}<span class="aa-picker-sheet__meta">{item.meta}</span>{/if}
            <span class="aa-picker-sheet__num">{items.indexOf(item) + 1}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</BottomSheet>
