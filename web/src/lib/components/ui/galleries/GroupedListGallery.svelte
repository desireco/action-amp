<script lang="ts">
  // GroupedList gallery — real row content, a kept-but-empty group, and
  // the overdue tint, on the token background.
  import GroupedList from "../GroupedList.svelte";
  import { createRawSnippet } from "svelte";

  const taskRow = createRawSnippet<[unknown]>((item) => ({
    render: () =>
      `<div class="demo-row"><span class="t">${item}</span><span class="c">Today</span></div>`,
  }));

  const groups = [
    {
      key: "overdue",
      label: "Overdue",
      items: ["Renew parking permit"],
    },
    {
      key: "today",
      label: "Today",
      items: ["Water the plants", "Call the bank", "Ship the release notes"],
    },
    {
      key: "empty",
      label: "Waiting",
      items: [] as string[],
    },
  ];
</script>

<div class="gallery">
  <GroupedList
    {groups}
    renderItem={taskRow}
    keepEmptyGroups={true}
    groupClass={(label) => (label === "Overdue" ? "aa-grouped__group--overdue" : undefined)}
  />
</div>

<style>
  .gallery {
    padding: var(--aa-space-lg);
    background: var(--aa-bg);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-lg);
    font-family: var(--aa-font);
    min-width: 360px;
  }
  /* demo rows are raw snippets (unscoped HTML) — style them globally */
  .gallery :global(.demo-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--aa-space-md);
    padding: var(--aa-space-sm) 0;
    font-size: var(--aa-text-base);
    color: var(--aa-text);
  }
  .gallery :global(.demo-row .t) {
    flex: 1;
  }
  .gallery :global(.demo-row .c) {
    font-size: var(--aa-text-xs);
    color: var(--aa-text-4);
  }
</style>
