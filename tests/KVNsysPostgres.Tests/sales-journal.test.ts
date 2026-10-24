import { randomUUID } from 'node:crypto';
import { priceSale, takeCash, type PricedSale, type SaleProduct } from '@kvnsys/core';
import { createPrismaClient, PrismaSalesJournal, PrismaStockLedger, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

describeWithDatabase('the record of sales in PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let journal: PrismaSalesJournal;
  let ledger: PrismaStockLedger;
  let hq: string;
  let branch: string;
  let sardines: SaleProduct;
  let rice: SaleProduct;
  const cashier = randomUUID();
  const at = (locationId: string) => ({ userId: cashier, machineId: null, locationId });

  const shop = async (code: string) => (await db.location.create({ data: { id: randomUUID(), code, name: code } })).id;
  const product = async (code: string, name: string, retailPrice: number): Promise<SaleProduct> => {
    const id = randomUUID();
    await db.product.create({ data: { id, code, name, retailPrice: (retailPrice / 100).toFixed(2) } });
    return { id, code, name, retailPrice, status: 'Active' };
  };
  /** Rings up a sale paid with exact cash, or with what's given. */
  const sell = (sale: PricedSale, locationId = hq, tendered = sale.total) => journal.record(sale, takeCash(sale.total, tendered), locationId, at(locationId));

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    journal = new PrismaSalesJournal(db);
    ledger = new PrismaStockLedger(db);
    hq = await shop('HQ');
    branch = await shop('GUMACA');
    sardines = await product('PRD-0007', 'Sardines 155g', 2575);
    rice = await product('PRD-0042', 'Sack of rice 25kg', 145050);
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it('records a sale whole: its receipt, lines and payment, and takes its pieces out of stock', async () => {
    await ledger.record([{ locationId: hq, productId: sardines.id, type: 'from_supplier', quantityChange: 24, note: null, source: null }], at(hq));
    const sale = priceSale([{ product: sardines, quantity: 3 }, { product: rice, quantity: 1 }], { kind: 'senior', idNumber: 'OSCA-1', customerName: 'Lola Cruz' });
    const receipt = await sell(sale, hq, 150000);

    expect(receipt).toMatchObject({
      code: 'HQ-000001',
      number: 1,
      locationId: hq,
      ...sale,
      payment: { type: 'Cash', tendered: 150000, change: 27780 },
      createdByUser: cashier,
    });
    expect(await journal.get(receipt.id)).toEqual(receipt);
    // Rice was never received: it goes below zero, and the ledger says so.
    expect([await ledger.onHand(hq, sardines.id), await ledger.onHand(hq, rice.id)]).toEqual([21, -1]);
    const [out] = await ledger.movements(hq, sardines.id, 1);
    expect(out).toMatchObject({ type: 'to_customer', quantityChange: -3, resultingOnHand: 21, source: { table: 'receipts', id: receipt.id } });
  });

  it("keeps the code, name and price as sold, whatever happens to the product afterwards", async () => {
    const receipt = await sell(priceSale([{ product: sardines, quantity: 2 }], null));
    await db.product.update({ where: { id: sardines.id }, data: { name: 'Sardines 155g (new label)', retailPrice: '30.00' } });
    expect((await journal.get(receipt.id))!.lines[0]).toMatchObject({ name: 'Sardines 155g', unitPrice: 2575, total: 5150 });
  });

  it('numbers receipts from 1 at each shop, with no gaps, even after a sale that failed', async () => {
    const one = priceSale([{ product: sardines, quantity: 1 }], null);
    expect((await sell(one)).code).toBe('HQ-000001');
    expect((await sell(one, branch)).code).toBe('GUMACA-000001');

    const missing = { ...sardines, id: randomUUID() };
    await expect(sell(priceSale([{ product: sardines, quantity: 1 }, { product: missing, quantity: 1 }], null))).rejects.toMatchObject({
      kind: 'not-found',
      message: "That product isn't in the catalog.",
    });
    expect((await sell(one)).code).toBe('HQ-000002');
    // The failed sale left nothing behind: no receipt, and no stock line.
    expect(await db.receipt.count()).toBe(3);
    expect(await db.inventoryLog.count()).toBe(3);
  });

  it('gives many registers selling at once each their own number, one after another', async () => {
    const one = priceSale([{ product: sardines, quantity: 1 }, { product: rice, quantity: 1 }], null);
    const receipts = await Promise.all(Array.from({ length: 20 }, () => sell(one)));
    expect(receipts.map((r) => r.number).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await ledger.onHand(hq, sardines.id)).toBe(-20);
  });

  it("refuses a sale that doesn't add up, and records nothing", async () => {
    const sale = priceSale([{ product: sardines, quantity: 2 }], null);
    const message = "That sale doesn't add up, so it wasn't recorded. Ring it up again.";
    await expect(journal.record({ ...sale, total: sale.total - 1 }, takeCash(sale.total, sale.total), hq, at(hq))).rejects.toMatchObject({ message });
    await expect(journal.record(sale, { type: 'Cash', tendered: 10000, change: 9999 }, hq, at(hq))).rejects.toMatchObject({ message });
    const tampered = { ...sale, lines: [{ ...sale.lines[0]!, quantity: 1 }] };
    await expect(journal.record(tampered, takeCash(sale.total, sale.total), hq, at(hq))).rejects.toMatchObject({ message });
    await expect(sell(sale, randomUUID())).rejects.toMatchObject({ kind: 'not-found', message: "That shop isn't known here." });
    expect(await db.receipt.count()).toBe(0);
  });

  it('keeps every receipt as it was given: the database refuses to change or remove one', async () => {
    const receipt = await sell(priceSale([{ product: sardines, quantity: 1 }], null));
    await expect(db.receipt.update({ where: { id: receipt.id }, data: { total: '0.00' } })).rejects.toThrow(/receipts is kept as it was given/);
    await expect(db.receipt.delete({ where: { id: receipt.id } })).rejects.toThrow(/receipts is kept as it was given/);
    await expect(db.receiptItem.updateMany({ data: { quantity: 9 } })).rejects.toThrow(/receipt_items is kept as it was given/);
    await expect(db.receiptPayment.deleteMany({})).rejects.toThrow(/receipt_payments is kept as it was given/);
    await expect(db.$executeRawUnsafe('TRUNCATE receipt_items')).rejects.toThrow(/receipt_items is kept as it was given/);
    expect(await journal.get(receipt.id)).toEqual(receipt);
  });

  it("refuses, in the database itself, a receipt that doesn't add up or a discount that names nobody", async () => {
    const insert = (total: string, kind: string | null, idNumber: string | null) =>
      db.$executeRaw`INSERT INTO receipts (id, code, location_id, number, subtotal, discount_total, total, discount_kind, discount_id_number, discount_customer_name)
                     VALUES (${randomUUID()}::uuid, ${randomUUID()}, ${hq}::uuid, 99, 100.00, 20.00, ${total}::numeric, ${kind}, ${idNumber}, ${kind ? 'Lola' : null})`;
    await expect(insert('90.00', 'senior', 'OSCA-1')).rejects.toThrow(/receipts_total_adds_up/);
    await expect(insert('80.00', 'senior', null)).rejects.toThrow(/receipts_discount_whole/);
    await expect(insert('80.00', 'student', 'X-1')).rejects.toThrow(/receipts_discount_whole/);
    expect(await insert('80.00', 'senior', 'OSCA-1')).toBe(1);
  });

  it("lists a shop's receipts paid within a time, oldest first, from its start up to but not including its end", async () => {
    const one = await sell(priceSale([{ product: sardines, quantity: 2 }, { product: rice, quantity: 1 }], null));
    const two = await sell(priceSale([{ product: sardines, quantity: 1 }], { kind: 'pwd', idNumber: 'PWD-1', customerName: 'Juan' }));
    await sell(priceSale([{ product: rice, quantity: 5 }], null), branch);
    const hour = 60 * 60 * 1000;
    const now = Date.now();
    const listed = await journal.between(hq, new Date(now - hour), new Date(now + hour));
    expect(listed).toEqual([
      { id: one.id, code: 'HQ-000001', number: 1, createdAt: one.createdAt, createdByUser: cashier, pieces: 3, subtotal: 150200, discountTotal: 0, total: 150200, discountKind: null },
      { id: two.id, code: 'HQ-000002', number: 2, createdAt: two.createdAt, createdByUser: cashier, pieces: 1, subtotal: 2575, discountTotal: 515, total: 2060, discountKind: 'pwd' },
    ]);
    expect((await journal.between(hq, new Date(one.createdAt), new Date(two.createdAt))).map((r) => r.code)).toEqual(
      one.createdAt === two.createdAt ? [] : ['HQ-000001'],
    );
    expect(await journal.between(hq, new Date(now + hour), new Date(now + 2 * hour))).toEqual([]);
    expect((await journal.between(branch, new Date(now - hour), new Date(now + hour))).map((r) => r.code)).toEqual(['GUMACA-000001']);
    expect(await journal.between('nope', new Date(now - hour), new Date(now + hour))).toEqual([]);
  });

  it("hands back nothing for an id that isn't a receipt", async () => {
    expect(await journal.get(randomUUID())).toBeNull();
    expect(await journal.get('HQ-000001')).toBeNull();
  });
});
