/** The table column descriptor — plain data; custom cells render through the
 *  Table's `cell` snippet child (see Table.svelte). Lives in a .ts module so
 *  pages can import the type (Svelte scripts can't export types cleanly). */
export interface TableColumn {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
}
