/** What a column sorts by: a number by size, text alphabetically (an ISO date and time sorts by time that way). */
export type SortValue = string | number | null;

const Text = new Intl.Collator('en-PH', { numeric: true, sensitivity: 'base' });

/** Empty has nothing to sort by, so it goes last whichever way the column sorts. */
const isEmpty = (value: SortValue) => value === null || value === '';

/**
 * The rows in the order a clicked column heading asks for: by its value, smallest or A first, or
 * the other way round. Capitals don't count, and numbers inside text count as numbers (R2 before
 * R10). Rows that tie keep their order. A new list; the one given is left as it was.
 */
export function sortRows<Row>(rows: readonly Row[], value: (row: Row) => SortValue, descending: boolean): Row[] {
  const keyed = rows.map((row, at) => ({ row, at, value: value(row) }));
  keyed.sort((a, b) => {
    if (isEmpty(a.value) || isEmpty(b.value)) return Number(isEmpty(a.value)) - Number(isEmpty(b.value)) || a.at - b.at;
    const order = typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : Text.compare(String(a.value), String(b.value));
    return (descending ? -order : order) || a.at - b.at;
  });
  return keyed.map((entry) => entry.row);
}
