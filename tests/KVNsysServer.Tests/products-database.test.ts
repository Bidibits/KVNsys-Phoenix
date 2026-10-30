import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  addProduct,
  changeProduct,
  checkSession,
  findProduct,
  getProduct,
  getProductPicture,
  listProducts,
  loadProductForm,
  saveProductForm,
  signIn,
  type ProductDetails,
  type ServerPin,
  type SessionPass,
} from '@kvnsys/client';
import { ProductDefaults } from '@kvnsys/core';
import { createPrismaClient, PrismaCatalogBook, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
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
  ...ProductDefaults,
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
    await addRole('MANAGER', ['products.view', 'products.manage']);
    await addRole('CASHIER', ['products.view']);
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
    expect(added.product).toEqual({ ...rice, id: expect.stringMatching(/^[0-9a-f-]{36}$/), hasPicture: false });

    const cashier = as('cashier');
    // The list says who added it, and that nobody has changed it since.
    expect(await listProducts(address, cashier.pass, cashier.options)).toEqual({
      ok: true,
      products: [{ ...added.product, history: expect.objectContaining({ createdBy: 'System Administrator (admin)', updatedAt: null, updatedBy: null }) }],
    });
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
    const fields = { ...rice, code: 'PRD-0101', barcode: null, costPrice: '0.00' };
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

  /** The start of a real JPEG, then filler, as base64 text: enough for KVNsysCore's check. */
  const jpegText = (length: number, fill = 0x20) =>
    Buffer.from(Uint8Array.from({ length }, (_, i) => [0xff, 0xd8, 0xff, 0xe0][i] ?? fill)).toString('base64');

  it('keeps every field and the picture through the form, with each picker offering what is switched on', async () => {
    const { pass, options } = as('manager');
    const book = new PrismaCatalogBook(db);
    const lineage = { userId: null, machineId: null, locationId: null };
    const entry = (code: string, name: string, extra = {}) => ({ code, name, address: null, parentId: null, status: 'Active' as const, description: null, ...extra });
    const appliances = await book.create('categories', entry('CAT-APP', 'Appliances'), lineage);
    const fans = await book.create('categories', entry('CAT-FAN', 'Fans', { parentId: appliances.id }), lineage);
    const hanabishi = await book.create('brands', entry('HANABISHI', 'Hanabishi'), lineage);
    const oldBrand = await book.create('brands', entry('OLD', 'Old brand', { status: 'Inactive' }), lineage);
    const supplier = await book.create('suppliers', entry('SUP-001', 'Asia Appliances'), lineage);

    const blank = await loadProductForm(address, pass, null, options);
    if (!blank.ok) throw new Error(blank.message);
    expect(blank.choices).toEqual({
      categoryId: [
        { value: appliances.id, label: 'Appliances' },
        { value: fans.id, label: 'Appliances › Fans' },
      ],
      brandId: [{ value: hanabishi.id, label: 'Hanabishi' }],
      supplierId: [{ value: supplier.id, label: 'Asia Appliances' }],
      manufacturerId: [],
    });

    // Near the most a picture may be, so the server's request limit is proved too (Express's own is 100 KB).
    const picture = jpegText(250 * 1024);
    const form = {
      ...blank.form,
      code: 'HNB-SF16',
      name: 'Hanabishi stand fan 16"',
      retailPrice: '1899',
      categoryId: fans.id,
      brandId: hanabishi.id,
      supplierId: supplier.id,
      unitOfMeasure: 'pc',
      costPrice: '1450',
      promoPrice: '1699',
      wholesalePrice: '1599',
      wholesaleQuantity: '10',
      hasWarranty: true,
      warrantyMonths: '12',
      picture,
    };
    const saved = await saveProductForm(address, pass, null, form, options);
    if (!saved.ok) throw new Error(saved.message);
    expect(saved.product).toMatchObject({ categoryId: fans.id, costPrice: 145000, promoPrice: 169900, wholesaleQuantity: 10, warrantyMonths: 12, hasPicture: true });

    const editing = await loadProductForm(address, pass, saved.product.id, options);
    expect(editing).toMatchObject({ ok: true, form: { ...form, retailPrice: '1899.00', costPrice: '1450.00', promoPrice: '1699.00', wholesalePrice: '1599.00' } });

    // A brand switched off since is still offered to the product that has it, said so; never to another.
    await saveProductForm(address, pass, saved.product.id, { ...form, brandId: oldBrand.id }, options);
    const withOld = await loadProductForm(address, pass, saved.product.id, options);
    expect(withOld.ok && withOld.choices.brandId).toEqual([
      { value: hanabishi.id, label: 'Hanabishi' },
      { value: oldBrand.id, label: 'Old brand (switched off)' },
    ]);

    // Anyone who may see products may see the picture; without one, it's none.
    const cashier = as('cashier');
    expect(await getProductPicture(address, cashier.pass, saved.product.id, cashier.options)).toEqual({ ok: true, picture });
    await saveProductForm(address, pass, saved.product.id, { ...form, picture: '' }, options);
    expect(await getProductPicture(address, cashier.pass, saved.product.id, cashier.options)).toEqual({ ok: true, picture: null });
    expect(await getProduct(address, cashier.pass, saved.product.id, cashier.options)).toMatchObject({ ok: true, product: { hasPicture: false } });
    const guest = as('guest');
    expect(await getProductPicture(address, guest.pass, saved.product.id, guest.options)).toEqual({
      ok: false,
      reason: 'not-allowed',
      message: lacksRight('products.view'),
    });
    expect(await getProductPicture(address, pass, randomUUID(), options)).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('refuses a picture that is not whole or not a JPEG, a choice that has gone, and a price it cannot read', async () => {
    const { pass } = as('admin');
    const post = (body: unknown) =>
      httpsJson(address + ProductsPath, { ca: certificate.cert, method: 'POST', body, headers: { Authorization: `Bearer ${pass.token}` } });
    const fields = { ...rice, code: 'PRD-0200', barcode: null, retailPrice: '100.00', costPrice: '0.00' };
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
    expect(await post({ ...fields, picture: 'not base64!' })).toMatchObject({ status: 400, body: { message: "The product's picture didn't arrive whole." } });
    expect(await post({ ...fields, picture: png })).toMatchObject({ status: 400, body: { message: "A product's picture has to be a JPEG." } });
    expect(await post({ ...fields, brandId: randomUUID() })).toMatchObject({ status: 400, body: { message: "That brand isn't there any more. Choose another." } });
    expect(await post({ ...fields, costPrice: '1.234' })).toMatchObject({ status: 400, body: { message: 'The cost "1.234" isn\'t a price.' } });
    expect(await post({ ...fields, promoPrice: '150.00' })).toMatchObject({ status: 400, body: { message: 'A promo price has to be below the shelf price (₱100.00).' } });
    expect(await db.product.count({ where: { code: 'PRD-0200' } })).toBe(0);
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
