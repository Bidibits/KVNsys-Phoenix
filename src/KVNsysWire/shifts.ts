import { ShiftStatuses } from '@kvnsys/core';
import { z } from 'zod';

/**
 * The shift calls. Every one needs a signed-in pass and sales.sell: a cashier opens and closes their
 * own shift at the server's own shop, and can't record a sale without one open.
 *
 *   GET  /api/shifts/current          the signed-in person's open shift, with its figures so far, or none
 *   POST /api/shifts                  start a shift with the cash counted into the drawer   (201)
 *   POST /api/shifts/current/close    end it with the cash counted out, and an optional note
 *
 * A refusal is a ProblemReply (see products.ts): 400 a rule, 409 a shift already open, or none to close.
 */
export const ShiftsPath = '/api/shifts';
export const CurrentShiftPath = '/api/shifts/current';
export const CloseShiftPath = '/api/shifts/current/close';

const PesosOnWire = z.string().regex(/^\d+\.\d{2}$/);

/** A shift as the server sends it: every amount as pesos text, and names as the shop knows them. */
export const ShiftOnWire = z.object({
  id: z.string(),
  /** HQ-S00001 */
  code: z.string(),
  status: z.enum(ShiftStatuses),
  openingCash: PesosOnWire,
  /** Cash taken by the shift's sales, how many receipts, and the discounts given. */
  cashSales: PesosOnWire,
  receipts: z.number().int(),
  discounts: PesosOnWire,
  /** The opening cash and the cash sales: what the drawer should hold. */
  expectedCash: PesosOnWire,
  /** Once closed. */
  countedCash: PesosOnWire.nullable(),
  openedAt: z.string(),
  openedBy: z.string().nullable(),
  closedAt: z.string().nullable(),
  closedBy: z.string().nullable(),
  note: z.string().nullable(),
});
export type ShiftOnWire = z.infer<typeof ShiftOnWire>;

export const CurrentShiftReply = z.object({ shift: ShiftOnWire.nullable() });
export type CurrentShiftReply = z.infer<typeof CurrentShiftReply>;

export const ShiftReply = z.object({ shift: ShiftOnWire });
export type ShiftReply = z.infer<typeof ShiftReply>;

export const OpenShiftFields = z.object({ openingCash: PesosOnWire });
export type OpenShiftFields = z.infer<typeof OpenShiftFields>;

export const CloseShiftFields = z.object({ countedCash: PesosOnWire, note: z.string().max(2000) });
export type CloseShiftFields = z.infer<typeof CloseShiftFields>;
