import { sortRows } from '@kvnsys/ui/lib/sort-rows';
import { describe, expect, it } from 'vitest';

const rows = [
  { code: 'HQ-M10', name: 'counter 10', price: 2500, at: '2026-10-30T03:00:00.000Z' },
  { code: 'HQ-M2', name: 'Bodega', price: null, at: '2026-10-29T23:00:00.000Z' },
  { code: 'HQ-M1', name: 'counter 1', price: 900, at: null },
  { code: 'HQ-SRV', name: 'bodega', price: 2500, at: '2026-10-30T01:00:00.000Z' },
];
const codes = (sorted: typeof rows) => sorted.map((row) => row.code);

describe('sorting a table by a clicked heading', () => {
  it('puts text in alphabetical order, capitals ignored and numbers inside it counted as numbers', () => {
    expect(codes(sortRows(rows, (row) => row.code, false))).toEqual(['HQ-M1', 'HQ-M2', 'HQ-M10', 'HQ-SRV']);
    expect(codes(sortRows(rows, (row) => row.name, false))).toEqual(['HQ-M2', 'HQ-SRV', 'HQ-M1', 'HQ-M10']);
  });

  it('puts amounts by size, and the other way round when clicked again', () => {
    expect(codes(sortRows(rows, (row) => row.price, false))).toEqual(['HQ-M1', 'HQ-M10', 'HQ-SRV', 'HQ-M2']);
    expect(codes(sortRows(rows, (row) => row.price, true))).toEqual(['HQ-M10', 'HQ-SRV', 'HQ-M1', 'HQ-M2']);
  });

  it('puts moments in time order, and empty ones last whichever way it sorts', () => {
    expect(codes(sortRows(rows, (row) => row.at, false))).toEqual(['HQ-M2', 'HQ-SRV', 'HQ-M10', 'HQ-M1']);
    expect(codes(sortRows(rows, (row) => row.at, true))).toEqual(['HQ-M10', 'HQ-SRV', 'HQ-M2', 'HQ-M1']);
  });

  it('keeps ties in the order they came, and leaves the list it was given alone', () => {
    const given = [...rows];
    expect(codes(sortRows(given, (row) => row.name.toLowerCase(), false))).toEqual(['HQ-M2', 'HQ-SRV', 'HQ-M1', 'HQ-M10']);
    expect(given).toEqual(rows);
  });
});
