<script lang="ts">
  // GroupedList — sections of rows with eyebrow headings + counts (the
  // webapp ui/GroupedList port, snippets instead of render props).
  import type { Snippet } from "svelte";

  interface GroupDef {
    key: string;
    label: string;
    items: unknown[];
  }

  let {
    groups,
    renderItem,
    keepEmptyGroups = false,
    headingLevel = 3,
    className = "",
    groupClass,
  }: {
    groups: GroupDef[];
    renderItem: Snippet<[unknown]>;
    keepEmptyGroups?: boolean;
    headingLevel?: 2 | 3;
    className?: string;
    groupClass?: (label: string) => string | undefined;
  } = $props();
</script>

<div class="aa-grouped {className}">
  {#each groups as group (group.key)}
    {#if group.items.length > 0 || keepEmptyGroups}
      <section
        class="aa-grouped__group {groupClass?.(group.label) ?? ""}"
      >
        {#if group.label !== ""}
          {#if headingLevel === 2}
            <h2 class="aa-grouped__heading">
              {group.label}{#if group.items.length > 0}<span
                  class="aa-grouped__count">{group.items.length}</span
                >{/if}
            </h2>
          {:else}
            <h3 class="aa-grouped__heading">
              {group.label}{#if group.items.length > 0}<span
                  class="aa-grouped__count">{group.items.length}</span
                >{/if}
            </h3>
          {/if}
        {/if}
        <ul class="aa-grouped__list">
          {#each group.items as item, i (i)}
            <li class="aa-grouped__item">{@render renderItem(item)}</li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}
</div>

<style>
  .aa-grouped {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .aa-grouped__heading {
    font-size: var(--aa-text-xs);
    font-weight: var(--aa-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin: 0 0 0.5rem;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .aa-grouped__count {
    color: var(--aa-teal-cta);
    font-weight: var(--aa-weight-semibold);
  }
  .aa-grouped__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .aa-grouped__item + .aa-grouped__item {
    border-top: 1px solid var(--aa-border, oklch(0.92 0.004 240));
  }
  .aa-grouped__group--overdue .aa-grouped__heading {
    color: var(--aa-rose-text);
  }
  .aa-grouped__group--overdue .aa-grouped__item + .aa-grouped__item {
    border-top-color: var(--aa-rose-soft);
  }
</style>
