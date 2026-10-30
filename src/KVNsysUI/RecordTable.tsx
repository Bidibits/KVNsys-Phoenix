import { useState, type MouseEvent, type ReactNode } from 'react';
import { cn } from 'cn';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { sortRows, type SortValue } from './lib/sort-rows';

export interface Column<Row> {
  heading: string;
  cell: (row: Row) => ReactNode;
  /** Amounts line up on the right. */
  align?: 'left' | 'right';
  /** For a column of buttons: the heading is there for screen readers, not shown. */
  hiddenHeading?: boolean;
  /**
   * Long text, such as a name, wraps onto a second line instead of pushing the table wider than
   * its box. Other columns stay on one line. A wide table keeps every cell on one line.
   */
  wrap?: boolean;
  /**
   * The column's width, such as "9rem". In a wide table every column keeps its width (10rem when
   * it doesn't say). Otherwise it's for a table where columns that may hold long text would take
   * the room the short ones need; the columns without one share what's left.
   */
  width?: string;
  /**
   * What the column sorts by when its heading is clicked: a number by size, text alphabetically,
   * an ISO date and time by time. Clicked again it sorts the other way; a third time, back to the
   * list's own order. Without it, the heading isn't a button.
   */
  sortBy?: (row: Row) => SortValue;
  /** Stays at the right-hand edge while a wide table scrolls sideways: for a column of Edit buttons. */
  pinned?: boolean;
}

/** A wide table's column without a width of its own. */
const DefaultWidth = '10rem';

/** A wide table's cell too narrow for its text shows it whole when the pointer rests on it, as Beta's grids did. */
function showWhole(event: MouseEvent<HTMLTableCellElement>) {
  const cell = event.currentTarget;
  cell.title = cell.scrollWidth > cell.clientWidth ? (cell.textContent ?? '') : '';
}

/**
 * A table of records: white rows striped with Standard's alternate-row grey, and a header that
 * stays put while the rows scroll. A heading with something to sort by sorts the rows when clicked.
 * The start of design-direction.md's shared list screen.
 *
 * A wide one works like Beta's grids: every column keeps its width, each cell stays on one line
 * (ending in … when its text is longer), and the table scrolls sideways when the columns don't all
 * fit. That's for lists that show every column of their records. Otherwise the columns share the
 * box's width, as the selling screen wants.
 *
 * The box scrolls itself, both ways, so give it a height (in a flex column, it takes the room left).
 * shadcn's own Table wrapper isn't used: it's a second box that scrolls sideways, which would
 * quietly stop the header sticking.
 */
export function RecordTable<Row>({
  label,
  columns,
  rows,
  rowKey,
  size = 'compact',
  filter = '',
  searchText,
  wide = false,
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
  /** Every column keeps its width and the table scrolls sideways, like Beta's grids. */
  wide?: boolean;
  className?: string;
}) {
  const [sort, setSort] = useState<{ heading: string; descending: boolean } | null>(null);

  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = searchText && words.length > 0 ? rows.filter((row) => words.every((word) => searchText(row).toLowerCase().includes(word))) : rows;
  const sortedBy = sort ? columns.find((column) => column.heading === sort.heading)?.sortBy : undefined;
  const shown = sort && sortedBy ? sortRows(found, sortedBy, sort.descending) : found;

  /** First click: A to Z, smallest first. Second: the other way. Third: the list's own order. */
  function sortOn(heading: string) {
    setSort((current) => (current?.heading !== heading ? { heading, descending: false } : current.descending ? null : { heading, descending: true }));
  }
  const ariaSort = (column: Column<Row>) =>
    !column.sortBy ? undefined : sort?.heading !== column.heading ? 'none' : sort.descending ? 'descending' : 'ascending';

  const alignment = (column: Column<Row>) => (column.align === 'right' ? 'text-right' : 'text-left');
  // Large rows are taller, and a little narrower at the sides, so a selling screen's columns fit.
  const cell = size === 'large' ? 'h-14 px-3' : 'h-11 px-4';
  // As wide as its columns, or as the box when they'd leave room over.
  const tableWidth = wide ? `max(100%, calc(${columns.map((column) => column.width ?? DefaultWidth).join(' + ')}))` : undefined;
  // A pinned column covers the cells that scroll under it, so it has the row's own colour, and a line on its left.
  const pinned = 'sticky right-0 shadow-[inset_1px_0_0_var(--border)]';

  return (
    <div className={cn('min-h-0 overflow-auto rounded-lg border border-border bg-field', className)}>
      <table
        aria-label={label}
        className={cn(wide ? 'table-fixed' : 'w-full', size === 'large' ? 'text-lg' : 'text-[15px]')}
        style={tableWidth ? { width: tableWidth } : undefined}
      >
        {wide && (
          <colgroup>
            {columns.map((column) => (
              <col key={column.heading} style={{ width: column.width ?? DefaultWidth }} />
            ))}
          </colgroup>
        )}
        <TableHeader className="sticky top-0 z-10 bg-secondary shadow-[0_1px_0_var(--border)]">
          <TableRow className="border-0 hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.heading}
                aria-sort={ariaSort(column)}
                className={cn(cell, 'font-semibold', alignment(column), wide && 'overflow-hidden text-ellipsis', wide && column.pinned && cn(pinned, 'z-10 bg-secondary'))}
                style={!wide && column.width ? { width: column.width } : undefined}
              >
                {column.hiddenHeading ? (
                  <span className="sr-only">{column.heading}</span>
                ) : column.sortBy ? (
                  <button
                    type="button"
                    className="inline-flex max-w-full items-center gap-1.5 font-semibold underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                    onClick={() => sortOn(column.heading)}
                  >
                    <span className="truncate">{column.heading}</span>
                    {sort?.heading === column.heading && (
                      <span aria-hidden className="text-[11px]">
                        {sort.descending ? '▼' : '▲'}
                      </span>
                    )}
                  </button>
                ) : (
                  column.heading
                )}
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
            // Opaque colours, so a pinned cell (which takes the row's) hides what scrolls under it.
            <TableRow key={rowKey(row)} className="border-border/60 bg-field even:bg-row-alt hover:bg-[color-mix(in_oklab,var(--accent)_60%,var(--field))]">
              {columns.map((column) => (
                <TableCell
                  key={column.heading}
                  className={cn(
                    cell,
                    alignment(column),
                    wide ? 'overflow-hidden text-ellipsis' : column.wrap && 'py-1.5 whitespace-normal',
                    wide && column.pinned && cn(pinned, 'bg-inherit'),
                  )}
                  onMouseEnter={wide ? showWhole : undefined}
                >
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
