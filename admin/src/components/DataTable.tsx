// The site's table: tinted header, hairline rows, numbers right-aligned in tabular figures, a row you can click, an empty row.
// Columns say what to show; the table decides how. Wide tables scroll inside their own box; `hideBelow` drops secondary
// columns on narrow screens. EntityTable (expandable, sortable) and the sales data-grid will move onto this look next.

import type { ReactNode } from "react";
import { useT } from "../context/LangContext";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Numbers and money: right-aligned, tabular figures, never wrapped. */
  numeric?: boolean;
  /** Hide this column below the given breakpoint. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

export function DataTable<T>({ columns, rows, getKey, onRowClick, empty = "Nothing to show.", footer, className }: { columns: Column<T>[]; rows: T[]; getKey: (row: T) => string | number; onRowClick?: (row: T) => void; empty?: ReactNode; footer?: ReactNode; className?: string }) {
  const t = useT();
  const cellCls = (c: Column<T>) => cn("px-4 py-3", c.numeric && "tnum whitespace-nowrap text-right", c.hideBelow && HIDE[c.hideBelow], c.className);
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-border/70 bg-surface shadow-[var(--shadow-soft)]", className)}>
      <table className="w-full min-w-[22rem] text-left text-sm">
        <thead className="bg-surface2 text-xs text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-2.5 font-medium", c.numeric && "text-right", c.hideBelow && HIDE[c.hideBelow])}>{typeof c.header === "string" ? t(c.header) : c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((r) => (
            <tr key={getKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("text-ink", onRowClick && "cursor-pointer hover:bg-surface2/50")}>
              {columns.map((c) => <td key={c.key} className={cellCls(c)}>{c.cell(r)}</td>)}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-xs text-muted">{typeof empty === "string" ? t(empty) : empty}</td></tr>
          )}
        </tbody>
        {footer && <tfoot className="border-t border-border/70 bg-surface2/50 text-sm font-medium text-ink"><tr>{footer}</tr></tfoot>}
      </table>
    </div>
  );
}
