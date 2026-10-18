import type { ReactNode } from 'react';
import { cn } from 'cn';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';

export interface Column<Row> {
  heading: string;
  cell: (row: Row) => ReactNode;
  /** Amounts line up on the right. */
  align?: 'left' | 'right';
}

/**
 * A table of records: white rows striped with Standard's alternate-row grey, and a header that
 * stays put while the rows scroll. The start of design-direction.md's shared list screen.
 *
 * The box scrolls itself, so give it a height (in a flex column, it takes the room left). shadcn's
 * own Table wrapper isn't used: it scrolls sideways, which would quietly stop the header sticking.
 */
export function RecordTable<Row>({
  label,
  columns,
  rows,
  rowKey,
  className,
}: {
  /** What the table holds, for screen readers: "Products". */
  label: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  className?: string;
}) {
  const alignment = (column: Column<Row>) => (column.align === 'right' ? 'text-right' : 'text-left');
  return (
    <div className={cn('min-h-0 overflow-auto rounded-lg border border-border bg-field', className)}>
      <table aria-label={label} className="w-full text-[15px]">
        <TableHeader className="sticky top-0 z-10 bg-secondary shadow-[0_1px_0_var(--border)]">
          <TableRow className="border-0 hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.heading} className={cn('h-11 px-4 font-semibold', alignment(column))}>
                {column.heading}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)} className="border-border/60 even:bg-row-alt hover:bg-accent/60">
              {columns.map((column) => (
                <TableCell key={column.heading} className={cn('h-11 px-4', alignment(column))}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  );
}
