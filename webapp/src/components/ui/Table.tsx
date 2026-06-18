import type { ReactNode } from "react";
import "./Table.css";

export interface TableColumn<T> {
  /** Key into the row data, or a custom render */
  key: string;
  /** Header label */
  header: string;
  /** Render the cell; defaults to row[key] */
  render?: (row: T) => ReactNode;
  /** Align cell content */
  align?: "left" | "right" | "center";
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  /** Extract a stable React key from each row */
  rowKey: (row: T) => string;
  /** Message when rows is empty */
  emptyMessage?: string;
  className?: string;
}

/**
 * Table — striped rows with token-driven styling and responsive overflow.
 *
 * Used by the Billing payment history. Columns declare a render fn or fall
 * back to row[key]. The wrapper scrolls horizontally on narrow viewports.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "Nothing here yet.",
  className = "",
}: TableProps<T>) {
  return (
    <div className={["aa-table-wrap", className].filter(Boolean).join(" ")}>
      <table className="aa-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`aa-table__th aa-table__th--${col.align ?? "left"}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="aa-table__empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row)} className={i % 2 === 1 ? "aa-table__row--striped" : ""}>
                {columns.map((col) => (
                  <td key={col.key} className={`aa-table__td aa-table__td--${col.align ?? "left"}`}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
