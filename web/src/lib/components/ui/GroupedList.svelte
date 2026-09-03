<script lang="ts">
  // GroupedList — sections of rows with eyebrow headings + counts (the
  // webapp ui/GroupedList port, snippets instead of render props). Classes
  // + GroupedList.css verbatim with the legacy app's. A group with an
  // empty-string label renders its rows without a heading.
  import "./GroupedList.css";
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
    /** 2 when the list is a top-level section peer; nested lists keep 3. */
    headingLevel?: 2 | 3;
    className?: string;
    /** Per-group class — mark a specific group (e.g. tint "Overdue"). */
    groupClass?: (label: string) => string | undefined;
  } = $props();
</script>

<div class="aa-grouped {className}">
  {#each groups as group (group.key)}
    {#if group.items.length > 0 || keepEmptyGroups}
      <section class="aa-grouped__group {groupClass?.(group.label) ?? ""}">
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
