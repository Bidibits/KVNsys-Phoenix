import { dayTotals, shopDate, shopDay, type ReceiptSummary } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { kind: string; message: string };
  }
  return null;
};

describe("the shop's day", () => {
  it('turns at midnight Philippine time, whatever the moment is written in', () => {
    expect(shopDate(new Date('2026-10-23T15:59:59.999Z'))).toBe('2026-10-23');
    expect(shopDate(new Date('2026-10-23T16:00:00.000Z'))).toBe('2026-10-24');
    expect(shopDate(new Date('2026-12-31T23:30:00+08:00'))).toBe('2026-12-31');
    expect(shopDate(new Date('2027-01-01T00:00:00+08:00'))).toBe('2027-01-01');
  });

  it('runs from one midnight to the next, there', () => {
    expect(shopDay('2026-10-24')).toEqual({ from: new Date('2026-10-24T00:00:00+08:00'), to: new Date('2026-10-25T00:00:00+08:00') });
    expect(shopDay('2028-02-29').to).toEqual(new Date('2028-03-01T00:00:00+08:00'));
  });

  it("refuses what isn't a date", () => {
    for (const typed of ['2026-02-30', '2026-13-01', '2026-1-5', 'yesterday', '']) {
      expect(refusalOf(() => shopDay(typed)), typed).toMatchObject({ kind: 'invalid', message: `"${typed}" isn't a date. Pick one from the calendar.` });
    }
  });
});

describe("a day's totals", () => {
  const receipt = (subtotal: number, discountTotal: number, pieces: number): ReceiptSummary => ({
    id: 'r',
    code: 'HQ-000001',
    number: 1,
    createdAt: '2026-10-24T01:00:00.000Z',
    createdByUser: null,
    pieces,
    subtotal,
    discountTotal,
    total: subtotal - discountTotal,
    discountKind: discountTotal ? 'senior' : null,
  });

  it('add up every receipt, and are zero on a day with none', () => {
    expect(dayTotals([receipt(5150, 1030, 2), receipt(145050, 0, 1)])).toEqual({ receipts: 2, pieces: 3, subtotal: 150200, discountTotal: 1030, total: 149170 });
    expect(dayTotals([])).toEqual({ receipts: 0, pieces: 0, subtotal: 0, discountTotal: 0, total: 0 });
  });
});
