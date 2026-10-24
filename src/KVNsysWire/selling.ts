import { DiscountKinds, PaymentTypes, ProductStatuses } from '@kvnsys/core';
import { z } from 'zod';
import { ShopOnWire } from './stock.js';

/**
 * The selling calls. Every one needs a signed-in pass, and a role with sales.sell. The register
 * keeps the cart while the cashier scans; the server records the sale whole, at payment, at its
 * own shop.
 *
 *   GET  /api/sales/find?codeOrBarcode=4800249211116   one product to ring up, by what was scanned or typed
 *   POST /api/sales                                   record a sale paid in cash             (201)
 *
 * And with sales.view, to look back:
 *
 *   GET  /api/sales?date=2026-10-24                   a day's receipts and their totals (today if no date)
 *   GET  /api/sales/<id>                              one receipt, as it was given
 *
 * The server prices the sale again from the catalog as it is now, and refuses (409) when that
 * isn't the total the register showed, so a customer is never charged what the cashier didn't
 * see. A refusal is a ProblemReply (see products.ts): 400 a rule (short cash, a product that
 * can't be sold), 401 sign in again, 403 the role may not, 404 no such product, 409 a price
 * changed, 503 no database, or this PC was never set up as the server.
 */
export const SalesPath = '/api/sales';
export const FindSaleProductPath = '/api/sales/find';
export const receiptPath = (id: string) => `${SalesPath}/${encodeURIComponent(id)}`;

/** Pesos as text, "1450.50", as everywhere on the wire: never a JSON number. */
const PesosOnWire = z.string().regex(/^\d+\.\d{2}$/);

/** A product as the till needs it to ring it up. */
export const SaleProductOnWire = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  retailPrice: PesosOnWire,
  status: z.enum(ProductStatuses),
});
export type SaleProductOnWire = z.infer<typeof SaleProductOnWire>;

export const SaleProductReply = z.object({ product: SaleProductOnWire });
export type SaleProductReply = z.infer<typeof SaleProductReply>;

export const DiscountOnWire = z.object({
  kind: z.enum(DiscountKinds),
  idNumber: z.string().max(200),
  customerName: z.string().max(500),
});

/** What a register sends to record a sale. KVNsysCore's rules are checked at the server. */
export const SaleFields = z.object({
  lines: z.array(z.object({ productId: z.string().max(100), quantity: z.number() })).min(1).max(500),
  discount: DiscountOnWire.nullable(),
  /** The cash the customer gave. */
  tendered: PesosOnWire,
  /** The total the register showed. The server refuses the sale if it now comes to anything else. */
  expectedTotal: PesosOnWire,
});
export type SaleFields = z.infer<typeof SaleFields>;

/** A receipt as the server sends it: every amount as pesos text. */
export const ReceiptOnWire = z.object({
  id: z.string(),
  /** HQ-000042 */
  code: z.string(),
  number: z.number().int().positive(),
  lines: z.array(
    z.object({
      productId: z.string(),
      code: z.string(),
      name: z.string(),
      quantity: z.number().int().positive(),
      unitPrice: PesosOnWire,
      subtotal: PesosOnWire,
      discount: PesosOnWire,
      total: PesosOnWire,
    }),
  ),
  subtotal: PesosOnWire,
  discountTotal: PesosOnWire,
  total: PesosOnWire,
  discount: DiscountOnWire.nullable(),
  payment: z.object({ type: z.enum(PaymentTypes), tendered: PesosOnWire, change: PesosOnWire }),
  /** When it was paid, by the server's clock: an ISO date and time. */
  createdAt: z.string(),
});
export type ReceiptOnWire = z.infer<typeof ReceiptOnWire>;

/**
 * A receipt, with what it prints at the top: the shop, who rang it up and where. The cashier is
 * null when their account isn't on this server.
 */
export const ReceiptReply = z.object({
  receipt: ReceiptOnWire,
  shop: ShopOnWire,
  cashier: z.string().nullable(),
  /** The register it was rung up at, as the shop calls it now, or null when it was at none. */
  register: z.string().nullable(),
});
export type ReceiptReply = z.infer<typeof ReceiptReply>;

/** One receipt as a day's list shows it. */
export const ReceiptSummaryOnWire = z.object({
  id: z.string(),
  code: z.string(),
  number: z.number().int().positive(),
  createdAt: z.string(),
  cashier: z.string().nullable(),
  pieces: z.number().int(),
  subtotal: PesosOnWire,
  discountTotal: PesosOnWire,
  total: PesosOnWire,
  discountKind: z.enum(DiscountKinds).nullable(),
});
export type ReceiptSummaryOnWire = z.infer<typeof ReceiptSummaryOnWire>;

/** A day at the shop (midnight to midnight, Philippine time): its receipts, oldest first, and their totals. */
export const DaySalesReply = z.object({
  shop: ShopOnWire,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receipts: z.array(ReceiptSummaryOnWire),
  totals: z.object({
    receipts: z.number().int(),
    pieces: z.number().int(),
    subtotal: PesosOnWire,
    discountTotal: PesosOnWire,
    total: PesosOnWire,
  }),
});
export type DaySalesReply = z.infer<typeof DaySalesReply>;
