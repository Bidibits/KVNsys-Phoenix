import { randomUUID } from 'node:crypto';
import { priceSale, takeCash, type SaleProduct } from '@kvnsys/core';
import { createPrismaClient, PrismaSalesJournal, PrismaShiftBook, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

describeWithDatabase('shifts in PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let shifts: PrismaShiftBook;
  let journal: PrismaSalesJournal;
  let hq: string;
  let sardines: SaleProduct;
  const ana = randomUUID();
  const ben = randomUUID();
  const at = (userId: string) => ({ userId, machineId: null, locationId: hq });
  const sell = (userId: string, shiftId: string, quantity: number, discounted = false) => {
    const sale = priceSale([{ product: sardines, quantity }], discounted ? { kind: 'senior', idNumber: 'OSCA-1', customerName: 'Lola' } : null);
    return journal.record(sale, takeCash(sale.total, sale.total), hq, at(userId), shiftId);
  };

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    shifts = new PrismaShiftBook(db);
    journal = new PrismaSalesJournal(db);
    hq = (await db.location.create({ data: { id: randomUUID(), code: 'HQ', name: 'Head Office' } })).id;
    const id = randomUUID();
    await db.product.create({ data: { id, code: 'PRD-0007', name: 'Sardines 155g', retailPrice: '25.00' } });
    sardines = { id, code: 'PRD-0007', name: 'Sardines 155g', retailPrice: 2500, status: 'Active' };
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it("opens a person's shift with the cash in the drawer, numbered per shop, and one open at a time", async () => {
    const first = await shifts.open(ana, hq, 100000, at(ana));
    expect(first).toMatchObject({ code: 'HQ-S00001', status: 'Open', openingCash: 100000, openedBy: ana, cashSales: 0, receipts: 0, expectedCash: 100000, countedCash: null });
    await expect(shifts.open(ana, hq, 5000, at(ana))).rejects.toMatchObject({ kind: 'conflict', message: 'Your shift HQ-S00001 is still open. End it before starting another.' });
    expect((await shifts.open(ben, hq, 0, at(ben))).code).toBe('HQ-S00002');
    expect(await shifts.current(ana, hq)).toMatchObject({ id: first.id });
    expect(await shifts.current(randomUUID(), hq)).toBeNull();
  });

  it("adds up its receipts as it goes, and keeps what the drawer should hold when it's closed", async () => {
    const shift = await shifts.open(ana, hq, 100000, at(ana));
    await sell(ana, shift.id, 2);
    await sell(ana, shift.id, 1, true);
    expect(await shifts.current(ana, hq)).toMatchObject({ cashSales: 5000 + 2000, receipts: 2, discounts: 500, expectedCash: 107000 });
    const closed = await shifts.close(shift.id, 106500, 'one ₱5 coin missing', at(ben));
    expect(closed).toMatchObject({ status: 'Closed', expectedCash: 107000, countedCash: 106500, closedBy: ben, note: 'one ₱5 coin missing' });
    expect(closed.closedAt).not.toBeNull();
    expect(await shifts.current(ana, hq)).toBeNull();
    expect((await shifts.open(ana, hq, 0, at(ana))).code).toBe('HQ-S00002');
  });

  it('records nothing into a closed shift, and closes a shift only once', async () => {
    const shift = await shifts.open(ana, hq, 0, at(ana));
    await shifts.close(shift.id, 0, null, at(ana));
    await expect(sell(ana, shift.id, 1)).rejects.toMatchObject({ kind: 'conflict', message: 'Shift HQ-S00001 is closed. Start a new shift to sell.' });
    await expect(shifts.close(shift.id, 0, null, at(ana))).rejects.toMatchObject({ kind: 'conflict', message: 'Shift HQ-S00001 is already closed.' });
    await expect(sell(ana, randomUUID(), 1)).rejects.toMatchObject({ kind: 'not-found' });
    expect(await db.receipt.count()).toBe(0);
  });

  it('counts every sale that was being recorded as it closed, and none after', async () => {
    const shift = await shifts.open(ana, hq, 0, at(ana));
    const sales = Array.from({ length: 10 }, () => sell(ana, shift.id, 1).then(() => 'sold', () => 'refused'));
    const closed = await shifts.close(shift.id, 0, null, at(ana));
    const outcomes = await Promise.all(sales);
    const sold = outcomes.filter((outcome) => outcome === 'sold').length;
    expect(closed.cashSales).toBe(await db.receipt.count({ where: { shiftId: shift.id } }).then((n) => n * 2500));
    expect(closed.receipts).toBe(await db.receipt.count({ where: { shiftId: shift.id } }));
    expect(sold).toBe(closed.receipts);
  });

  it('keeps a closed shift as it was counted: the database refuses to change or remove one', async () => {
    const shift = await shifts.open(ana, hq, 1000, at(ana));
    await expect(db.shift.delete({ where: { id: shift.id } })).rejects.toThrow(/shifts is kept as it was closed/);
    await shifts.close(shift.id, 1000, null, at(ana));
    await expect(db.shift.update({ where: { id: shift.id }, data: { countedCash: '9999.00' } })).rejects.toThrow(/shifts is kept as it was closed/);
    await expect(db.shift.update({ where: { id: (await shifts.open(ana, hq, 0, at(ana))).id }, data: { status: 'Closed' } })).rejects.toThrow(/shifts_closed_is_counted/);
  });
});
