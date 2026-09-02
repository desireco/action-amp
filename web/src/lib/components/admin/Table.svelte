<!--
  Table — the striped data table, ported from webapp ui/Table.tsx (S17):
  the wrapper scrolls horizontally on narrow viewports; rows stripe and
  highlight on hover. Columns are plain data (`{key, header, align}`); custom
  cells render through the optional `cell` snippet child, which receives the
  column and the row. Styling lives in lib/styles/admin.css (.aa-table-*).
-->
<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import type { TableColumn } from "./table.js";

  let {
    columns,
    rows,
    rowKey,
    emptyMessage = "Nothing here yet.",
    cell,
  }: {
    columns: TableColumn[];
    rows: T[];
    rowKey: (row: T) => string;
    emptyMessage?: string;
    cell?: Snippet<[TableColumn, T]>;
  } = $props();
</script>

<div class="aa-table-wrap">
  <table class="aa-table">
    <thead>
      <tr>
        {#each columns as col (col.key)}
          <th class="aa-table__th aa-table__th--{col.align ?? "left"}">{col.header}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if rows.length === 0}
        <tr>
          <td colspan={columns.length} class="aa-table__empty">{emptyMessage}</td>
        </tr>
      {:else}
        {#each rows as row, i}
          <tr class={i % 2 === 1 ? "aa-table__row--striped" : ""} data-row-key={rowKey(row)}>
            {#each columns as col (col.key)}
              <td class="aa-table__td aa-table__td--{col.align ?? "left"}">
                {#if cell}
                  {@render cell(col, row)}
                {:else}
                  {String((row as Record<string, unknown>)[col.key] ?? "")}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
