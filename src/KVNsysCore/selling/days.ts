import { Refusal } from '../shared/refusal.js';

/**
 * The shop's clock: Philippine time, UTC+8, all year (the Philippines has no daylight saving). A
 * day is midnight to midnight here, whatever time zone the PC the server runs on is set to.
 */
export const ShopTimeZone = 'Asia/Manila';
const ShopOffsetMs = 8 * 60 * 60 * 1000;

/** The shop's date at a moment: "2026-10-24". */
export function shopDate(at: Date): string {
  return new Date(at.getTime() + ShopOffsetMs).toISOString().slice(0, 10);
}

/** The moments a shop's day starts and ends (the end is the next day's start), or a refusal for a date that isn't one. */
export function shopDay(date: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const midnightUtc = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
  if (!match || Number.isNaN(midnightUtc) || new Date(midnightUtc).toISOString().slice(0, 10) !== date.trim()) {
    throw new Refusal('invalid', `"${date}" isn't a date. Pick one from the calendar.`);
  }
  const from = new Date(midnightUtc - ShopOffsetMs);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

/** One receipt as the day's list shows it. Money is in centavos. */
export interface ReceiptSummary {
  id: string;
  code: string;
  number: number;
  createdAt: string;
  createdByUser: string | null;
  /** How many pieces were sold on it. */
  pieces: number;
  subtotal: number;
  discountTotal: number;
  total: number;
  discountKind: string | null;
}

/** A day's sales added up: how many receipts, what they came to before and after discounts. */
export interface DayTotals {
  receipts: number;
  pieces: number;
  subtotal: number;
  discountTotal: number;
  total: number;
}

export function dayTotals(receipts: readonly ReceiptSummary[]): DayTotals {
  return receipts.reduce<DayTotals>(
    (sum, receipt) => ({
      receipts: sum.receipts + 1,
      pieces: sum.pieces + receipt.pieces,
      subtotal: sum.subtotal + receipt.subtotal,
      discountTotal: sum.discountTotal + receipt.discountTotal,
      total: sum.total + receipt.total,
    }),
    { receipts: 0, pieces: 0, subtotal: 0, discountTotal: 0, total: 0 },
  );
}
