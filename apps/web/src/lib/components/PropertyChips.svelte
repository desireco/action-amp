<script lang="ts">
  // PropertyChips — the app's one property editor (webapp ui/PropertyChips
  // port). Each chip IS the editor: click → popover/picker; pick → onPick.
  // Unset fields render a quiet "+ Label" dashed chip. `readOnly` (done
  // tasks) renders static pills.
  import type { PropertyField } from "../taskView";
  import PickerSheet from "./PickerSheet.svelte";

  let {
    fields,
    readOnly = false,
    onPick,
    onPickerPick,
    onOpenChange,
  }: {
    fields: PropertyField[];
    readOnly?: boolean;
    onPick?: (fieldKey: string, value: string) => void;
    onPickerPick?: (fieldKey: string, value: string | null) => void;
    onOpenChange?: (open: boolean) => void;
  } = $props();

  let openKey = $state<string | null>(null);
  let sheetKey = $state<string | null>(null);
  let rowEl = $state<HTMLDivElement | null>(null);

  const anyOpen = $derived(openKey !== null || sheetKey !== null);
  $effect(() => {
    onOpenChange?.(anyOpen);
  });

  $effect(() => {
    if (!openKey || readOnly) return;
    const onPointer = (e: PointerEvent) => {
      if (rowEl && !rowEl.contains(e.target as Node)) openKey = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") openKey = null;
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  });

  function toggle(key: string) {
    openKey = openKey === key ? null : key;
  }

  function pick(field: PropertyField, value: string) {
    onPick?.(field.key, value);
    openKey = null;
  }

  function chipLabel(field: PropertyField): string {
    return field.unset ? `+ ${field.addLabel ?? field.displayValue}` : field.displayValue;
  }
</script>

{#if readOnly}
  <div class="aa-prop-chips aa-prop-chips--static" bind:this={rowEl}>
    {#each fields as f (f.key)}
      <span class="aa-prop-chip aa-prop-chip--{f.variant} aa-prop-chip--static">{f.displayValue}</span>
    {/each}
  </div>
{:else}
  <div class="aa-prop-chips" bind:this={rowEl}>
    {#each fields as f (f.key)}
      <span class="aa-prop-chip-slot">
        <button
          type="button"
          class="aa-prop-chip aa-prop-chip--{f.variant} {f.unset ? "aa-prop-chip--add" : ""} {openKey === f.key || sheetKey === f.key
            ? "is-open"
            : ""}"
          aria-expanded={openKey === f.key || sheetKey === f.key}
          aria-label="{f.key}: {chipLabel(f)}"
          onclick={(e) => {
            e.stopPropagation();
            if (f.picker) sheetKey = f.key;
            else toggle(f.key);
          }}
        >
          {chipLabel(f)}
          {#if !f.unset}<span class="aa-prop-chip-chev" aria-hidden="true">▾</span>{/if}
        </button>
        {#if openKey === f.key}
          <div class="aa-prop-chip-popover" onclick={(e) => e.stopPropagation()} role="presentation">
            <div class="aa-prop-chip-popover__title">
              {f.unset ? (f.addLabel ?? f.displayValue) : f.displayValue}
            </div>
            {#each f.options ?? [] as opt (opt.value)}
              <button
                type="button"
                class="aa-prop-chip-opt {f.value === opt.value ? "active" : ""}"
                onclick={() => pick(f, opt.value)}
              >
                <span>
                  {opt.label}
                  {#if opt.hint}<span class="aa-prop-chip-opt-hint">{opt.hint}</span>{/if}
                </span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            {/each}
          </div>
        {/if}
      </span>
    {/each}
  </div>

  {#each fields.filter((f) => f.picker && sheetKey === f.key) as f (f.key)}
    <PickerSheet
      title={f.picker!.title}
      items={[
        ...(f.picker!.allowNone
          ? [{ id: "__none__", label: f.picker!.noneLabel ?? "None", current: !f.value }]
          : []),
        ...f.picker!.items.map((item) => ({
          id: item.id,
          label: item.label,
          meta: item.meta,
          current: f.value === item.id,
        })),
      ]}
      onPick={(id) => {
        const none = f.picker!.allowNone && id === "__none__" ? null : id;
        onPickerPick?.(f.key, none);
        sheetKey = null;
      }}
      onClose={() => (sheetKey = null)}
    />
  {/each}
{/if}

<style>
  .aa-prop-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
  }
  .aa-prop-chip-slot {
    position: relative;
  }
  .aa-prop-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border-radius: 999px;
    padding: 0.14rem 0.6rem;
    font-size: var(--aa-text-sm);
    cursor: pointer;
    border: 1px solid transparent;
    background: var(--aa-surface-muted, oklch(0.96 0.005 240));
    color: var(--aa-text);
  }
  .aa-prop-chip--when {
    background: var(--aa-teal-soft);
    color: var(--aa-teal-cta);
  }
  .aa-prop-chip--important {
    background: var(--aa-amber-soft);
    color: var(--aa-amber-text);
  }
  .aa-prop-chip--normal {
    background: var(--aa-surface-muted, oklch(0.96 0.005 240));
  }
  .aa-prop-chip--size {
    border-color: var(--aa-border, oklch(0.9 0.005 240));
    background: transparent;
  }
  .aa-prop-chip--project {
    background: var(--aa-violet-soft);
    color: var(--aa-violet-text);
  }
  .aa-prop-chip--goal {
    background: var(--aa-violet-soft);
    color: var(--aa-violet-text);
  }
  .aa-prop-chip--due {
    background: var(--aa-teal-soft);
    color: var(--aa-teal-cta);
  }
  .aa-prop-chip--add {
    border-style: dashed;
    border-color: var(--aa-border-strong, oklch(0.85 0.006 240));
    background: transparent;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-prop-chip.is-open {
    outline: 2px solid var(--aa-teal);
    outline-offset: 1px;
  }
  .aa-prop-chip--static {
    cursor: default;
  }
  .aa-prop-chip-chev {
    font-size: 0.6rem;
    opacity: 0.7;
  }
  .aa-prop-chip-popover {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 12rem;
    background: var(--aa-surface, white);
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    border-radius: 10px;
    box-shadow: 0 10px 30px oklch(0.2 0.01 240 / 0.18);
    padding: 0.35rem;
    z-index: 40;
  }
  .aa-prop-chip-popover__title {
    font-size: var(--aa-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    padding: 0.25rem 0.45rem;
  }
  .aa-prop-chip-opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    background: none;
    border: none;
    padding: 0.4rem 0.45rem;
    font-size: var(--aa-text-sm);
    color: var(--aa-text);
    cursor: pointer;
    border-radius: 7px;
    text-align: left;
  }
  .aa-prop-chip-opt:hover {
    background: var(--aa-surface-muted, oklch(0.97 0.004 240));
  }
  .aa-prop-chip-opt.active {
    color: var(--aa-teal-cta);
  }
  .aa-prop-chip-opt.active svg {
    display: block;
  }
  .aa-prop-chip-opt svg {
    display: none;
  }
  .aa-prop-chip-opt-hint {
    display: block;
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
</style>
