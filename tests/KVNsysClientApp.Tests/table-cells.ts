import type { Locator } from 'playwright-core';

/**
 * Each row's cells under the headings named, in that order: read by heading, not position, so a
 * column added anywhere doesn't move them. A heading that isn't there reads as null.
 */
export function cellsUnder(table: Locator, headings: string[]): Promise<(string | null)[][]> {
  return table.locator('tbody tr').evaluateAll((rows, wanted) => {
    const all = [...(rows[0]?.closest('table')?.querySelectorAll('th') ?? [])].map((heading) => (heading.textContent ?? '').replace(/[▲▼]/g, ''));
    const at = wanted.map((heading) => all.indexOf(heading));
    return rows.map((row) => at.map((index) => (index < 0 ? null : (row.querySelectorAll('td')[index]?.textContent ?? null))));
  }, headings);
}

/** The headings, in order, as shown (a sorted column's arrow left out). */
export function headingsOf(table: Locator): Promise<string[]> {
  return table.locator('thead th').evaluateAll((cells) => cells.map((cell) => (cell.textContent ?? '').replace(/[▲▼]/g, '')));
}

/** The eight history headings every list ends with, before its Edit column. */
export const HistoryHeadings = [
  'Updated by',
  'Updated machine',
  'Updated shop',
  'Updated at',
  'Created by',
  'Created machine',
  'Created shop',
  'Created at',
];
