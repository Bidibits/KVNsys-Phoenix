import type { PrismaClient } from '@kvnsys/postgres';
import type { Locator } from 'playwright-core';
import { expect } from 'vitest';

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

/**
 * A list's grid is compact, as Beta's were, so many rows and columns fit: 13px text, and no row
 * (the headings' included) taller than 28px, whatever its cells hold (a picture, an Edit button).
 */
export async function expectCompact(table: Locator): Promise<void> {
  expect(await table.evaluate((element) => getComputedStyle(element).fontSize)).toBe('13px');
  const heights = await table.locator('tr').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(1);
  expect(Math.max(...heights)).toBeLessThanOrEqual(28);
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

/** The column of a table each history heading shows. */
export const HistoryColumnsShown: Record<string, string> = {
  'Updated by': 'updated_by_user',
  'Updated machine': 'updated_at_machine',
  'Updated shop': 'updated_at_location',
  'Updated at': 'updated_at_date',
  'Created by': 'created_by_user',
  'Created machine': 'created_at_machine',
  'Created shop': 'created_at_location',
  'Created at': 'created_at_date',
};

/**
 * Checks a list's headings against its table as the database has it, not against a list typed out
 * here: every column of the table but those `notShown`, in the table's own order, so its id comes
 * first and its history last. `columnOf` says which column each heading shows. `extra` are headings no
 * column holds (worked out, such as a role's rights); they sit after the table's own columns, just
 * before its history. A heading "Change" no column backs is the Edit buttons', and is left out.
 */
export async function expectTableOrder(
  db: PrismaClient,
  table: string,
  headings: string[],
  columnOf: Record<string, string>,
  { notShown = [], extra = [] }: { notShown?: string[]; extra?: string[] } = {},
): Promise<void> {
  const columns = (
    await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${table}
      ORDER BY ordinal_position`
  ).map((row) => row.column_name);
  for (const column of notShown) expect(columns, `${table} has no column ${column}`).toContain(column);
  const isEdit = (heading: string) => heading === 'Change' && !('Change' in columnOf);
  const shown = headings.filter((heading) => !isEdit(heading) && !extra.includes(heading)).map((heading) => columnOf[heading] ?? `no column for "${heading}"`);
  expect(shown).toEqual(columns.filter((column) => !notShown.includes(column)));
  if (extra.length > 0) {
    const history = headings.indexOf(HistoryHeadings[0]!);
    expect(headings.slice(history - extra.length, history)).toEqual(extra);
  }
}
