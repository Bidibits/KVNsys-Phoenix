import { newId, parsePesos, pesosText, Refusal, ShiftBook, type Lineage, type Shift, type ShiftStatus } from '@kvnsys/core';
import type { Prisma, PrismaClient, Shift as ShiftRow } from '../generated/prisma/client.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NotThere = "That shift isn't there.";

function centavos(value: Prisma.Decimal): number {
  const amount = parsePesos(value.toFixed(2));
  if (amount === null) throw new Error(`${value.toString()} isn't an amount of money.`);
  return amount;
}

/** What a shift's receipts have taken: cash sales (every sale is cash, for now), how many, and the discounts given. */
async function takings(db: Prisma.TransactionClient | PrismaClient, shiftId: string) {
  const sum = await db.receipt.aggregate({ where: { shiftId }, _sum: { total: true, discountTotal: true }, _count: true });
  return {
    cashSales: sum._sum.total ? centavos(sum._sum.total) : 0,
    discounts: sum._sum.discountTotal ? centavos(sum._sum.discountTotal) : 0,
    receipts: sum._count,
  };
}

function toShift(row: ShiftRow, sold: Awaited<ReturnType<typeof takings>>): Shift {
  const openingCash = centavos(row.openingCash);
  return {
    id: row.id,
    code: row.code,
    number: row.number,
    locationId: row.locationId,
    status: row.status as ShiftStatus,
    openingCash,
    openedBy: row.openedByUser ?? '',
    openedAt: row.openedAtDate.toISOString(),
    ...sold,
    // A closed shift keeps what it should have held when it was counted; an open one is worked out now.
    expectedCash: row.expectedCash !== null ? centavos(row.expectedCash) : openingCash + sold.cashSales,
    countedCash: row.countedCash !== null ? centavos(row.countedCash) : null,
    closedBy: row.closedByUser,
    closedAt: row.closedAtDate?.toISOString() ?? null,
    note: row.description,
  };
}

/**
 * Shifts, kept in PostgreSQL. Opening takes the shop's next number (one at a time, on a lock of its
 * own) and refuses a second open shift for the same person. Closing locks the shift's row, so a sale
 * being recorded in it finishes first, and nothing is recorded in it after.
 */
export class PrismaShiftBook extends ShiftBook {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async current(userId: string, locationId: string): Promise<Shift | null> {
    if (!Uuid.test(userId) || !Uuid.test(locationId)) return null;
    const row = await this.db.shift.findFirst({ where: { locationId, openedByUser: userId, status: 'Open' } });
    return row ? toShift(row, await takings(this.db, row.id)) : null;
  }

  async open(userId: string, locationId: string, openingCash: number, lineage: Lineage): Promise<Shift> {
    if (!Uuid.test(locationId)) throw new Refusal('not-found', "That shop isn't known here.");
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shifts:${locationId}`}))`;
      const already = await tx.shift.findFirst({ where: { locationId, openedByUser: userId, status: 'Open' } });
      if (already) throw new Refusal('conflict', `Your shift ${already.code} is still open. End it before starting another.`);
      const shop = await tx.location.findUnique({ where: { id: locationId }, select: { code: true } });
      if (!shop) throw new Refusal('not-found', "That shop isn't known here.");
      const last = await tx.shift.aggregate({ where: { locationId }, _max: { number: true } });
      const number = (last._max.number ?? 0) + 1;
      const row = await tx.shift.create({
        data: {
          id: newId(),
          code: `${shop.code}-S${String(number).padStart(5, '0')}`,
          locationId,
          number,
          openingCash: pesosText(openingCash),
          openedByUser: userId,
          openedAtMachine: lineage.machineId,
          openedAtLocation: lineage.locationId,
        },
      });
      return toShift(row, { cashSales: 0, discounts: 0, receipts: 0 });
    });
  }

  async close(id: string, countedCash: number, note: string | null, lineage: Lineage): Promise<Shift> {
    if (!Uuid.test(id)) throw new Refusal('not-found', NotThere);
    return this.db.$transaction(async (tx) => {
      // Waits for any sale being recorded in it; once closed, no sale can be recorded in it.
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM shifts WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked) throw new Refusal('not-found', NotThere);
      const row = await tx.shift.findUniqueOrThrow({ where: { id } });
      if (row.status !== 'Open') throw new Refusal('conflict', `Shift ${row.code} is already closed.`);
      const sold = await takings(tx, id);
      const closed = await tx.shift.update({
        where: { id },
        data: {
          status: 'Closed',
          expectedCash: pesosText(centavos(row.openingCash) + sold.cashSales),
          countedCash: pesosText(countedCash),
          description: note,
          closedByUser: lineage.userId,
          closedAtMachine: lineage.machineId,
          closedAtLocation: lineage.locationId,
          closedAtDate: new Date(),
        },
      });
      return toShift(closed, sold);
    });
  }

  async get(id: string): Promise<Shift | null> {
    if (!Uuid.test(id)) return null;
    const row = await this.db.shift.findUnique({ where: { id } });
    return row ? toShift(row, await takings(this.db, row.id)) : null;
  }
}
