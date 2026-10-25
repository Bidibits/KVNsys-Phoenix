import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { findSaleProduct, getReceipt, listDaySales, openShift, recordSale, signIn, type SaleProduct, type ServerPin, type SessionPass } from '@kvnsys/client';
import { priceSale, shopDate, takeCash } from '@kvnsys/core';
import { createPrismaClient, PrismaSalesJournal, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, lacksRight, ScryptPasswordHasher, type ServerCertificate } from '@kvnsys/server';
import { SalesPath } from '@kvnsys/wire';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { httpsJson } from './https.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const ServerPc = { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' };

describeWithDatabase('selling over HTTPS, through the client engine, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let certificate: ServerCertificate;
  let pin: ServerPin;
  let shopId: string;
  let sardines: SaleProduct;
  let rice: SaleProduct;
  const passes: Record<string, SessionPass> = {};

  async function addRole(code: string, rights: string[]): Promise<void> {
    const role = await db.role.create({ data: { id: randomUUID(), code, name: code, level: 10 } });
    for (const access of rights) await db.access.create({ data: { id: randomUUID(), roleId: role.id, access } });
  }

  async function addUser(username: string, firstName: string, roleCode: string): Promise<void> {
    const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username, firstName, lastName: 'Cruz', passwordHash, roleId: role.id } });
  }

  async function product(code: string, barcode: string | null, name: string, price: string, status = 'Active'): Promise<SaleProduct> {
    const id = randomUUID();
    await db.product.create({ data: { id, code, barcode, name, retailPrice: price, status } });
    return { id, code, name, retailPrice: Math.round(Number(price) * 100), status: status as SaleProduct['status'] };
  }

  const as = (username: string) => ({ pass: passes[username]!, options: { pin } });
  const stockOf = async (p: SaleProduct) => (await db.inventory.findUnique({ where: { locationId_productId: { locationId: shopId, productId: p.id } } }))?.stock ?? 0;

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: Password,
      server: ServerPc,
    });
    shopId = (await db.location.findUniqueOrThrow({ where: { code: 'HQ' } })).id;
    await addRole('CASHIER', ['sales.sell']);
    await addRole('STOCKMAN', ['stock.view', 'stock.receive', 'products.view']);
    await addRole('OWNER', ['sales.view']);
    await addUser('ana', 'Ana', 'CASHIER');
    await addUser('ben', 'Ben', 'STOCKMAN');
    await addUser('cora', 'Cora', 'OWNER');
    sardines = await product('PRD-0007', '4800249211116', 'Sardines 155g', '25.75');
    rice = await product('PRD-0042', null, 'Sack of rice 25kg', '1450.50');

    certificate = await createServerCertificate();
    pin = { fingerprint256: certificate.fingerprint256, certificate: certificate.cert };
    app = await createServer({ logger: false, databaseUrl: database.url, certificate, server: ServerPc });
    await app.listen(0, '127.0.0.1');
    address = `https://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    for (const username of ['ana', 'ben', 'cora']) {
      const result = await signIn(address, { username, password: Password }, { pin });
      if (!result.ok) throw new Error(result.message);
      passes[username] = result.session;
    }
    // Ana's drawer: she can't sell without a shift.
    const shift = await openShift(address, passes.ana!, '1000', { pin });
    if (!shift.ok) throw new Error(shift.message);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
  });

  it('finds what a cashier scans or types, by barcode or code, capitals ignored', async () => {
    const { pass, options } = as('ana');
    expect(await findSaleProduct(address, pass, '4800249211116', options)).toEqual({ ok: true, product: sardines });
    expect(await findSaleProduct(address, pass, ' prd-0042 ', options)).toEqual({ ok: true, product: rice });
    expect(await findSaleProduct(address, pass, 'PRD-9999', options)).toEqual({ ok: false, reason: 'not-found', message: 'No product has the code or barcode PRD-9999.' });
  });

  it("rings up a sale at the server's own shop: numbered, discounted, paid, and the pieces out of stock", async () => {
    const { pass, options } = as('ana');
    const cart = [{ product: sardines, quantity: 3 }, { product: rice, quantity: 1 }];
    const sold = await recordSale(address, pass, { cart, discount: { kind: 'senior', idNumber: ' OSCA-1 ', customerName: 'Lola Cruz' }, tendered: '1,500' }, options);
    if (!sold.ok) throw new Error(sold.message);
    expect(sold).toMatchObject({
      shop: { code: 'HQ', name: 'Head Office' },
      cashier: 'Ana Cruz',
      receipt: {
        code: 'HQ-000001',
        subtotal: 152775,
        discountTotal: 30555,
        total: 122220,
        discount: { kind: 'senior', idNumber: 'OSCA-1', customerName: 'Lola Cruz' },
        payment: { type: 'Cash', tendered: 150000, change: 27780 },
      },
    });
    expect([await stockOf(sardines), await stockOf(rice)]).toEqual([-3, -1]);
    const ana = await db.user.findUniqueOrThrow({ where: { username: 'ana' } });
    expect(await db.receipt.findUniqueOrThrow({ where: { id: sold.receipt.id } })).toMatchObject({ locationId: shopId, settledByUser: ana.id, settledAtLocation: shopId });
  });

  it("refuses a sale whose price changed after it was rung up, and records nothing", async () => {
    const { pass, options } = as('ana');
    await db.product.update({ where: { id: sardines.id }, data: { retailPrice: '30.00' } });
    try {
      // The register still holds the old price.
      expect(await recordSale(address, pass, { cart: [{ product: sardines, quantity: 2 }], discount: null, tendered: '100' }, options)).toEqual({
        ok: false,
        reason: 'refused',
        message: 'A price changed while this sale was being rung up: it now comes to ₱60.00, not ₱51.50. Check the cart, then take payment again.',
      });
      expect(await db.receipt.count()).toBe(1);
    } finally {
      await db.product.update({ where: { id: sardines.id }, data: { retailPrice: '25.75' } });
    }
  });

  it("never takes the register's word for a price: a total sent low is refused", async () => {
    const response = await httpsJson(`${address}${SalesPath}`, {
      ca: certificate.cert,
      method: 'POST',
      headers: { Authorization: `Bearer ${passes.ana!.token}` },
      body: { lines: [{ productId: rice.id, quantity: 1 }], discount: null, tendered: '1.00', expectedTotal: '1.00' },
    });
    expect(response).toMatchObject({ status: 409, body: { message: /it now comes to ₱1,450.50, not ₱1.00/ } });
    expect(await db.receipt.count()).toBe(1);
  });

  it("refuses short cash, a product that can't be sold, or one that isn't there, and records nothing", async () => {
    const { pass, options } = as('ana');
    const post = (body: object) => httpsJson(`${address}${SalesPath}`, { ca: certificate.cert, method: 'POST', headers: { Authorization: `Bearer ${pass.token}` }, body });
    expect(await post({ lines: [{ productId: rice.id, quantity: 1 }], discount: null, tendered: '1000.00', expectedTotal: '1450.50' })).toMatchObject({
      status: 400,
      body: { message: "₱1,000.00 isn't enough: the total is ₱1,450.50." },
    });
    const old = await product('PRD-0001', null, 'Old stock', '10.00', 'Inactive');
    expect(await recordSale(address, pass, { cart: [{ product: { ...old, status: 'Active' }, quantity: 1 }], discount: null, tendered: '10' }, options)).toEqual({
      ok: false,
      reason: 'refused',
      message: "Old stock is switched off, so it can't be sold.",
    });
    expect(await post({ lines: [{ productId: randomUUID(), quantity: 1 }], discount: null, tendered: '10.00', expectedTotal: '10.00' })).toMatchObject({
      status: 404,
      body: { message: "That product isn't in the catalog." },
    });
    expect(await post({ lines: [], discount: null, tendered: '10.00', expectedTotal: '10.00' })).toMatchObject({ status: 400 });
    expect(await db.receipt.count()).toBe(1);
  });

  it('lets only a role with the right to sell find or ring up anything, and nobody without a pass', async () => {
    const { pass, options } = as('ben');
    const refused = { ok: false, reason: 'not-allowed', message: lacksRight('sales.sell') };
    expect(await findSaleProduct(address, pass, 'PRD-0007', options)).toEqual(refused);
    expect(await recordSale(address, pass, { cart: [{ product: sardines, quantity: 1 }], discount: null, tendered: '100' }, options)).toEqual(refused);
    expect((await httpsJson(`${address}${SalesPath}`, { ca: certificate.cert, method: 'POST', body: {} })).status).toBe(401);
    expect(await db.receipt.count()).toBe(1);
  });

  it('numbers the next sale on from the last, with no gap left by the refused ones', async () => {
    const sold = await recordSale(address, passes.ana!, { cart: [{ product: sardines, quantity: 1 }], discount: null, tendered: '25.75' }, { pin });
    expect(sold).toMatchObject({ ok: true, receipt: { code: 'HQ-000002', payment: { change: 0 } } });
  });

  it("shows today's receipts at this shop, with what they came to, to someone who may see sales", async () => {
    const { pass, options } = as('cora');
    const today = await listDaySales(address, pass, null, options);
    if (!today.ok) throw new Error(today.message);
    expect(today.date).toBe(shopDate(new Date()));
    expect(today.receipts.map((r) => [r.code, r.cashier, r.pieces, r.total, r.discountKind])).toEqual([
      ['HQ-000001', 'Ana Cruz', 4, 122220, 'senior'],
      ['HQ-000002', 'Ana Cruz', 1, 2575, null],
    ]);
    expect(today.totals).toEqual({ receipts: 2, pieces: 5, subtotal: 152775 + 2575, discountTotal: 30555, total: 122220 + 2575 });
    expect(await listDaySales(address, pass, today.date, options)).toEqual(today);
    expect(await listDaySales(address, pass, '2026-01-01', options)).toMatchObject({ ok: true, date: '2026-01-01', receipts: [], totals: { receipts: 0, total: 0 } });
    expect(await listDaySales(address, pass, '2026-02-30', options)).toEqual({ ok: false, reason: 'refused', message: `"2026-02-30" isn't a date. Pick one from the calendar.` });
  });

  it("opens one of this shop's receipts again, but never another shop's", async () => {
    const { pass, options } = as('cora');
    const day = await listDaySales(address, pass, null, options);
    if (!day.ok) throw new Error(day.message);
    expect(await getReceipt(address, pass, day.receipts[0]!.id, options)).toMatchObject({
      ok: true,
      cashier: 'Ana Cruz',
      shop: { code: 'HQ' },
      receipt: { code: 'HQ-000001', total: 122220, discount: { idNumber: 'OSCA-1' } },
    });

    // A sale at another shop in the same database, as HQ will hold its branches' some day.
    const branch = await db.location.create({ data: { id: randomUUID(), code: 'GUMACA', name: 'Gumaca branch' } });
    const sale = priceSale([{ product: sardines, quantity: 1 }], null);
    const elsewhere = await new PrismaSalesJournal(db).record(sale, takeCash(sale.total, sale.total), branch.id, { userId: randomUUID(), machineId: null, locationId: branch.id });
    expect(await getReceipt(address, pass, elsewhere.id, options)).toEqual({ ok: false, reason: 'not-found', message: "That receipt isn't one this shop gave." });
    expect((await listDaySales(address, pass, null, options)) as { receipts: unknown[] }).toMatchObject({ receipts: { length: 2 } });
    expect(await getReceipt(address, pass, randomUUID(), options)).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('keeps the day\'s sales from a cashier who may only sell', async () => {
    const { pass, options } = as('ana');
    const refused = { ok: false, reason: 'not-allowed', message: lacksRight('sales.view') };
    expect(await listDaySales(address, pass, null, options)).toEqual(refused);
    const sold = await db.receipt.findFirstOrThrow({ where: { code: 'HQ-000001' } });
    expect(await getReceipt(address, pass, sold.id, options)).toEqual(refused);
  });
});
