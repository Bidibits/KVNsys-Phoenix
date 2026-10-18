import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  addProduct,
  changeProduct,
  checkSession,
  findProduct,
  getProduct,
  listProducts,
  signIn,
  type ProductDetails,
  type ServerPin,
  type SessionPass,
} from '@kvnsys/client';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import {
  createServer,
  createServerCertificate,
  InstallSeed,
  lacksRight,
  ScryptPasswordHasher,
  SignInEnded,
  SwitchedOff,
  type ServerCertificate,
} from '@kvnsys/server';
import { ProductsPath } from '@kvnsys/wire';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { httpsJson } from './https.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const rice: ProductDetails = {
  code: 'PRD-0042',
  barcode: '4800016641503',
  name: 'Sack of rice 25kg',
  retailPrice: 145050,
  status: 'Active',
  description: null,
};

describeWithDatabase('products over HTTPS, through the client engine, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let certificate: ServerCertificate;
  let pin: ServerPin;
  const passes: Record<string, SessionPass> = {};

  async function addUser(username: string, roleCode: string): Promise<void> {
    const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
    await db.user.create({
      data: {
        id: randomUUID(),
        username,
        firstName: username,
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

  const as = (username: string) => ({ pass: passes[username]!, options: { pin } });

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: Password,
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
    await addUser('manager', 'MANAGER');
    await addUser('cashier', 'CASHIER');
    // A role that holds no rights at all.
    await db.role.create({ data: { id: randomUUID(), code: 'GUEST', name: 'Guest', level: 0 } });
    await addUser('guest', 'GUEST');

    certificate = await createServerCertificate();
    pin = { fingerprint256: certificate.fingerprint256, certificate: certificate.cert };
    app = await createServer({ logger: false, databaseUrl: database.url, certificate });
    await app.listen(0, '127.0.0.1');
    address = `https://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    for (const username of ['admin', 'manager', 'cashier', 'guest']) passes[username] = await passFor(username);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
  });

  it('lets an administrator add a product, which anyone with the right can then find', async () => {
    const { pass, options } = as('admin');
    const added = await addProduct(address, pass, rice, options);
    if (!added.ok) throw new Error(added.message);
    expect(added.product).toEqual({ ...rice, id: expect.stringMatching(/^[0-9a-f-]{36}$/) });

    const cashier = as('cashier');
    expect(await listProducts(address, cashier.pass, cashier.options)).toEqual({ ok: true, products: [added.product] });
    expect(await findProduct(address, cashier.pass, { code: 'prd-0042' }, cashier.options)).toEqual({ ok: true, product: added.product });
    expect(await findProduct(address, cashier.pass, { barcode: '4800016641503' }, cashier.options)).toEqual({ ok: true, product: added.product });
    expect(await getProduct(address, cashier.pass, added.product.id, cashier.options)).toEqual({ ok: true, product: added.product });

    const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
    expect(await db.product.findUniqueOrThrow({ where: { id: added.product.id } })).toMatchObject({ createdByUser: admin.id });
  });

  it('lets a manager change a product, to the centavo, and records who did', async () => {
    const { pass, options } = as('manager');
    const sardines = await addProduct(address, pass, { ...rice, code: 'PRD-0007', barcode: null, name: 'Sardines', retailPrice: 2575 }, options);
    if (!sardines.ok) throw new Error(sardines.message);
    const changed = await changeProduct(address, pass, sardines.product.id, { ...rice, code: 'PRD-0007', barcode: null, name: 'Sardines 155g', retailPrice: 29 }, options);
    expect(changed).toEqual({ ok: true, product: { ...sardines.product, name: 'Sardines 155g', retailPrice: 29 } });

    const manager = await db.user.findUniqueOrThrow({ where: { username: 'manager' } });
    const row = await db.product.findUniqueOrThrow({ where: { id: sardines.product.id } });
    expect(row.retailPrice.toFixed(2)).toBe('0.29');
    expect(row).toMatchObject({ createdByUser: manager.id, updatedByUser: manager.id });
  });

  it('lets a cashier look products up, but not add or change one', async () => {
    const { pass, options } = as('cashier');
    const refused = { ok: false, reason: 'not-allowed', message: lacksRight('products.manage') };
    expect(await addProduct(address, pass, { ...rice, code: 'PRD-0999', barcode: null }, options)).toEqual(refused);
    const existing = await findProduct(address, pass, { code: 'PRD-0042' }, options);
    if (!existing.ok) throw new Error(existing.message);
    expect(await changeProduct(address, pass, existing.product.id, { ...rice, retailPrice: 1 }, options)).toEqual(refused);
    expect((await getProduct(address, pass, existing.product.id, options)) as unknown).toMatchObject({ product: { retailPrice: 145050 } });
  });

  it('shows nothing to a role without the right to see products', async () => {
    const { pass, options } = as('guest');
    const refused = { ok: false, reason: 'not-allowed', message: lacksRight('products.view') };
    expect(await listProducts(address, pass, options)).toEqual(refused);
    expect(await findProduct(address, pass, { code: 'PRD-0042' }, options)).toEqual(refused);
  });

  it('turns away every call without a good pass, before reading anything else', async () => {
    const ended = { status: 401, body: { message: SignInEnded } };
    expect(await httpsJson(address + ProductsPath, { ca: certificate.cert })).toMatchObject(ended);
    expect(await httpsJson(address + ProductsPath, { ca: certificate.cert, method: 'POST', body: { nonsense: true } })).toMatchObject(ended);
    const madeUp = { token: 'made-up-made-up-made-up-made-up-made-up-mad', expiresAt: new Date().toISOString() };
    expect(await listProducts(address, madeUp, { pin })).toEqual({ ok: false, reason: 'ended', message: SignInEnded });
  });

  it("refuses details that break a rule, in the rule's own words", async () => {
    const { pass, options } = as('admin');
    expect(await addProduct(address, pass, { ...rice, code: 'PRD-0100', barcode: null, name: '  ' }, options)).toEqual({
      ok: false,
      reason: 'refused',
      message: 'A product needs a name.',
    });
    const post = (body: unknown) =>
      httpsJson(address + ProductsPath, { ca: certificate.cert, method: 'POST', body, headers: { Authorization: `Bearer ${pass.token}` } });
    const fields = { ...rice, code: 'PRD-0101', barcode: null };
    expect(await post({ ...fields, retailPrice: '12.555' })).toMatchObject({ status: 400, body: { message: expect.stringMatching(/isn't a price/) } });
    expect(await post({ ...fields, retailPrice: 12.5 })).toMatchObject({ status: 400 });
    expect(await post({ ...fields, retailPrice: '1,234.50' })).toMatchObject({ status: 201, body: { product: { retailPrice: '1234.50' } } });
  });

  it('refuses a code or barcode another product has, naming that product', async () => {
    const { pass, options } = as('admin');
    expect(await addProduct(address, pass, { ...rice, code: 'Prd-0042', barcode: null, name: 'Rice again' }, options)).toEqual({
      ok: false,
      reason: 'refused',
      message: 'Prd-0042 is already the code of Sack of rice 25kg.',
    });
  });

  it("says so when there's no such product", async () => {
    const { pass, options } = as('admin');
    expect(await findProduct(address, pass, { code: 'NOPE' }, options)).toEqual({
      ok: false,
      reason: 'not-found',
      message: 'No product has the code NOPE.',
    });
    expect(await getProduct(address, pass, 'not-an-id', options)).toMatchObject({ ok: false, reason: 'not-found' });
    expect(await changeProduct(address, pass, randomUUID(), rice, options)).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('finds by a code or a barcode, one at a time', async () => {
    const auth = { Authorization: `Bearer ${passes.admin!.token}` };
    expect(await httpsJson(`${address}${ProductsPath}/find`, { ca: certificate.cert, headers: auth })).toMatchObject({ status: 400 });
    expect(await httpsJson(`${address}${ProductsPath}/find?code=PRD-0042&barcode=4800016641503`, { ca: certificate.cert, headers: auth })).toMatchObject({
      status: 400,
    });
  });

  it('ends the pass of someone switched off, on their very next request', async () => {
    await addUser('leaving', 'CASHIER');
    const pass = await passFor('leaving');
    await db.user.update({ where: { username: 'leaving' }, data: { status: 'Inactive' } });
    expect(await listProducts(address, pass, { pin })).toEqual({ ok: false, reason: 'ended', message: SwitchedOff });
    // Switched back on, they sign in again: the old pass stays cancelled.
    await db.user.update({ where: { username: 'leaving' }, data: { status: 'Active' } });
    expect(await checkSession(address, pass, { pin })).toMatchObject({ ok: false, reason: 'ended' });
  });

  it("takes a right away at once, without waiting for the person's next sign-in", async () => {
    const { pass, options } = as('cashier');
    const cashierRole = await db.role.findUniqueOrThrow({ where: { code: 'CASHIER' } });
    await db.access.deleteMany({ where: { roleId: cashierRole.id, access: 'products.view' } });
    try {
      expect(await listProducts(address, pass, options)).toMatchObject({ ok: false, reason: 'not-allowed' });
    } finally {
      await db.access.create({ data: { id: randomUUID(), roleId: cashierRole.id, access: 'products.view' } });
    }
    expect(await listProducts(address, pass, options)).toMatchObject({ ok: true });
  });
});

describe('products on a server with no database', () => {
  it('says the server has no database, instead of failing', async () => {
    const certificate = await createServerCertificate();
    const app = await createServer({ logger: false, certificate });
    await app.listen(0, '127.0.0.1');
    try {
      const url = `https://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}${ProductsPath}`;
      expect(await httpsJson(url, { ca: certificate.cert })).toMatchObject({ status: 503, body: { message: expect.stringMatching(/database/) } });
    } finally {
      await app.close();
    }
  });
});
