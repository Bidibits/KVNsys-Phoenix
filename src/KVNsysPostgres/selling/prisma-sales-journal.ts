import {
  newId,
  parsePesos,
  pesosText,
  Refusal,
  SalesJournal,
  type CashPayment,
  type DiscountKind,
  type Lineage,
  type PaymentType,
  type PricedSale,
  type Receipt,
  type ReceiptSummary,
} from '@kvnsys/core';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { recordStockIn } from '../inventory/prisma-stock-ledger.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NoSuchShop = "That shop isn't known here.";
const withLines = { items: { orderBy: { lineNumber: 'asc' } }, payments: true } as const;

type Row = Prisma.ReceiptGetPayload<{ include: typeof withLines }>;

/** An exact numeric from the database, into centavos through text, never a float. */
function centavos(value: Prisma.Decimal): number {
  const amount = parsePesos(value.toFixed(2));
  if (amount === null) throw new Error(`${value.toString()} isn't an amount of money.`);
  return amount;
}

function toReceipt(row: Row): Receipt {
  const payment = row.payments[0];
  if (!payment) throw new Error(`Receipt ${row.code} has no payment.`);
  return {
    id: row.id,
    code: row.code,
    number: row.number,
    locationId: row.locationId,
    lines: row.items.map((item) => {
      const unitPrice = centavos(item.unitPrice);
      return {
        productId: item.productId,
        code: item.productCode,
        name: item.productName,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
        discount: centavos(item.discountValue),
        total: centavos(item.lineTotal),
      };
    }),
    subtotal: centavos(row.subtotal),
    discountTotal: centavos(row.discountTotal),
    total: centavos(row.total),
    discount:
      row.discountKind !== null
        ? { kind: row.discountKind as DiscountKind, idNumber: row.discountIdNumber ?? '', customerName: row.discountCustomerName ?? '' }
        : null,
    payment: { type: payment.paymentType as PaymentType, tendered: centavos(payment.amountTendered), change: centavos(payment.changeGiven) },
    createdAt: row.createdAtDate.toISOString(),
    createdByUser: row.createdByUser,
    machineId: row.createdAtMachine,
    shiftId: row.shiftId,
  };
}

/** A sale that adds up, line by line and in total, and a payment that covers it. KVNsysCore priced it; this checks nothing was lost on the way. */
function requireSound(sale: PricedSale, payment: CashPayment): void {
  const sum = (pick: (line: PricedSale['lines'][number]) => number) => sale.lines.reduce((total, line) => total + pick(line), 0);
  const linesAddUp = sale.lines.every((line) => line.subtotal === line.unitPrice * line.quantity && line.total === line.subtotal - line.discount);
  if (
    sale.lines.length === 0 ||
    !linesAddUp ||
    sum((line) => line.subtotal) !== sale.subtotal ||
    sum((line) => line.discount) !== sale.discountTotal ||
    sale.total !== sale.subtotal - sale.discountTotal ||
    payment.change !== payment.tendered - sale.total ||
    payment.change < 0
  ) {
    throw new Refusal('invalid', "That sale doesn't add up, so it wasn't recorded. Ring it up again.");
  }
}

/**
 * Sales, kept in PostgreSQL. Recording one is a single transaction: the next receipt number at the
 * shop, the receipt with its lines and payment, and the pieces out of the shop's stock through the
 * ledger. All of it is saved, or none. The database refuses to change or delete a receipt.
 */
export class PrismaSalesJournal extends SalesJournal {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async record(sale: PricedSale, payment: CashPayment, locationId: string, lineage: Lineage, shiftId: string | null = null): Promise<Receipt> {
    requireSound(sale, payment);
    if (!Uuid.test(locationId)) throw new Refusal('not-found', NoSuchShop);
    if (shiftId !== null && !Uuid.test(shiftId)) throw new Refusal('not-found', "That shift isn't there.");
    const id = newId();

    return this.db.$transaction(async (tx) => {
      // A sale goes into an open shift only. Sales share the shift's row; closing it waits for them,
      // and once it's closed, this refuses.
      if (shiftId !== null) {
        const [shift] = await tx.$queryRaw<{ status: string; code: string; location_id: string }[]>`
          SELECT status, code, location_id::text FROM shifts WHERE id = ${shiftId}::uuid FOR SHARE`;
        if (!shift || shift.location_id !== locationId) throw new Refusal('not-found', "That shift isn't there.");
        if (shift.status !== 'Open') throw new Refusal('conflict', `Shift ${shift.code} is closed. Start a new shift to sell.`);
      }
      // One sale at a time takes a shop's next number, so numbers never repeat or skip: a sale that
      // fails gives its number back with everything else. A lock of its own, not the shop's row,
      // so it never waits on anything stock does.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`receipts:${locationId}`}))`;
      const shop = await tx.location.findUnique({ where: { id: locationId }, select: { code: true } });
      if (!shop) throw new Refusal('not-found', NoSuchShop);
      const last = await tx.receipt.aggregate({ where: { locationId }, _max: { number: true } });
      const number = (last._max.number ?? 0) + 1;

      // The stock first: it refuses a product that isn't in the catalog, in words a person can act on.
      await recordStockIn(
        tx,
        sale.lines.map((line) => ({
          locationId,
          productId: line.productId,
          type: 'to_customer',
          quantityChange: -line.quantity,
          note: null,
          source: { table: 'receipts', id },
        })),
        lineage,
      );

      const created = {
        createdByUser: lineage.userId,
        createdAtMachine: lineage.machineId,
        createdAtLocation: lineage.locationId,
      };
      const row = await tx.receipt.create({
        data: {
          id,
          code: `${shop.code}-${String(number).padStart(6, '0')}`,
          shiftId,
          locationId,
          number,
          subtotal: pesosText(sale.subtotal),
          discountTotal: pesosText(sale.discountTotal),
          total: pesosText(sale.total),
          discountKind: sale.discount?.kind ?? null,
          discountIdNumber: sale.discount?.idNumber ?? null,
          discountCustomerName: sale.discount?.customerName ?? null,
          ...created,
          items: {
            create: sale.lines.map((line, index) => ({
              id: newId(),
              lineNumber: index + 1,
              productId: line.productId,
              productCode: line.code,
              productName: line.name,
              quantity: line.quantity,
              unitPrice: pesosText(line.unitPrice),
              discountValue: pesosText(line.discount),
              lineTotal: pesosText(line.total),
            })),
          },
          payments: {
            create: [
              {
                id: newId(),
                paymentType: payment.type,
                amountTendered: pesosText(payment.tendered),
                changeGiven: pesosText(payment.change),
                ...created,
              },
            ],
          },
        },
        include: withLines,
      });
      return toReceipt(row);
    });
  }

  async between(locationId: string, from: Date, to: Date): Promise<ReceiptSummary[]> {
    if (!Uuid.test(locationId)) return [];
    const rows = await this.db.receipt.findMany({
      where: { locationId, createdAtDate: { gte: from, lt: to } },
      orderBy: { number: 'asc' },
      include: { items: { select: { quantity: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      number: row.number,
      createdAt: row.createdAtDate.toISOString(),
      createdByUser: row.createdByUser,
      pieces: row.items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: centavos(row.subtotal),
      discountTotal: centavos(row.discountTotal),
      total: centavos(row.total),
      discountKind: row.discountKind,
    }));
  }

  async get(id: string): Promise<Receipt | null> {
    if (!Uuid.test(id)) return null;
    const row = await this.db.receipt.findUnique({ where: { id }, include: withLines });
    return row ? toReceipt(row) : null;
  }
}
