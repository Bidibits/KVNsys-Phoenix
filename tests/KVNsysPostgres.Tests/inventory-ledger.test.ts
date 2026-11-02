import { randomUUID } from 'node:crypto';
import type { InventoryChange } from '@kvnsys/core';
import { createPrismaClient, PrismaInventoryLedger, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

describeWithDatabase('the stock ledger in PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let ledger: PrismaInventoryLedger;
  let hq: string;
  let branch: string;
  let rice: string;
  let sardines: string;
  const clerk = randomUUID();
  const lineage = () => ({ userId: clerk, machineId: null, locationId: hq });

  const location = async (code: string) => (await db.location.create({ data: { id: randomUUID(), code, name: code } })).id;
  const product = async (code: string, name: string) =>
    (await db.product.create({ data: { id: randomUUID(), code, name, retailPrice: '100.00' } })).id;
  const change = (productId: string, type: InventoryChange['type'], quantityChange: number, extra: Partial<InventoryChange> = {}): InventoryChange => ({
    locationId: hq,
    productId,
    type,
    quantityChange,
    note: type === 'adjustment' ? 'counted on the shelf' : null,
    source: null,
    ...extra,
  });
  /** What the database says, three ways: the running total, the last line's snapshot, and the sum of every line. */
  const threeWays = async (locationId: string, productId: string) => {
    const [row] = await db.$queryRaw<{ total: number | null; last: number | null; sum: bigint | null }[]>`
      SELECT (SELECT stock FROM inventory WHERE location_id = ${locationId}::uuid AND product_id = ${productId}::uuid) AS total,
             (SELECT resulting_on_hand FROM inventory_logs WHERE location_id = ${locationId}::uuid AND product_id = ${productId}::uuid
               ORDER BY created_at_date DESC, id DESC LIMIT 1) AS last,
             (SELECT sum(quantity_change) FROM inventory_logs WHERE location_id = ${locationId}::uuid AND product_id = ${productId}::uuid) AS sum`;
    return [row!.total, row!.last, row!.sum === null ? null : Number(row!.sum)];
  };

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    ledger = new PrismaInventoryLedger(db);
    hq = await location('HQ');
    branch = await location('GUMACA');
    rice = await product('PRD-0042', 'Sack of rice 25kg');
    sardines = await product('PRD-0007', 'Sardines 155g');
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it('records stock coming in and going out, each line knowing the stock after it, and on hand is their sum', async () => {
    const sale = randomUUID();
    const [inLine] = await ledger.record([change(sardines, 'from_supplier', 24)], lineage());
    const [outLine] = await ledger.record([change(sardines, 'to_customer', -3, { source: { table: 'sales', id: sale } })], lineage());
    expect(inLine).toMatchObject({ type: 'from_supplier', quantityChange: 24, resultingOnHand: 24, createdByUser: clerk, source: null });
    expect(outLine).toMatchObject({ type: 'to_customer', quantityChange: -3, resultingOnHand: 21, source: { table: 'sales', id: sale } });
    expect(await ledger.onHand(hq, sardines)).toBe(21);
    expect((await ledger.movements(hq, sardines)).map((m) => m.id)).toEqual([outLine!.id, inLine!.id]);
    expect(await threeWays(hq, sardines)).toEqual([21, 21, 21]);
    expect((await db.inventoryLog.findUniqueOrThrow({ where: { id: outLine!.id } })).createdAtLocation).toBe(hq);
  });

  it('saves a batch in the order given, the same product twice included', async () => {
    const lines = await ledger.record(
      [change(rice, 'from_supplier', 10), change(sardines, 'from_supplier', 5), change(rice, 'to_customer', -4)],
      lineage(),
    );
    expect(lines.map((l) => [l.productId, l.resultingOnHand])).toEqual([
      [rice, 10],
      [sardines, 5],
      [rice, 6],
    ]);
  });

  it('never loses a change when many happen at once', async () => {
    await ledger.record([change(rice, 'from_supplier', 100)], lineage());
    const sold = await Promise.all(Array.from({ length: 25 }, () => ledger.record([change(rice, 'to_customer', -1)], lineage())));
    expect(await ledger.onHand(hq, rice)).toBe(75);
    // Each sale saw the one before it: 99, 98 … 75, each exactly once.
    expect(sold.map(([line]) => line!.resultingOnHand).sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => 75 + i));
    expect(await threeWays(hq, rice)).toEqual([75, 75, 75]);
  });

  it("doesn't jam when two batches take the same products in opposite orders", async () => {
    await ledger.record([change(rice, 'from_supplier', 50), change(sardines, 'from_supplier', 50)], lineage());
    const jobs = Array.from({ length: 10 }, (_, i) =>
      ledger.record(i % 2 ? [change(rice, 'to_customer', -1), change(sardines, 'to_customer', -1)] : [change(sardines, 'to_customer', -1), change(rice, 'to_customer', -1)], lineage()),
    );
    await Promise.all(jobs);
    expect([await ledger.onHand(hq, rice), await ledger.onHand(hq, sardines)]).toEqual([40, 40]);
  });

  it('saves all of a batch or none of it', async () => {
    await expect(ledger.record([change(rice, 'from_supplier', 5), change(randomUUID(), 'from_supplier', 5)], lineage())).rejects.toMatchObject({
      kind: 'not-found',
      message: "That product isn't in the catalog.",
    });
    await expect(ledger.record([change(rice, 'from_supplier', 5), change(rice, 'adjustment', -1, { note: null })], lineage())).rejects.toMatchObject({
      kind: 'invalid',
    });
    await expect(ledger.record([change(rice, 'from_supplier', 5, { locationId: randomUUID() })], lineage())).rejects.toMatchObject({
      message: "That location isn't known here.",
    });
    expect(await ledger.onHand(hq, rice)).toBe(0);
    expect(await db.inventoryLog.count()).toBe(0);
  });

  it('keeps every line: the database refuses to change or delete one', async () => {
    const [line] = await ledger.record([change(rice, 'from_supplier', 5)], lineage());
    const appendOnly = /append-only/;
    await expect(db.inventoryLog.update({ where: { id: line!.id }, data: { quantityChange: 50 } })).rejects.toThrow(appendOnly);
    await expect(db.inventoryLog.deleteMany({})).rejects.toThrow(appendOnly);
    await expect(db.$executeRawUnsafe('TRUNCATE inventory_logs CASCADE')).rejects.toThrow(appendOnly);
    expect(await db.inventoryLog.count()).toBe(1);
  });

  it('lets stock go below zero, and the database refuses a zero, an unknown kind, or half a source', async () => {
    const [line] = await ledger.record([change(sardines, 'to_customer', -2)], lineage());
    expect(line!.resultingOnHand).toBe(-2);
    const insert = (quantity: number, type: string, sourceTable: string | null, sourceId: string | null) =>
      db.$executeRaw`INSERT INTO inventory_logs (id, location_id, product_id, quantity_change, movement_type, source_table, source_id, resulting_on_hand)
                     VALUES (${randomUUID()}::uuid, ${hq}::uuid, ${rice}::uuid, ${quantity}, ${type}, ${sourceTable}, ${sourceId}::uuid, 0)`;
    await expect(insert(0, 'adjustment', null, null)).rejects.toThrow(/inventory_logs_quantity_change_not_zero/);
    // The database takes SCHEMA-PLAN's seven kinds; anything else is refused.
    await expect(insert(1, 'theft', null, null)).rejects.toThrow(/inventory_logs_movement_type_known/);
    await expect(insert(1, 'from_supplier', 'sales', null)).rejects.toThrow(/inventory_logs_source_whole/);
  });

  it("keeps each location's stock separate, and lists a location's stock by product name", async () => {
    await ledger.record([change(rice, 'from_supplier', 7), change(sardines, 'from_supplier', 9)], lineage());
    await ledger.record([change(rice, 'from_supplier', 2, { locationId: branch })], lineage());
    expect(await ledger.levels(hq)).toEqual([
      { productId: rice, stock: 7 },
      { productId: sardines, stock: 9 },
    ]);
    expect(await ledger.levels(branch)).toEqual([{ productId: rice, stock: 2 }]);
    expect(await ledger.onHand(branch, sardines)).toBe(0);
  });

  it("hands back only a product's newest movements when asked for a few", async () => {
    const lines = [];
    for (const pieces of [5, 6, 7]) lines.push(...(await ledger.record([change(rice, 'from_supplier', pieces)], lineage())));
    expect((await ledger.movements(hq, rice, 2)).map((m) => m.quantityChange)).toEqual([7, 6]);
    expect(await ledger.movements(hq, rice)).toHaveLength(3);
  });

  it('refuses ids that are not KVNsys records', async () => {
    await expect(ledger.record([change('PRD-0042', 'from_supplier', 1)], lineage())).rejects.toMatchObject({ kind: 'not-found' });
    await expect(ledger.record([change(rice, 'to_customer', -1, { source: { table: 'sales', id: 'OR-1' } })], lineage())).rejects.toMatchObject({
      kind: 'invalid',
      message: "The document's id isn't one KVNsys made.",
    });
    expect(await ledger.onHand('nope', rice)).toBe(0);
    expect(await ledger.movements(hq, 'nope')).toEqual([]);
    expect(await ledger.record([], lineage())).toEqual([]);
  });

  it("lists every product's lines at a location, newest first, with names, a receipt's code, and whether there are older ones", async () => {
    const admin = await db.role.create({ data: { id: randomUUID(), code: 'R', name: 'R' } });
    await db.user.create({ data: { id: clerk, username: 'ana', firstName: 'Ana', lastName: 'Cruz', passwordHash: 'x', roleId: admin.id } });
    const receipt = randomUUID();
    await db.receipt.create({ data: { id: receipt, code: 'HQ-000001', locationId: hq, number: 1, subtotal: '100.00', discountTotal: '0.00', total: '100.00' } });
    // Saved one after the other: lines saved together share a moment, and their order then is the store's.
    await ledger.record([change(rice, 'from_supplier', 10)], lineage());
    await ledger.record([change(sardines, 'from_supplier', 24)], lineage());
    await ledger.record([change(sardines, 'to_customer', -1, { source: { table: 'receipts', id: receipt } })], lineage());
    await ledger.record([change(rice, 'from_supplier', 5, { locationId: branch })], { ...lineage(), locationId: branch });

    const { lines, more } = await ledger.log(hq, 10);
    expect(more).toBe(false);
    expect(lines.map((line) => [line.productCode, line.quantityChange, line.resultingOnHand])).toEqual([
      ['PRD-0007', -1, 23],
      ['PRD-0007', 24, 24],
      ['PRD-0042', 10, 10],
    ]);
    expect(lines[0]).toMatchObject({
      locationName: 'HQ',
      productName: 'Sardines 155g',
      source: { table: 'receipts', id: receipt },
      sourceName: 'HQ-000001',
      createdBy: 'Ana Cruz (ana)',
      createdMachine: null,
      createdLocation: 'HQ',
    });
    expect(lines[1]!.sourceName).toBeNull();

    const newest = await ledger.log(hq, 2);
    expect([newest.lines.length, newest.more]).toEqual([2, true]);
    expect(await ledger.log('nope', 10)).toEqual({ lines: [], more: false });
  });
});
