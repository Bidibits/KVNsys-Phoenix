import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  addProduct,
  getProductStock,
  listStock,
  recordStock,
  signIn,
  type HandMovement,
  type Product,
  type ServerPin,
  type SessionPass,
} from '@kvnsys/client';
import { createPrismaClient, PrismaSetupStore, PrismaStockLedger, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, lacksRight, ScryptPasswordHasher, type ServerCertificate } from '@kvnsys/server';
import { MovementsShown, StockMovementsPath, StockPath } from '@kvnsys/wire';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { httpsJson } from './https.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const ServerPc = { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' };

describeWithDatabase('stock over HTTPS, through the client engine, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let certificate: ServerCertificate;
  let pin: ServerPin;
  let shopId: string;
  let rice: Product;
  let sardines: Product;
  let soap: Product;
  const passes: Record<string, SessionPass> = {};

  /** A role made by hand, as a shop makes one: a new install has only the Administrator. */
  async function addRole(code: string, rights: string[]): Promise<void> {
    const role = await db.role.create({ data: { id: randomUUID(), code, name: code, level: 10 } });
    for (const access of rights) await db.access.create({ data: { id: randomUUID(), roleId: role.id, access } });
  }

  async function addUser(username: string, roleCode: string): Promise<void> {
    const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
    await db.user.create({
      data: {
        id: randomUUID(),
        username,
        firstName: username[0]!.toUpperCase() + username.slice(1),
        lastName: 'Tester',
        passwordHash: await new ScryptPasswordHasher().hash(Password),
        roleId: role.id,
      },
    });
  }

  async function passFor(username: string): Promise<SessionPass> {
    const result = await signIn(address, { username, password: Password }, { pin });
    if (!result.ok) throw new Error(`${username} couldn't sign in: ${result.message}`);
    return result.session;
  }

  async function newProduct(code: string, name: string): Promise<Product> {
    const added = await addProduct(address, passes.admin!, { code, barcode: null, name, retailPrice: 10000, status: 'Active', description: null }, { pin });
    if (!added.ok) throw new Error(added.message);
    return added.product;
  }

  const as = (username: string) => ({ pass: passes[username]!, options: { pin } });
  const received = (product: Product, pieces: number): HandMovement => ({ productId: product.id, type: 'from_supplier', quantityChange: pieces, note: null });
  const counted = (product: Product, change: number, note: string | null): HandMovement => ({ productId: product.id, type: 'adjustment', quantityChange: change, note });
  const stockOf = async (product: Product) => (await db.inventory.findUnique({ where: { locationId_productId: { locationId: shopId, productId: product.id } } }))?.stock ?? 0;

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
    // A second shop in the same database, as HQ will hold its branches': stock here must never land there.
    await db.location.create({ data: { id: randomUUID(), code: 'GUMACA', name: 'Gumaca branch' } });
    await addRole('STOCKMAN', ['stock.view', 'stock.receive', 'stock.adjust']);
    await addRole('RECEIVER', ['stock.view', 'stock.receive']);
    await addRole('LOOKER', ['stock.view']);
    await addRole('CASHIER', ['products.view']);
    await addUser('ana', 'STOCKMAN');
    await addUser('ben', 'RECEIVER');
    await addUser('cora', 'LOOKER');
    await addUser('dan', 'CASHIER');

    certificate = await createServerCertificate();
    pin = { fingerprint256: certificate.fingerprint256, certificate: certificate.cert };
    app = await createServer({ logger: false, databaseUrl: database.url, certificate, server: ServerPc });
    await app.listen(0, '127.0.0.1');
    address = `https://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    for (const username of ['admin', 'ana', 'ben', 'cora', 'dan']) passes[username] = await passFor(username);
    rice = await newProduct('PRD-0042', 'Sack of rice 25kg');
    sardines = await newProduct('PRD-0007', 'Sardines 155g');
    soap = await newProduct('PRD-0100', 'Bath soap');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
  });

  it("receives goods and puts a count right at the server's own shop, recording who did", async () => {
    const { pass, options } = as('ana');
    const saved = await recordStock(address, pass, [received(sardines, 24), counted(sardines, -2, ' counted 22 on the shelf ')], options);
    if (!saved.ok) throw new Error(saved.message);
    const ana = await db.user.findUniqueOrThrow({ where: { username: 'ana' } });
    expect(saved.movements).toMatchObject([
      { productId: sardines.id, type: 'from_supplier', quantityChange: 24, resultingOnHand: 24, note: null, source: null, createdBy: { id: ana.id, name: 'Ana Tester' } },
      { productId: sardines.id, type: 'adjustment', quantityChange: -2, resultingOnHand: 22, note: 'counted 22 on the shelf' },
    ]);
    expect(await stockOf(sardines)).toBe(22);
    const lines = await db.inventoryLog.findMany({ where: { productId: sardines.id } });
    expect(lines.every((l) => l.locationId === shopId && l.createdAtLocation === shopId && l.createdByUser === ana.id && l.createdAtMachine === null)).toBe(true);
  });

  it('lists every product with its stock, never-moved ones at 0, and the shop it belongs to', async () => {
    const { pass, options } = as('cora');
    const list = await listStock(address, pass, options);
    if (!list.ok) throw new Error(list.message);
    expect(list.shop).toEqual({ id: shopId, code: 'HQ', name: 'Head Office' });
    expect(list.items.map((item) => [item.product.name, item.stock])).toEqual([
      ['Bath soap', 0],
      ['Sack of rice 25kg', 0],
      ['Sardines 155g', 22],
    ]);
    expect(list.items[2]!.product).toEqual(sardines);
  });

  it("shows one product's stock and its movements, newest first", async () => {
    const { pass, options } = as('cora');
    const one = await getProductStock(address, pass, sardines.id, options);
    if (!one.ok) throw new Error(one.message);
    expect(one).toMatchObject({ product: sardines, stock: 22, more: false });
    expect(one.movements.map((m) => [m.type, m.quantityChange, m.resultingOnHand])).toEqual([
      ['adjustment', -2, 22],
      ['from_supplier', 24, 24],
    ]);
    expect(await getProductStock(address, pass, randomUUID(), options)).toEqual({ ok: false, reason: 'not-found', message: "That product isn't in the catalog." });
    expect(await getProductStock(address, pass, 'PRD-0007', options)).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('shows the newest movements only, and says there are older ones', async () => {
    const { pass, options } = as('ana');
    const delivery = Array.from({ length: MovementsShown + 1 }, () => received(soap, 1));
    expect(await recordStock(address, pass, delivery, options)).toMatchObject({ ok: true });
    const one = await getProductStock(address, pass, soap.id, options);
    if (!one.ok) throw new Error(one.message);
    expect(one).toMatchObject({ stock: MovementsShown + 1, more: true });
    expect(one.movements).toHaveLength(MovementsShown);
    expect(one.movements[0]!.resultingOnHand).toBe(MovementsShown + 1);
  });

  it("names nobody for a line saved by someone whose account isn't on this server", async () => {
    const fromHq = randomUUID();
    await new PrismaStockLedger(db).record(
      [{ locationId: shopId, productId: rice.id, type: 'from_supplier', quantityChange: 5, note: null, source: null }],
      { userId: fromHq, machineId: null, locationId: shopId },
    );
    const one = await getProductStock(address, as('cora').pass, rice.id, { pin });
    expect(one).toMatchObject({ ok: true, stock: 5, movements: [{ createdBy: { id: fromHq, name: null } }] });
  });

  it('lets a receiver take goods in, but not put a count right, and saves none of a batch with a line they may not record', async () => {
    const { pass, options } = as('ben');
    expect(await recordStock(address, pass, [received(rice, 10)], options)).toMatchObject({ ok: true, movements: [{ resultingOnHand: 15 }] });
    expect(await recordStock(address, pass, [received(rice, 10), counted(rice, -1, 'one torn sack')], options)).toEqual({
      ok: false,
      reason: 'not-allowed',
      message: lacksRight('stock.adjust'),
    });
    expect(await stockOf(rice)).toBe(15);
  });

  it('lets a looker see stock but not change it, and shows nothing to a role without the right to see it', async () => {
    const cora = as('cora');
    expect(await recordStock(address, cora.pass, [received(rice, 1)], cora.options)).toEqual({ ok: false, reason: 'not-allowed', message: lacksRight('stock.receive') });
    const dan = as('dan');
    const refused = { ok: false, reason: 'not-allowed', message: lacksRight('stock.view') };
    expect(await listStock(address, dan.pass, dan.options)).toEqual(refused);
    expect(await getProductStock(address, dan.pass, rice.id, dan.options)).toEqual(refused);
    // Even a line with a kind nobody may record by hand is refused for the right first.
    expect(await recordStock(address, dan.pass, [{ ...received(rice, -1), type: 'to_customer' as never }], dan.options)).toEqual(refused);
  });

  it('never takes goods out to a customer by hand: only a sale records those', async () => {
    const { pass, options } = as('admin');
    const sold = { productId: rice.id, type: 'to_customer', quantityChange: -1, note: null } as unknown as HandMovement;
    expect(await recordStock(address, pass, [sold], options)).toEqual({
      ok: false,
      reason: 'refused',
      message: 'Goods out to a customer are recorded by the sale, not by hand.',
    });
    expect(await stockOf(rice)).toBe(15);
  });

  it("holds every line to the ledger's rules, says which line broke one, and saves none of the batch", async () => {
    const { pass, options } = as('admin');
    expect(await recordStock(address, pass, [counted(rice, -1, '  ')], options)).toEqual({
      ok: false,
      reason: 'refused',
      message: 'Say why the count is being put right, such as "counted 22 on the shelf".',
    });
    expect(await recordStock(address, pass, [received(rice, 3), received(rice, 2.5)], options)).toEqual({
      ok: false,
      reason: 'refused',
      message: 'Line 2: Stock moves in whole pieces.',
    });
    expect(await recordStock(address, pass, [received(rice, 3), received({ ...rice, id: randomUUID() }, 1)], options)).toEqual({
      ok: false,
      reason: 'not-found',
      message: "That product isn't in the catalog.",
    });
    expect(await stockOf(rice)).toBe(15);
  });

  it('answers nothing without a pass, and nothing it cannot read', async () => {
    const list = await httpsJson(`${address}${StockPath}`, { ca: certificate.cert });
    expect(list.status).toBe(401);
    const garbage = await httpsJson(`${address}${StockMovementsPath}`, { ca: certificate.cert, method: 'POST', body: { lines: 'rice' } });
    expect(garbage.status).toBe(401);
    const understood = await httpsJson(`${address}${StockMovementsPath}`, {
      ca: certificate.cert,
      method: 'POST',
      body: { lines: 'rice' },
      headers: { Authorization: `Bearer ${passes.admin!.token}` },
    });
    expect(understood).toMatchObject({ status: 400, body: { message: "The stock movements didn't arrive in a form the server understands." } });
  });

  it('finds its shop by its hardware id even after its machine code changed, and refuses when it can tell neither', async () => {
    await db.machine.update({ where: { code: 'HQ-SRV' }, data: { code: 'RENAMED-SRV' } });
    try {
      expect(await listStock(address, as('cora').pass, { pin })).toMatchObject({ ok: true, shop: { code: 'HQ' } });

      const elsewhere = await createServer({ logger: false, databaseUrl: database.url, certificate, server: { hardwareId: 'another-pc', computerName: 'X' } });
      await elsewhere.listen(0, '127.0.0.1');
      try {
        const there = `https://127.0.0.1:${(elsewhere.getHttpServer().address() as AddressInfo).port}`;
        const pass = await signIn(there, { username: 'cora', password: Password }, { pin });
        if (!pass.ok) throw new Error(pass.message);
        expect(await listStock(there, pass.session, { pin })).toEqual({
          ok: false,
          reason: 'refused',
          message:
            "KVNsys Server can't tell which shop it serves: this PC isn't recorded as any shop's server. Was the database moved here from another PC?",
        });
      } finally {
        await elsewhere.close();
      }
    } finally {
      await db.machine.update({ where: { code: 'RENAMED-SRV' }, data: { code: 'HQ-SRV' } });
    }
  });
});
