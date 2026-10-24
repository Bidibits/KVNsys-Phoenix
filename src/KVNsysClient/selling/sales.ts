import {
  parsePesos,
  pesosText,
  priceSale,
  readCash,
  takeCash,
  type CartLine,
  type PaymentType,
  type DayTotals,
  type DiscountKind,
  type PricedSale,
  type Receipt,
  type SaleProduct,
  type StatutoryDiscount,
} from '@kvnsys/core';
import {
  DaySalesReply,
  FindSaleProductPath,
  receiptPath,
  ReceiptReply,
  SaleProductReply,
  SalesPath,
  type ReceiptOnWire,
  type SessionPass,
  type ShopOnWire,
} from '@kvnsys/wire';
import { callServer as call, readOrRefuse, type CallOptions, type Refused } from '../connection/server-call.js';

/** A receipt as the register shows it: what was charged, and how it was paid. */
export type PaidReceipt = Omit<Receipt, 'locationId' | 'createdByUser' | 'machineId'>;

export type SaleProductResult = { ok: true; product: SaleProduct } | Refused;
export type PriceResult = { ok: true; sale: PricedSale } | Refused;
/** A receipt with its shop and who rang it up: null when their account isn't on this server. */
export type SaleResult = { ok: true; receipt: PaidReceipt; shop: ShopOnWire; cashier: string | null; register: string | null } | Refused;

/** One receipt as a day's list shows it. Money is in centavos. */
export interface ReceiptLine {
  id: string;
  code: string;
  number: number;
  createdAt: string;
  cashier: string | null;
  pieces: number;
  subtotal: number;
  discountTotal: number;
  total: number;
  discountKind: DiscountKind | null;
}
export type DaySalesResult = { ok: true; shop: ShopOnWire; date: string; receipts: ReceiptLine[]; totals: DayTotals } | Refused;

/** What the cashier rang up, as the selling screen holds it: the cart, a discount if one was given, and the cash as typed. */
export interface SaleForm {
  cart: CartLine[];
  discount: StatutoryDiscount | null;
  tendered: string;
}

const money = (pesos: string) => parsePesos(pesos)!;

/** One product to ring up, by what was scanned or typed: its code or its barcode. */
export async function findSaleProduct(address: string, pass: SessionPass, codeOrBarcode: string, options: CallOptions): Promise<SaleProductResult> {
  const path = `${FindSaleProductPath}?codeOrBarcode=${encodeURIComponent(codeOrBarcode)}`;
  const answer = await call(address, pass, options, { path }, SaleProductReply);
  if (!answer.ok) return answer;
  return { ok: true, product: { ...answer.reply.product, retailPrice: money(answer.reply.product.retailPrice) } };
}

/**
 * What the cart comes to, worked out here on the register with KVNsysCore's own rules, the same
 * ones the server records the sale with. A product that can't be sold is refused here, by name.
 */
export function priceCart(cart: CartLine[], discount: StatutoryDiscount | null): PriceResult {
  const read = readOrRefuse(() => priceSale(cart, discount));
  return read.ok ? { ok: true, sale: read.value } : read;
}

/**
 * Records the sale at the server, paid in cash. The cart is priced and the cash checked here first,
 * so a mistake or short cash is caught without asking; the server prices it again from its catalog
 * and refuses it if that comes to anything but the total the cashier saw.
 */
export async function recordSale(address: string, pass: SessionPass, form: SaleForm, options: CallOptions): Promise<SaleResult> {
  const read = readOrRefuse(() => {
    const sale = priceSale(form.cart, form.discount);
    const tendered = readCash(form.tendered);
    takeCash(sale.total, tendered);
    return { sale, tendered };
  });
  if (!read.ok) return read;
  const body = {
    lines: form.cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    discount: read.value.sale.discount,
    tendered: pesosText(read.value.tendered),
    expectedTotal: pesosText(read.value.sale.total),
  };
  const answer = await call(address, pass, options, { path: SalesPath, method: 'POST', body }, ReceiptReply);
  if (!answer.ok) return answer;
  const { shop, cashier, register } = answer.reply;
  return { ok: true, receipt: receiptFromWire(answer.reply.receipt), shop, cashier, register };
}

/** A day's receipts at the shop, oldest first, with their totals. Today, by the shop's clock, when the date is null. */
export async function listDaySales(address: string, pass: SessionPass, date: string | null, options: CallOptions): Promise<DaySalesResult> {
  const path = date === null ? SalesPath : `${SalesPath}?date=${encodeURIComponent(date)}`;
  const answer = await call(address, pass, options, { path }, DaySalesReply);
  if (!answer.ok) return answer;
  const { shop, totals } = answer.reply;
  return {
    ok: true,
    shop,
    date: answer.reply.date,
    receipts: answer.reply.receipts.map((receipt) => ({
      ...receipt,
      subtotal: money(receipt.subtotal),
      discountTotal: money(receipt.discountTotal),
      total: money(receipt.total),
    })),
    totals: { ...totals, subtotal: money(totals.subtotal), discountTotal: money(totals.discountTotal), total: money(totals.total) },
  };
}

/** One receipt as it was given, to see it again. */
export async function getReceipt(address: string, pass: SessionPass, id: string, options: CallOptions): Promise<SaleResult> {
  const answer = await call(address, pass, options, { path: receiptPath(id) }, ReceiptReply);
  if (!answer.ok) return answer;
  const { shop, cashier, register } = answer.reply;
  return { ok: true, receipt: receiptFromWire(answer.reply.receipt), shop, cashier, register };
}

function receiptFromWire(receipt: ReceiptOnWire): PaidReceipt {
  return {
    id: receipt.id,
    code: receipt.code,
    number: receipt.number,
    lines: receipt.lines.map((line) => ({
      ...line,
      unitPrice: money(line.unitPrice),
      subtotal: money(line.subtotal),
      discount: money(line.discount),
      total: money(line.total),
    })),
    subtotal: money(receipt.subtotal),
    discountTotal: money(receipt.discountTotal),
    total: money(receipt.total),
    discount: receipt.discount,
    payment: { type: receipt.payment.type as PaymentType, tendered: money(receipt.payment.tendered), change: money(receipt.payment.change) },
    createdAt: receipt.createdAt,
  };
}
