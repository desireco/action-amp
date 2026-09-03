<script lang="ts">
  // PropertyChips — the app's one property editor (webapp ui/PropertyChips
  // port). Each chip IS the editor: click → popover/picker; pick → onPick.
  // Unset fields render a quiet "+ Label" dashed chip. `readOnly` (done
  // tasks) renders static pills. Classes + PropertyChips.css verbatim with
  // the legacy app's — no hand-rolled styles.
  import type { PropertyField } from "../../taskView";
  import PickerSheet from "./PickerSheet.svelte";
  import "./PropertyChips.css";

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
          {#if !f.unset}
            <svg
              class="aa-prop-chip-chev"
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          {/if}
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
                <svg
                  class="aa-prop-chip-check"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
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
