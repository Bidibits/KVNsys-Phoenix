import { parsePesos, pesosText, readCash, variance, varianceInWords, type ShiftStatus } from '@kvnsys/core';
import {
  CloseShiftPath,
  CurrentShiftPath,
  CurrentShiftReply,
  ShiftReply,
  ShiftsPath,
  type SessionPass,
  type ShiftOnWire,
} from '@kvnsys/wire';
import { callServer as call, readOrRefuse, type CallOptions, type Refused } from '../connection/server-call.js';

/** A shift as the selling screen shows it. Money is in centavos; the difference is worked out here, with KVNsysCore's rules. */
export interface ShiftView {
  id: string;
  code: string;
  status: ShiftStatus;
  openingCash: number;
  cashSales: number;
  receipts: number;
  discounts: number;
  expectedCash: number;
  countedCash: number | null;
  /** Counted less expected, once closed: below zero short, above zero over. */
  variance: number | null;
  /** "₱20.00 short", "₱5.00 over", "Exact", once closed. */
  varianceInWords: string | null;
  openedAt: string;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  note: string | null;
}

export type CurrentShiftResult = { ok: true; shift: ShiftView | null } | Refused;
export type ShiftResult = { ok: true; shift: ShiftView } | Refused;

const money = (pesos: string) => parsePesos(pesos)!;

function fromWire(shift: ShiftOnWire): ShiftView {
  const countedCash = shift.countedCash === null ? null : money(shift.countedCash);
  const expectedCash = money(shift.expectedCash);
  const difference = variance({ expectedCash, countedCash });
  return {
    ...shift,
    openingCash: money(shift.openingCash),
    cashSales: money(shift.cashSales),
    discounts: money(shift.discounts),
    expectedCash,
    countedCash,
    variance: difference,
    varianceInWords: difference === null ? null : varianceInWords(difference),
  };
}

/** The signed-in person's open shift at the shop, with its figures so far, or none. */
export async function currentShift(address: string, pass: SessionPass, options: CallOptions): Promise<CurrentShiftResult> {
  const answer = await call(address, pass, options, { path: CurrentShiftPath }, CurrentShiftReply);
  return answer.ok ? { ok: true, shift: answer.reply.shift && fromWire(answer.reply.shift) } : answer;
}

/** Starts a shift with the cash counted into the drawer, as typed. */
export async function openShift(address: string, pass: SessionPass, openingCash: string, options: CallOptions): Promise<ShiftResult> {
  const read = readOrRefuse(() => readCash(openingCash));
  if (!read.ok) return read;
  const answer = await call(address, pass, options, { path: ShiftsPath, method: 'POST', body: { openingCash: pesosText(read.value) } }, ShiftReply);
  return answer.ok ? { ok: true, shift: fromWire(answer.reply.shift) } : answer;
}

/** Ends the open shift with the cash counted out of the drawer, as typed, and a note if there's one. */
export async function closeShift(address: string, pass: SessionPass, countedCash: string, note: string, options: CallOptions): Promise<ShiftResult> {
  const read = readOrRefuse(() => readCash(countedCash));
  if (!read.ok) return read;
  const body = { countedCash: pesosText(read.value), note };
  const answer = await call(address, pass, options, { path: CloseShiftPath, method: 'POST', body }, ShiftReply);
  return answer.ok ? { ok: true, shift: fromWire(answer.reply.shift) } : answer;
}
