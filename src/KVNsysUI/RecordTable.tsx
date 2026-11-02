import { columnWidth } from '@kvnsys/core';
import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from 'cn';
import { useKeptColumnWidths } from './ColumnWidths';
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
   * The column's width. In a wide table give it in em, such as "9em": it follows the table's text,
   * so the compact grid's columns are narrow too, and every column keeps its width (10em when it
   * doesn't say) until a person drags it to another. Otherwise, such as "9rem", it's for a table
   * where columns that may hold long text would take the room the short ones need; the columns
   * without one share what's left.
   */
  width?: string;
  /**
   * What the column sorts by when its heading is clicked: a number by size, text alphabetically,
   * an ISO date and time by time. Clicked again it sorts the other way; a third time, back to the
   * list's own order. Without it, the heading isn't a button.
   */
  sortBy?: (row: Row) => SortValue;
  /** Stays at the right-hand edge while a wide table scrolls sideways: for a column of Edit buttons. Its width can't be dragged. */
  pinned?: boolean;
}

/** A wide table's column without a width of its own. */
const DefaultWidth = '10em';

/** The room a sortable heading keeps for its ▲ or ▼, so a column fitted to its heading still shows the mark. */
const SortMarkRoom = 18;

/** A wide table's cell too narrow for its text shows it whole when the pointer rests on it, as Beta's grids did. */
function showWhole(event: MouseEvent<HTMLTableCellElement>) {
  const cell = event.currentTarget;
  cell.title = cell.scrollWidth > cell.clientWidth ? (cell.textContent ?? '') : '';
}

/** How wide a cell's contents (or part of them) are laid out, with the cell's padding: text cut short with … counts whole. */
function contentWidth(cell: HTMLElement, contents: Node = cell): number {
  const range = document.createRange();
  range.selectNodeContents(contents);
  const style = getComputedStyle(cell);
  return range.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
}

/**
 * A table of records: white rows striped with Standard's alternate-row grey, and a header that
 * stays put while the rows scroll. A heading with something to sort by sorts the rows when clicked.
 * The start of design-direction.md's shared list screen.
 *
 * A wide one works like Beta's grids: compact (13px text, rows 28px tall), a line between columns,
 * every column keeps its width, each cell stays on one line (ending in … when its text is longer),
 * and the table scrolls sideways when the columns don't all fit. Dragging the line at a heading's
 * right-hand edge makes that column wider or narrower; double-clicking it fits the column to its
 * heading and the longest of what it shows. Inside a ColumnWidthsProvider the width is kept, so it
 * comes back the next time; otherwise it lasts while the list is open. That's for lists that show
 * every column of their records, where seeing many rows and columns at once matters most.
 * Otherwise the columns share the box's width, as the selling screen wants.
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
  /** What the table holds, for screen readers: "Products". A wide table's kept column widths are kept under it. */
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
  const kept = useKeptColumnWidths();
  // Widths dragged with nowhere to keep them: they last while the list is open.
  const [ownWidths, setOwnWidths] = useState<Record<string, string>>({});
  const tableRef = useRef<HTMLTableElement>(null);

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

  const resizable = (column: Column<Row>) => wide && !column.pinned;
  // The line after a column. A pinned column draws the one before it itself, so it shows while the rest scroll.
  const lined = (index: number) => resizable(columns[index]!) && !columns[index + 1]?.pinned;
  const dragged = kept ? (kept.widths[label] ?? {}) : ownWidths;
  const widths = columns.map((column) => (resizable(column) ? dragged[column.heading] : undefined) ?? column.width ?? DefaultWidth);
  // As wide as its columns, or as the box when they'd leave room over.
  const tableWidthOf = (each: string[]) => `max(100%, calc(${each.join(' + ')}))`;

  function keepWidth(heading: string, width: string) {
    if (kept) kept.keep(label, heading, width);
    else setOwnWidths((now) => ({ ...now, [heading]: width }));
  }

  /**
   * Dragging the line at a heading's right-hand edge. The column follows the pointer on the page
   * itself, so a long list keeps up, and the width is kept once the button is let go.
   */
  function startDrag(event: PointerEvent<HTMLDivElement>, index: number) {
    const handle = event.currentTarget;
    const table = tableRef.current;
    const col = table?.querySelectorAll('col')[index];
    const heading = handle.parentElement;
    if (event.button !== 0 || !table || !col || !heading) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const em = parseFloat(getComputedStyle(table).fontSize);
    const startX = event.clientX;
    const startPx = heading.getBoundingClientRect().width;
    let width: string | null = null;
    const move = (moved: globalThis.PointerEvent) => {
      if (width === null && moved.clientX === startX) return;
      const next = columnWidth((startPx + moved.clientX - startX) / em);
      width = next;
      col.style.width = next;
      table.style.width = tableWidthOf(widths.map((each, at) => (at === index ? next : each)));
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      if (width !== null) keepWidth(columns[index]!.heading, width);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** Double-clicking the line: the column becomes as wide as its heading and the longest of what it shows. */
  function fit(index: number) {
    const table = tableRef.current;
    const heading = table?.tHead?.rows[0]?.cells[index];
    const column = columns[index];
    if (!table || !heading || !column) return;
    const name = heading.querySelector('[data-heading]');
    let needed = name ? contentWidth(heading, name) + (column.sortBy ? SortMarkRoom : 0) : 0;
    for (const row of Array.from(table.tBodies[0]?.rows ?? [])) {
      // The "nothing matches" row is one cell across the whole table, not this column's.
      const cell = row.cells.length === columns.length ? row.cells[index] : undefined;
      if (cell) needed = Math.max(needed, contentWidth(cell));
    }
    // A pixel over, so the line between columns never covers the last letter.
    keepWidth(column.heading, columnWidth((Math.ceil(needed) + 1) / parseFloat(getComputedStyle(table).fontSize)));
  }

  const alignment = (column: Column<Row>) => (column.align === 'right' ? 'text-right' : 'text-left');
  // Large rows are taller, and a little narrower at the sides, so a selling screen's columns fit.
  // A wide grid is compact, as Beta's were: smaller text, short rows and less room at the sides.
  const cell = size === 'large' ? 'h-14 px-3' : wide ? 'h-7 px-2 py-0' : 'h-11 px-4';
  const text = wide ? 'text-[13px]' : size === 'large' ? 'text-lg' : 'text-[15px]';
  // A pinned column covers the cells that scroll under it, so it has the row's own colour, and a line on its left.
  const pinned = 'sticky right-0 shadow-[inset_1px_0_0_var(--border)]';
  // The lines between a wide table's columns are drawn inside each cell's right-hand edge, so they
  // stay with the header when it sticks; the last column's would only double the box's own border.
  const headingLine = 'shadow-[inset_-1px_0_0_var(--border)] last:shadow-none';
  const cellLine = 'shadow-[inset_-1px_0_0_color-mix(in_oklab,var(--border)_60%,transparent)] last:shadow-none';

  return (
    <div className={cn('min-h-0 overflow-auto rounded-lg border border-border bg-field', className)}>
      <table
        ref={tableRef}
        aria-label={label}
        className={cn(wide ? 'table-fixed' : 'w-full', text)}
        style={wide ? { width: tableWidthOf(widths) } : undefined}
      >
        {wide && (
          <colgroup>
            {columns.map((column, index) => (
              <col key={column.heading} style={{ width: widths[index] }} />
            ))}
          </colgroup>
        )}
        <TableHeader className="sticky top-0 z-10 bg-secondary shadow-[0_1px_0_var(--border)]">
          <TableRow className="border-0 hover:bg-transparent">
            {columns.map((column, index) => (
              <TableHead
                key={column.heading}
                aria-sort={ariaSort(column)}
                className={cn(
                  cell,
                  'font-semibold',
                  alignment(column),
                  wide && 'relative overflow-hidden text-ellipsis',
                  lined(index) && headingLine,
                  wide && column.pinned && cn(pinned, 'z-10 bg-secondary'),
                )}
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
                    <span data-heading className="truncate">
                      {column.heading}
                    </span>
                    {sort?.heading === column.heading && (
                      <span aria-hidden className="text-[11px]">
                        {sort.descending ? '▼' : '▲'}
                      </span>
                    )}
                  </button>
                ) : (
                  <span data-heading>{column.heading}</span>
                )}
                {/* Only a pointer drags it, so screen readers skip it and a heading reads as itself. */}
                {resizable(column) && (
                  <div
                    aria-hidden
                    data-column-edge
                    title="Drag to make this column wider or narrower. Double-click to fit it to what it shows."
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/30"
                    onPointerDown={(event) => startDrag(event, index)}
                    onDoubleClick={() => fit(index)}
                  />
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
              {columns.map((column, index) => (
                <TableCell
                  key={column.heading}
                  className={cn(
                    cell,
                    alignment(column),
                    wide ? 'overflow-hidden text-ellipsis' : column.wrap && 'py-1.5 whitespace-normal',
                    lined(index) && cellLine,
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
