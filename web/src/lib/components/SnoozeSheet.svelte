<script lang="ts">
  // SnoozeSheet — the "Not now" flow: 5 presets; the parent runs the
  // mutation and closes (webapp ui/SnoozeSheet port).
  import BottomSheet from "./ui/BottomSheet.svelte";
  import Chip from "./ui/Chip.svelte";
  import type { SnoozePreset } from "../dto";

  const PRESETS: { preset: SnoozePreset; label: string; hint: string }[] = [
    { preset: "1h", label: "In 1 hour", hint: "quick breather" },
    { preset: "3h", label: "In 3 hours", hint: "later today" },
    { preset: "tomorrow", label: "Tomorrow", hint: "9am tomorrow" },
    { preset: "weekend", label: "This weekend", hint: "Saturday" },
    { preset: "someday", label: "Someday", hint: "no date, stop nagging" },
  ];

  let {
    taskTitle,
    onSnooze,
    onClose,
  }: {
    taskTitle: string;
    onSnooze: (preset: SnoozePreset) => Promise<void> | void;
    onClose: () => void;
  } = $props();

  let busy = $state<SnoozePreset | null>(null);

  async function handle(preset: SnoozePreset) {
    if (busy) return;
    busy = preset;
    try {
      await onSnooze(preset);
      onClose();
    } catch {
      busy = null;
    }
  }
</script>

<BottomSheet title="Not now" {onClose}>
  <p class="aa-snooze__task">
    <Chip variant="default" small>{taskTitle}</Chip>
  </p>
  <ul class="aa-snooze__list">
    {#each PRESETS as p (p.preset)}
      <li>
        <button
          type="button"
          class="aa-snooze__option"
          disabled={busy !== null}
          onclick={() => handle(p.preset)}
        >
          <span class="aa-snooze__option-label">{p.label}</span>
          <span class="aa-snooze__option-hint">{p.hint}</span>
        </button>
      </li>
    {/each}
  </ul>
</BottomSheet>

<style>
  .aa-snooze__task {
    margin: 0 0 0.75rem;
  }
  .aa-snooze__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .aa-snooze__option {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    background: none;
    border: none;
    padding: 0.7rem 0.35rem;
    font-size: var(--aa-text-md);
    color: var(--aa-text);
    cursor: pointer;
    border-radius: 8px;
  }
  .aa-snooze__option:hover:not(:disabled) {
    background: var(--aa-surface-muted, oklch(0.97 0.004 240));
  }
  .aa-snooze__option:disabled {
    opacity: 0.55;
  }
  .aa-snooze__option-label {
    font-weight: var(--aa-weight-medium);
  }
  .aa-snooze__option-hint {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
</style>
