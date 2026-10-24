import type { Lineage } from '../shared/lineage.js';
import { displayPesos } from '../shared/money.js';
import { Refusal } from '../shared/refusal.js';

/** A shift is Open while its cashier sells, and Closed once the drawer is counted. A closed shift never changes. */
export const ShiftStatuses = ['Open', 'Closed'] as const;
export type ShiftStatus = (typeof ShiftStatuses)[number];

export const ShiftLimits = { note: 500 } as const;

/**
 * One cashier's stretch at the till, from the cash counted into the drawer to the cash counted out.
 * It belongs to a shop and a person, not to a PC: opened at one register, it can be closed at
 * another (SCHEMA-PLAN). Money is in centavos.
 */
export interface Shift {
  id: string;
  /** The shop's code and the shift's number there: HQ-S00001. */
  code: string;
  number: number;
  locationId: string;
  status: ShiftStatus;
  openingCash: number;
  openedBy: string;
  openedAt: string;
  /** What the shift's sales have taken so far, and how many receipts. */
  cashSales: number;
  receipts: number;
  discounts: number;
  /** What should be in the drawer: the opening cash and the cash sales. */
  expectedCash: number;
  /** Once closed: what was counted, and when and by whom. */
  countedCash: number | null;
  closedBy: string | null;
  closedAt: string | null;
  note: string | null;
}

/** The drawer against what it should hold: below zero short, above zero over, zero right. */
export function variance(shift: Pick<Shift, 'expectedCash' | 'countedCash'>): number | null {
  return shift.countedCash === null ? null : shift.countedCash - shift.expectedCash;
}

/** A variance in words, for the shift report: "₱20.00 short", "₱5.00 over", "Exact". */
export function varianceInWords(amount: number): string {
  if (amount === 0) return 'Exact';
  return `${displayPesos(Math.abs(amount))} ${amount < 0 ? 'short' : 'over'}`;
}

/** The note on closing, tidied, or refused when it's too long. */
export function checkShiftNote(note: string): string | null {
  const text = note.trim();
  if (text.length > ShiftLimits.note) throw new Refusal('invalid', `A note can be at most ${ShiftLimits.note} characters.`);
  return text || null;
}

/**
 * The shifts a server keeps. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 *
 * A person has one open shift at a shop at a time. Shifts are numbered per shop with no gaps. Every
 * figure (cash sales, expected cash) is worked out from the shift's receipts, never typed.
 */
export abstract class ShiftBook {
  /** The person's open shift at the shop, with its figures so far, or null. */
  abstract current(userId: string, locationId: string): Promise<Shift | null>;
  /** Opens a shift with the cash counted into the drawer. Refuses a second open one. */
  abstract open(userId: string, locationId: string, openingCash: number, lineage: Lineage): Promise<Shift>;
  /** Closes the shift with the cash counted out, keeping what it should have held. Refuses one already closed. */
  abstract close(id: string, countedCash: number, note: string | null, lineage: Lineage): Promise<Shift>;
  abstract get(id: string): Promise<Shift | null>;
}

/** Said when someone tries to sell without a shift. */
export const NoShiftYet = 'Start your shift first: count the cash in the drawer, then Start shift.';
