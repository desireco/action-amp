<script lang="ts" module>
  // LensSwitcher — the compact Lens switcher (chip + popover). Ported from
  // webapp/src/components/ui/LensPopover.tsx (LensChip + LensPopover).
  //
  // The chip renders the active lens (color dot + name + ⌘L hint); the popover
  // lists every lens with its purpose, a Pro chip on locked options, an inline
  // filter ("/"), and a "+ New lens…" row that opens the Settings Lenses tab.
  //
  // Keyboard (INTERACTION.md popover conventions):
  //   ↑↓  move the highlight
  //   ↵   select the highlighted lens
  //   /   focus the inline filter
  //   esc close
  //
  // A `proLocked` option still renders its chip; selecting it calls onSelect
  // and the store's switch() runs the FREE gate (the ProGate renders where the
  // shell mounts it — see docs/plans/slices/s7-s11-wiring.md).
  import "../styles/lens-switcher.css";

  export interface LensSwitchOption {
    id: string;
    label: string;
    color?: string | null;
    /** One short line: what this lens is for. */
    purpose?: string | null;
    /** FREE user + non-included lens: renders a neutral Pro chip. */
    proLocked?: boolean;
  }
</script>

<script lang="ts">
  let {
    options,
    active,
    onSelect,
    onClose,
    onNewLens,
    newLensProLocked = false,
    ariaLabel = "Lens",
    // Bindable so the shell's ⌘L chord can toggle the popover (webapp
    // AppShell parity — lensPopoverOpen lives in the shell there). Unbound
    // callers keep the old fully-internal behavior.
    open = $bindable(false),
  }: {
    options: LensSwitchOption[];
    /** id of the currently-active lens */
    active: string;
    /** Called when a lens is selected (the store decides FREE gating) */
    onSelect: (id: string) => void;
    /** Called when the popover should close (esc / outside-click / select) */
    onClose: () => void;
    /** "+ New lens…" affordance; omitted = don't render the row */
    onNewLens?: () => void;
    /** Whether the "+ New lens" row should show a Pro tag (FREE user) */
    newLensProLocked?: boolean;
    ariaLabel?: string;
    /** Two-way bound open state (⌘L toggles from the shell). */
    open?: boolean;
  } = $props();

  let highlight = $state(0);
  let filter = $state("");
  let filterOpen = $state(false);
  let listEl: HTMLDivElement | undefined = $state();
  let filterEl: HTMLInputElement | undefined = $state();

  const activeOpt = $derived(options.find((o) => o.id === active));
  const filtered = $derived(
    filter
      ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
      : options,
  );

  // Opening the popover moves keyboard focus into its list so Arrow keys and
  // Enter immediately operate on lens options, and starts on the active lens.
  $effect(() => {
    if (open) {
      highlight = Math.max(0, options.findIndex((o) => o.id === active));
      queueMicrotask(() => listEl?.focus());
    }
  });

  // Clamp the highlight when the filter shrinks the list.
  $effect(() => {
    highlight = Math.min(highlight, Math.max(0, filtered.length - 1));
  });

  function choose(idx: number) {
    const opt = filtered[idx];
    if (!opt) return;
    onSelect(opt.id);
    close();
  }

  function close() {
    open = false;
    filter = "";
    filterOpen = false;
    onClose();
  }

  function onListKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlight = Math.min(highlight + 1, filtered.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlight = Math.max(highlight - 1, 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(highlight);
    } else if (event.key === "/") {
      event.preventDefault();
      filterOpen = true;
      queueMicrotask(() => filterEl?.focus());
    }
  }
</script>

<div class="aa-lens-switcher">
  <button
    type="button"
    class="aa-lens-chip {open ? "is-open" : ""}"
    data-lens-color={activeOpt?.color || undefined}
    onclick={() => (open ? close() : (open = true))}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={`${ariaLabel}: ${activeOpt?.label ?? ""}`}
  >
    <span class="aa-lens-chip__dot" aria-hidden="true"></span>
    <span class="aa-lens-chip__name">{activeOpt?.label ?? ""}</span>
    <kbd class="aa-lens-chip__kbd">⌘L</kbd>
    <span class="aa-lens-chip__caret" aria-hidden="true">▾</span>
  </button>

  {#if open}
    <div class="aa-lens-popover">
      <!-- Backdrop: clicks outside the popover close it (transparent, so the
          page stays visible; the panel sits above via z-index). -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="aa-lens-popover__backdrop" onclick={close}></div>
      <div class="aa-lens-popover__panel" role="dialog" aria-label={`Switch ${ariaLabel}`}>
        <div class="aa-lens-popover__head">
          <span>Switch lens</span>
          <kbd class="aa-lens-popover__kbd">⌘L</kbd>
        </div>
        {#if filterOpen || filter}
          <div class="aa-lens-popover__filter">
            <input
              bind:this={filterEl}
              bind:value={filter}
              type="text"
              placeholder="Filter lenses…"
              aria-label="Filter lenses"
              onblur={() => {
                if (!filter) filterOpen = false;
              }}
              onkeydown={(e) => {
                if (e.key === "Escape") {
                  filter = "";
                  filterOpen = false;
                  filterEl?.blur();
                }
              }}
            />
          </div>
        {/if}
        <div
          bind:this={listEl}
          class="aa-lens-popover__list"
          role="listbox"
          aria-label="Lenses"
          tabindex="0"
          onkeydown={onListKeydown}
        >
          {#if filtered.length === 0}
            <div class="aa-lens-popover__empty">No lenses match.</div>
          {/if}
          {#each filtered as opt, i (opt.id)}
            <button
              type="button"
              role="option"
              aria-selected={opt.id === active}
              data-lens-color={opt.color || undefined}
              class="aa-lens-popover__opt {opt.id === active ? "is-active" : ""} {i === highlight ? "is-highlight" : ""}"
              onmouseenter={() => (highlight = i)}
              onclick={() => choose(i)}
            >
              <span class="aa-lens-popover__dot" aria-hidden="true"></span>
              <span class="aa-lens-popover__main">
                <span class="aa-lens-popover__name">{opt.label}</span>
                {#if opt.purpose}
                  <span class="aa-lens-popover__purpose">{opt.purpose}</span>
                {/if}
              </span>
              {#if opt.proLocked}
                <span class="aa-lens-popover__pro" title="Pro feature">Pro</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if onNewLens}
          <button
            type="button"
            class="aa-lens-popover__add"
            onclick={() => {
              onNewLens();
              close();
            }}
          >
            <span class="aa-lens-popover__plus" aria-hidden="true">+</span>
            <span>New lens…</span>
            {#if newLensProLocked}
              <span class="aa-lens-popover__pro-tag">Pro</span>
            {/if}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* The popover anchors below the chip (lens-switcher.css positions it
     absolutely against this wrapper). */
  .aa-lens-switcher {
    position: relative;
    width: 100%;
  }
</style>
