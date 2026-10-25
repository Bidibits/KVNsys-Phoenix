import type { ReactNode } from 'react';
import { cn } from 'cn';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';

export interface Column<Row> {
  heading: string;
  cell: (row: Row) => ReactNode;
  /** Amounts line up on the right. */
  align?: 'left' | 'right';
  /** For a column of buttons: the heading is there for screen readers, not shown. */
  hiddenHeading?: boolean;
  /**
   * Long text, such as a name, wraps onto a second line instead of pushing the table wider than
   * its box. Other columns stay on one line.
   */
  wrap?: boolean;
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
  size = 'compact',
  filter = '',
  searchText,
  className,
}: {
  /** What the table holds, for screen readers: "Products". */
  label: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** "compact" for back-office lists, where many rows fit; "large" for the selling screen (design-direction.md, part 2). */
  size?: 'compact' | 'large';
  /** What's typed in the title bar's search box: only rows whose searchText holds every word of it show. */
  filter?: string;
  /** The words a row is found by, such as its code and name. Without it, the filter is ignored. */
  searchText?: (row: Row) => string;
  className?: string;
}) {
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = searchText && words.length > 0 ? rows.filter((row) => words.every((word) => searchText(row).toLowerCase().includes(word))) : rows;
  const alignment = (column: Column<Row>) => (column.align === 'right' ? 'text-right' : 'text-left');
  // Large rows are taller, and a little narrower at the sides, so a selling screen's columns fit.
  const cell = size === 'large' ? 'h-14 px-3' : 'h-11 px-4';
  return (
    <div className={cn('min-h-0 overflow-auto rounded-lg border border-border bg-field', className)}>
      <table aria-label={label} className={cn('w-full', size === 'large' ? 'text-lg' : 'text-[15px]')}>
        <TableHeader className="sticky top-0 z-10 bg-secondary shadow-[0_1px_0_var(--border)]">
          <TableRow className="border-0 hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.heading} className={cn(cell, 'font-semibold', alignment(column))}>
                {column.hiddenHeading ? <span className="sr-only">{column.heading}</span> : column.heading}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 && rows.length > 0 && (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-14 px-4 text-muted-foreground">
                Nothing here matches “{filter.trim()}”.
              </TableCell>
            </TableRow>
          )}
          {shown.map((row) => (
            <TableRow key={rowKey(row)} className="border-border/60 even:bg-row-alt hover:bg-accent/60">
              {columns.map((column) => (
                <TableCell key={column.heading} className={cn(cell, alignment(column), column.wrap && 'py-1.5 whitespace-normal')}>
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
